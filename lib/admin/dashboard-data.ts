/**
 * Dashboard data fetcher for the admin dashboard page.
 * Queries are run directly (no caching layer) since unstable_cache
 * is broken in Next.js 16+. Data is fetched fresh on each request.
 */

import { cache } from "react";
import { db } from "@/lib/db";
import {
  contacts,
  deals,
  newsletterEditions,
  outreachCampaigns,
  outreachReplies,
  outreachContacts,
  stages,
} from "@/lib/db/schema";
import { eq, and, sql, lt, isNotNull } from "drizzle-orm";
import { getCrmMetrics } from "@/lib/crm/metrics";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      timer = setTimeout(() => {
        console.warn(`[Dashboard] Query timed out after ${ms}ms, using fallback`);
        resolve(fallback);
      }, ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

const getSharedCrmMetrics = cache(() => getCrmMetrics().catch(() => null));

export interface DashboardData {
  kpi: {
    activeDeals: number;
    revenuePotential: number;
    totalContacts: number;
    emailReplyRate: number;
    meetingsBooked: number;
  };
  pipeline: Array<{
    stage: string;
    slug: string;
    color: string;
    count: number;
    value: number;
  }>;
  pipelineInsights: {
    stalledDeals: number;
    meetingStageValue: number;
  };
  newsletter: {
    totalSubscribers: number;
    verified: number;
    totalSent: number;
    unsubscribed: number;
    openRate: number;
    clickRate: number;
  };
  outreach: {
    activeCampaigns: number;
    totalSent: number;
    totalReplies: number;
    replyRate: number;
    byStatus: { draft: number; active: number; paused: number; completed: number };
  };
  emailIntelligence: {
    positive: number;
    neutral: number;
    negative: number;
    autoReply: number;
    actionItems: {
      highIntentFollowUps: number;
      dealsCreatedFromReplies: number;
      avgResponseTimeHours: number | null;
    };
  };
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    detail?: string;
    timestamp: string;
    color: string;
    icon: string;
  }>;
  sourceAttribution: Array<{
    source: string;
    contactCount: number;
    dealCount: number;
    revenue: number;
    conversionRate: number;
  }>;
  topUtmCampaigns: Array<{
    campaign: string;
    contactCount: number;
    revenue: number;
  }>;
}

async function fetchDashboardDataUncached(): Promise<DashboardData> {
  // Run queries in sequential batches to avoid connection pool starvation.
  // Firing 15 queries simultaneously on a pool of 10 connections deadlocks
  // when other requests (session checks, settings API) hold connections.

  // Batch 1: CRM metrics + counts in parallel (CRM metrics no longer blocks everything)
  const [
    crmMetrics,
    contactsCountResult,
    repliesCountResult,
    meetingsBookedResult,
    newsletterCountsResult,
  ] = await Promise.all([
    getCrmMetrics().catch(() => null),
    db.select({ count: sql<number>`count(*)::int` }).from(contacts),
    db.select({ count: sql<number>`count(*)::int` }).from(outreachReplies),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(deals)
      .innerJoin(stages, eq(deals.stageId, stages.id))
      .where(eq(stages.name, "Meeting Booked")),
    // Single scan across newsletter_subscribers for all three counts (avoids 3 separate
    // sequential scans that were causing statement timeouts under connection pool pressure)
    db.execute(sql`
      SELECT
        count(*) FILTER (WHERE verified = true AND unsubscribed = false)::int AS active_subscribers,
        count(*) FILTER (WHERE verified = true AND unsubscribed = false)::int AS verified,
        count(*) FILTER (WHERE unsubscribed = true)::int                      AS unsubscribed
      FROM newsletter_subscribers
    `),
  ]);

  // Batch 2: all non-critical data in a single Promise.allSettled so individual
  // failures don't break the entire dashboard. Partial data is better than none.
  const [
    editionsSettled,
    campaignsSettled,
    intelligenceSettled,
    recentContactsSettled,
    recentEditionsSettled,
    recentRepliesSettled,
    contactsBySourceSettled,
    dealsBySourceSettled,
    utmCampaignsSettled,
    stalledDealsSettled,
  ] = await Promise.allSettled([
    db
      .select({
        stats: newsletterEditions.stats,
        sentAt: newsletterEditions.sentAt,
        subject: newsletterEditions.subject,
      })
      .from(newsletterEditions)
      .where(eq(newsletterEditions.status, "sent")),
    db
      .select({
        status: outreachCampaigns.status,
        totalSent: outreachCampaigns.totalSent,
        totalReplied: outreachCampaigns.totalReplied,
      })
      .from(outreachCampaigns),
    db
      .select({
        sentiment: outreachReplies.sentiment,
        intent: outreachReplies.intent,
        isRead: outreachReplies.isRead,
        isArchived: outreachReplies.isArchived,
        crmDealId: outreachReplies.crmDealId,
        receivedAt: outreachReplies.receivedAt,
        createdAt: outreachReplies.createdAt,
        replySentAt: outreachReplies.replySentAt,
      })
      .from(outreachReplies)
      .limit(10000),
    db
      .select({
        id: contacts.id,
        email: contacts.email,
        source: contacts.source,
        createdAt: contacts.createdAt,
      })
      .from(contacts)
      .orderBy(sql`${contacts.createdAt} DESC`)
      .limit(5),
    db
      .select({
        id: newsletterEditions.id,
        subject: newsletterEditions.subject,
        sentAt: newsletterEditions.sentAt,
        stats: newsletterEditions.stats,
      })
      .from(newsletterEditions)
      .where(eq(newsletterEditions.status, "sent"))
      .orderBy(sql`${newsletterEditions.sentAt} DESC`)
      .limit(5),
    db
      .select({
        id: outreachReplies.id,
        fromEmail: outreachReplies.fromEmail,
        sentiment: outreachReplies.sentiment,
        receivedAt: outreachReplies.receivedAt,
        contactFirstName: outreachContacts.firstName,
        contactLastName: outreachContacts.lastName,
      })
      .from(outreachReplies)
      .leftJoin(outreachContacts, eq(outreachReplies.contactId, outreachContacts.id))
      .orderBy(sql`${outreachReplies.receivedAt} DESC`)
      .limit(5),
    // Lightweight: contacts grouped by source (no json_agg, no JOIN)
    db.execute(sql`
      SELECT source, count(*)::int AS contact_count
      FROM contacts
      GROUP BY source
      LIMIT 20
    `),
    // Lightweight: deals grouped by source (no contact join)
    db.execute(sql`
      SELECT d.source, count(*)::int AS deal_count, coalesce(sum(d.amount), 0)::numeric AS revenue
      FROM deals d
      GROUP BY d.source
    `),
    // UTM campaigns aggregated at DB level
    db.execute(sql`
      SELECT c.original_utm_campaign AS campaign,
        count(c.id)::int AS contact_count,
        coalesce(sum(d.amount), 0)::numeric AS revenue
      FROM contacts c
      LEFT JOIN deals d ON d.contact_id = c.id
      WHERE c.original_utm_campaign IS NOT NULL
      GROUP BY c.original_utm_campaign
      ORDER BY count(c.id) DESC
      LIMIT 5
    `),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(deals)
      .where(
        and(
          lt(deals.updatedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
          isNotNull(deals.stageId),
        ),
      ),
  ]);

  const editionsResult = editionsSettled.status === "fulfilled" ? editionsSettled.value : [];
  const campaignsResult = campaignsSettled.status === "fulfilled" ? campaignsSettled.value : [];
  const intelligenceResult =
    intelligenceSettled.status === "fulfilled" ? intelligenceSettled.value : [];
  const recentContactsResult =
    recentContactsSettled.status === "fulfilled" ? recentContactsSettled.value : [];
  const recentEditionsResult =
    recentEditionsSettled.status === "fulfilled" ? recentEditionsSettled.value : [];
  const recentRepliesResult =
    recentRepliesSettled.status === "fulfilled" ? recentRepliesSettled.value : [];
  const contactsBySourceResult =
    contactsBySourceSettled.status === "fulfilled" ? contactsBySourceSettled.value : [];
  const dealsBySourceResult =
    dealsBySourceSettled.status === "fulfilled" ? dealsBySourceSettled.value : [];
  const utmCampaignsResult =
    utmCampaignsSettled.status === "fulfilled" ? utmCampaignsSettled.value : [];
  const stalledDealsResult =
    stalledDealsSettled.status === "fulfilled" ? stalledDealsSettled.value : [{ count: 0 }];

  // === Build KPI ===
  const activeDeals = crmMetrics?.activeDeals ?? 0;
  const revenuePotential = crmMetrics?.pipelineValue ?? 0;
  const totalContacts = contactsCountResult[0]?.count ?? 0;
  const totalRepliesCount = repliesCountResult[0]?.count ?? 0;
  const totalOutreachSent = campaignsResult.reduce((sum, c) => sum + (c.totalSent ?? 0), 0) || 1;
  const emailReplyRate =
    totalRepliesCount > 0 ? Math.round((totalRepliesCount / totalOutreachSent) * 1000) / 10 : 0;
  const meetingsBookedCount = meetingsBookedResult[0]?.count ?? 0;

  // === Build Pipeline ===
  const pipeline = (crmMetrics?.dealsByStage ?? []).map((s) => ({
    stage: s.stage,
    slug: s.slug,
    color: s.color,
    count: s.count,
    value: s.value,
  }));

  const meetingStage = pipeline.find(
    (s) => s.slug === "meeting-booked" || s.stage === "Meeting Booked",
  );
  const pipelineInsights = {
    stalledDeals: stalledDealsResult[0]?.count ?? 0,
    meetingStageValue: meetingStage?.value ?? 0,
  };

  // === Build Newsletter ===
  const editions = editionsResult;
  let totalSentNewsletter = 0;
  let totalOpenRate = 0;
  let totalClickRate = 0;
  let editionsWithStats = 0;

  editions.forEach((edition) => {
    const stats = edition.stats as Record<string, number> | null;
    const delivered = stats?.totalDelivered || stats?.totalSent || 0;
    const opens = stats?.totalOpens || 0;
    const clicks = stats?.totalClicks || 0;

    totalSentNewsletter += delivered;

    if (delivered > 0) {
      totalOpenRate += opens / delivered;
      totalClickRate += clicks / delivered;
      editionsWithStats++;
    }
  });

  const newsletterCounts = newsletterCountsResult[0] as unknown as
    | {
        active_subscribers: number;
        verified: number;
        unsubscribed: number;
      }
    | undefined;

  const newsletter = {
    totalSubscribers: newsletterCounts?.active_subscribers ?? 0,
    verified: newsletterCounts?.verified ?? 0,
    totalSent: totalSentNewsletter,
    unsubscribed: newsletterCounts?.unsubscribed ?? 0,
    openRate:
      editionsWithStats > 0 ? Math.round((totalOpenRate / editionsWithStats) * 1000) / 10 : 0,
    clickRate:
      editionsWithStats > 0 ? Math.round((totalClickRate / editionsWithStats) * 1000) / 10 : 0,
  };

  // === Build Outreach ===
  const campaigns = campaignsResult;
  const byStatus = { draft: 0, active: 0, paused: 0, completed: 0 };
  let outreachTotalSent = 0;
  let outreachTotalReplies = 0;

  campaigns.forEach((c) => {
    const status = c.status as keyof typeof byStatus;
    if (status in byStatus) {
      byStatus[status]++;
    }
    outreachTotalSent += c.totalSent ?? 0;
    outreachTotalReplies += c.totalReplied ?? 0;
  });

  const outreach = {
    activeCampaigns: byStatus.active,
    totalSent: outreachTotalSent,
    totalReplies: outreachTotalReplies,
    replyRate:
      outreachTotalSent > 0
        ? Math.round((outreachTotalReplies / outreachTotalSent) * 1000) / 10
        : 0,
    byStatus,
  };

  // === Build Email Intelligence ===
  const intelligenceData = intelligenceResult;
  let positive = 0;
  let neutral = 0;
  let negative = 0;
  let autoReply = 0;
  let highIntentFollowUps = 0;
  let dealsCreatedFromReplies = 0;
  let totalResponseTime = 0;
  let responseTimeCount = 0;

  intelligenceData.forEach((r) => {
    if (r.sentiment === "positive") positive++;
    else if (r.sentiment === "neutral") neutral++;
    else if (r.sentiment === "negative") negative++;

    if (r.intent === "other" && r.sentiment === "neutral") autoReply++;
    if (!r.isRead && !r.isArchived && (r.intent === "schedule_call" || r.intent === "wants_info")) {
      highIntentFollowUps++;
    }

    if (r.crmDealId) dealsCreatedFromReplies++;

    if (r.replySentAt && r.receivedAt) {
      const diff = new Date(r.replySentAt).getTime() - new Date(r.receivedAt).getTime();
      if (diff > 0) {
        totalResponseTime += diff;
        responseTimeCount++;
      }
    }
  });

  const emailIntelligence = {
    positive,
    neutral,
    negative,
    autoReply,
    actionItems: {
      highIntentFollowUps,
      dealsCreatedFromReplies,
      avgResponseTimeHours:
        responseTimeCount > 0
          ? Math.round((totalResponseTime / responseTimeCount / 3600000) * 10) / 10
          : null,
    },
  };

  // === Build Recent Activity ===
  const activityItems: DashboardData["recentActivity"] = [];

  (crmMetrics?.recentActivity ?? []).forEach((a) => {
    const fromLabel = a.fromStage ? ` from ${a.fromStage.name}` : "";
    activityItems.push({
      id: a.id,
      type: "deal_stage_change",
      description: `${a.dealName} → ${a.toStage.name}`,
      detail: `Moved${fromLabel}`,
      timestamp: a.changedAt,
      color: a.toStage.color,
      icon: "IconCurrencyDollar",
    });
  });

  recentRepliesResult.forEach((r) => {
    const name =
      r.contactFirstName || r.contactLastName
        ? `${r.contactFirstName ?? ""} ${r.contactLastName ?? ""}`.trim()
        : r.fromEmail;
    const sentimentLabel = r.sentiment
      ? ` (${r.sentiment.charAt(0).toUpperCase() + r.sentiment.slice(1)})`
      : "";

    activityItems.push({
      id: r.id,
      type: "reply_received",
      description: `${name} replied${sentimentLabel}`,
      timestamp: r.receivedAt,
      color:
        r.sentiment === "positive"
          ? "var(--chart-2)"
          : r.sentiment === "negative"
            ? "var(--destructive)"
            : "var(--muted)",
      icon: "IconMessageCircle",
    });
  });

  recentEditionsResult.forEach((e) => {
    const stats = e.stats as Record<string, number> | null;
    const recipients = stats?.totalRecipients || stats?.totalSent || 0;

    activityItems.push({
      id: e.id,
      type: "newsletter_sent",
      description: `Newsletter sent to ${recipients.toLocaleString()} subscribers`,
      detail: e.subject ?? undefined,
      timestamp: e.sentAt ?? new Date().toISOString(),
      color: "var(--muted)",
      icon: "IconMail",
    });
  });

  recentContactsResult.forEach((c) => {
    activityItems.push({
      id: c.id,
      type: "contact_created",
      description: `New contact: ${c.email}`,
      detail: `Source: ${c.source.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase())}`,
      timestamp: c.createdAt ?? new Date().toISOString(),
      color: "var(--foreground)",
      icon: "IconUsers",
    });
  });

  activityItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const recentActivity = activityItems.slice(0, 5);

  // === Build Source Attribution ===
  // Join the two lightweight queries (contacts by source + deals by source) in JS
  const contactsBySource = contactsBySourceResult as unknown as Array<{
    source: string;
    contact_count: number;
  }>;
  const dealsBySource = dealsBySourceResult as unknown as Array<{
    source: string;
    deal_count: number;
    revenue: number;
  }>;

  const dealsMap = new Map<string, { dealCount: number; revenue: number }>();
  dealsBySource.forEach((d) => {
    dealsMap.set(d.source || "Unknown", {
      dealCount: d.deal_count,
      revenue: Number(d.revenue) || 0,
    });
  });

  const sourceAttribution = contactsBySource
    .map((c) => {
      const source = c.source || "Unknown";
      const dealsData = dealsMap.get(source) ?? { dealCount: 0, revenue: 0 };
      return {
        source: source.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
        contactCount: c.contact_count,
        dealCount: dealsData.dealCount,
        revenue: dealsData.revenue,
        conversionRate:
          c.contact_count > 0 ? Math.round((dealsData.dealCount / c.contact_count) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.contactCount - a.contactCount)
    .slice(0, 5);

  // === Build Top UTM Campaigns ===
  const utmCampaigns = utmCampaignsResult as unknown as Array<{
    campaign: string;
    contact_count: number;
    revenue: number;
  }>;

  const topUtmCampaigns = utmCampaigns.map((row) => ({
    campaign: row.campaign,
    contactCount: row.contact_count,
    revenue: Number(row.revenue) || 0,
  }));

  return {
    kpi: {
      activeDeals,
      revenuePotential,
      totalContacts,
      emailReplyRate,
      meetingsBooked: meetingsBookedCount,
    },
    pipeline,
    pipelineInsights,
    newsletter,
    outreach,
    emailIntelligence,
    recentActivity,
    sourceAttribution,
    topUtmCampaigns,
  };
}

/**
 * Dashboard data fetcher.
 */
export const getDashboardData = fetchDashboardDataUncached;

// ---------------------------------------------------------------------------
// Granular section fetchers — used by progressive Suspense boundaries on the
// dashboard page. Each function fetches only the queries needed for its
// section, allowing faster sections to paint before slower ones complete.
// ---------------------------------------------------------------------------

/** Fast (~100-200ms): KPI counts + pipeline stages + pipeline insights. */
export const getDashboardKpi = cache(async function getDashboardKpi(): Promise<{
  kpi: DashboardData["kpi"];
  pipeline: DashboardData["pipeline"];
  pipelineInsights: DashboardData["pipelineInsights"];
}> {
  const [
    crmMetrics,
    contactsCountResult,
    repliesCountResult,
    meetingsBookedResult,
    stalledDealsResult,
    campaignsSample,
  ] = await Promise.all([
    withTimeout(getSharedCrmMetrics(), 9000, null),
    withTimeout(db.select({ count: sql<number>`count(*)::int` }).from(contacts), 8000, [
      { count: 0 },
    ]),
    withTimeout(db.select({ count: sql<number>`count(*)::int` }).from(outreachReplies), 8000, [
      { count: 0 },
    ]),
    withTimeout(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(deals)
        .innerJoin(stages, eq(deals.stageId, stages.id))
        .where(eq(stages.name, "Meeting Booked")),
      8000,
      [{ count: 0 }],
    ),
    withTimeout(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(deals)
        .where(
          and(
            lt(deals.updatedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
            isNotNull(deals.stageId),
          ),
        ),
      8000,
      [{ count: 0 }],
    ),
    withTimeout(
      db
        .select({ totalSent: outreachCampaigns.totalSent })
        .from(outreachCampaigns)
        .catch(() => []),
      8000,
      [] as Array<{ totalSent: number | null }>,
    ),
  ]);

  const totalContacts = contactsCountResult[0]?.count ?? 0;
  const totalRepliesCount = repliesCountResult[0]?.count ?? 0;
  const meetingsBookedCount = meetingsBookedResult[0]?.count ?? 0;
  const totalOutreachSent = campaignsSample.reduce((sum, c) => sum + (c.totalSent ?? 0), 0) || 1;
  const emailReplyRate =
    totalRepliesCount > 0 ? Math.round((totalRepliesCount / totalOutreachSent) * 1000) / 10 : 0;

  const pipeline = (crmMetrics?.dealsByStage ?? []).map((s) => ({
    stage: s.stage,
    slug: s.slug,
    color: s.color,
    count: s.count,
    value: s.value,
  }));

  const meetingStage = pipeline.find(
    (s) => s.slug === "meeting-booked" || s.stage === "Meeting Booked",
  );

  return {
    kpi: {
      activeDeals: crmMetrics?.activeDeals ?? 0,
      revenuePotential: crmMetrics?.pipelineValue ?? 0,
      totalContacts,
      emailReplyRate,
      meetingsBooked: meetingsBookedCount,
    },
    pipeline,
    pipelineInsights: {
      stalledDeals: (stalledDealsResult as Array<{ count: number }>)[0]?.count ?? 0,
      meetingStageValue: meetingStage?.value ?? 0,
    },
  };
});

/** Medium (~300-500ms): newsletter subscriber stats + outreach campaign metrics. */
export async function getDashboardChannels(): Promise<{
  newsletter: DashboardData["newsletter"];
  outreach: DashboardData["outreach"];
}> {
  const [editionsSettled, campaignsSettled, newsletterCountsResult] = await Promise.all([
    withTimeout(
      db
        .select({ stats: newsletterEditions.stats })
        .from(newsletterEditions)
        .where(eq(newsletterEditions.status, "sent"))
        .catch(() => []),
      8000,
      [],
    ),
    withTimeout(
      db
        .select({
          status: outreachCampaigns.status,
          totalSent: outreachCampaigns.totalSent,
          totalReplied: outreachCampaigns.totalReplied,
        })
        .from(outreachCampaigns)
        .catch(() => []),
      8000,
      [],
    ),
    withTimeout<Array<{ active_subscribers: number; verified: number; unsubscribed: number }>>(
      db
        .execute(sql`
      SELECT
        count(*) FILTER (WHERE verified = true AND unsubscribed = false)::int AS active_subscribers,
        count(*) FILTER (WHERE verified = true AND unsubscribed = false)::int AS verified,
        count(*) FILTER (WHERE unsubscribed = true)::int                      AS unsubscribed
      FROM newsletter_subscribers
    `)
        .then(
          (rows) =>
            rows as unknown as Array<{
              active_subscribers: number;
              verified: number;
              unsubscribed: number;
            }>,
        )
        .catch(() => []),
      8000,
      [],
    ),
  ]);

  const editions = editionsSettled;
  let totalSentNewsletter = 0;
  let totalOpenRate = 0;
  let totalClickRate = 0;
  let editionsWithStats = 0;

  editions.forEach((edition) => {
    const stats = edition.stats as Record<string, number> | null;
    const delivered = stats?.totalDelivered || stats?.totalSent || 0;
    const opens = stats?.totalOpens || 0;
    const clicks = stats?.totalClicks || 0;
    totalSentNewsletter += delivered;
    if (delivered > 0) {
      totalOpenRate += opens / delivered;
      totalClickRate += clicks / delivered;
      editionsWithStats++;
    }
  });

  const newsletterCounts = newsletterCountsResult[0] as unknown as
    | { active_subscribers: number; verified: number; unsubscribed: number }
    | undefined;

  const campaigns = campaignsSettled;
  const byStatus = { draft: 0, active: 0, paused: 0, completed: 0 };
  let outreachTotalSent = 0;
  let outreachTotalReplies = 0;

  campaigns.forEach((c) => {
    const status = c.status as keyof typeof byStatus;
    if (status in byStatus) byStatus[status]++;
    outreachTotalSent += c.totalSent ?? 0;
    outreachTotalReplies += c.totalReplied ?? 0;
  });

  return {
    newsletter: {
      totalSubscribers: newsletterCounts?.active_subscribers ?? 0,
      verified: newsletterCounts?.verified ?? 0,
      totalSent: totalSentNewsletter,
      unsubscribed: newsletterCounts?.unsubscribed ?? 0,
      openRate:
        editionsWithStats > 0 ? Math.round((totalOpenRate / editionsWithStats) * 1000) / 10 : 0,
      clickRate:
        editionsWithStats > 0 ? Math.round((totalClickRate / editionsWithStats) * 1000) / 10 : 0,
    },
    outreach: {
      activeCampaigns: byStatus.active,
      totalSent: outreachTotalSent,
      totalReplies: outreachTotalReplies,
      replyRate:
        outreachTotalSent > 0
          ? Math.round((outreachTotalReplies / outreachTotalSent) * 1000) / 10
          : 0,
      byStatus,
    },
  };
}

/** Slower (~500ms-1s): email intelligence sentiment + source attribution + UTM campaigns. */
export async function getDashboardInsights(): Promise<{
  emailIntelligence: DashboardData["emailIntelligence"];
  sourceAttribution: DashboardData["sourceAttribution"];
  topUtmCampaigns: DashboardData["topUtmCampaigns"];
}> {
  const [intelligenceSettled, contactsBySourceSettled, dealsBySourceSettled, utmCampaignsSettled] =
    await Promise.allSettled([
      withTimeout(
        db
          .select({
            sentiment: outreachReplies.sentiment,
            intent: outreachReplies.intent,
            isRead: outreachReplies.isRead,
            isArchived: outreachReplies.isArchived,
            crmDealId: outreachReplies.crmDealId,
            receivedAt: outreachReplies.receivedAt,
            createdAt: outreachReplies.createdAt,
            replySentAt: outreachReplies.replySentAt,
          })
          .from(outreachReplies)
          .limit(10000),
        8000,
        [],
      ),
      withTimeout<Array<{ source: string; contact_count: number }>>(
        db
          .execute(sql`
        SELECT source, count(*)::int AS contact_count
        FROM contacts
        GROUP BY source
        LIMIT 20
      `)
          .then((rows) => rows as unknown as Array<{ source: string; contact_count: number }>),
        8000,
        [],
      ),
      withTimeout<Array<{ source: string; deal_count: number; revenue: number }>>(
        db
          .execute(sql`
        SELECT d.source, count(*)::int AS deal_count, coalesce(sum(d.amount), 0)::numeric AS revenue
        FROM deals d
        GROUP BY d.source
      `)
          .then(
            (rows) =>
              rows as unknown as Array<{ source: string; deal_count: number; revenue: number }>,
          ),
        8000,
        [],
      ),
      withTimeout<Array<{ campaign: string; contact_count: number; revenue: number }>>(
        db
          .execute(sql`
        SELECT c.original_utm_campaign AS campaign,
          count(c.id)::int AS contact_count,
          coalesce(sum(d.amount), 0)::numeric AS revenue
        FROM contacts c
        LEFT JOIN deals d ON d.contact_id = c.id
        WHERE c.original_utm_campaign IS NOT NULL
        GROUP BY c.original_utm_campaign
        ORDER BY count(c.id) DESC
        LIMIT 5
      `)
          .then(
            (rows) =>
              rows as unknown as Array<{
                campaign: string;
                contact_count: number;
                revenue: number;
              }>,
          ),
        8000,
        [],
      ),
    ]);

  const intelligenceData =
    intelligenceSettled.status === "fulfilled" ? intelligenceSettled.value : [];
  const contactsBySourceResult =
    contactsBySourceSettled.status === "fulfilled" ? contactsBySourceSettled.value : [];
  const dealsBySourceResult =
    dealsBySourceSettled.status === "fulfilled" ? dealsBySourceSettled.value : [];
  const utmCampaignsResult =
    utmCampaignsSettled.status === "fulfilled" ? utmCampaignsSettled.value : [];

  let positive = 0;
  let neutral = 0;
  let negative = 0;
  let autoReply = 0;
  let highIntentFollowUps = 0;
  let dealsCreatedFromReplies = 0;
  let totalResponseTime = 0;
  let responseTimeCount = 0;

  intelligenceData.forEach((r) => {
    if (r.sentiment === "positive") positive++;
    else if (r.sentiment === "neutral") neutral++;
    else if (r.sentiment === "negative") negative++;
    if (r.intent === "other" && r.sentiment === "neutral") autoReply++;
    if (!r.isRead && !r.isArchived && (r.intent === "schedule_call" || r.intent === "wants_info")) {
      highIntentFollowUps++;
    }
    if (r.crmDealId) dealsCreatedFromReplies++;
    if (r.replySentAt && r.receivedAt) {
      const diff = new Date(r.replySentAt).getTime() - new Date(r.receivedAt).getTime();
      if (diff > 0) {
        totalResponseTime += diff;
        responseTimeCount++;
      }
    }
  });

  const contactsBySource = contactsBySourceResult as unknown as Array<{
    source: string;
    contact_count: number;
  }>;
  const dealsBySource = dealsBySourceResult as unknown as Array<{
    source: string;
    deal_count: number;
    revenue: number;
  }>;
  const utmCampaigns = utmCampaignsResult as unknown as Array<{
    campaign: string;
    contact_count: number;
    revenue: number;
  }>;

  const dealsMap = new Map<string, { dealCount: number; revenue: number }>();
  dealsBySource.forEach((d) => {
    dealsMap.set(d.source || "Unknown", {
      dealCount: d.deal_count,
      revenue: Number(d.revenue) || 0,
    });
  });

  const sourceAttribution = contactsBySource
    .map((c) => {
      const source = c.source || "Unknown";
      const dealsData = dealsMap.get(source) ?? { dealCount: 0, revenue: 0 };
      return {
        source: source.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
        contactCount: c.contact_count,
        dealCount: dealsData.dealCount,
        revenue: dealsData.revenue,
        conversionRate:
          c.contact_count > 0 ? Math.round((dealsData.dealCount / c.contact_count) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.contactCount - a.contactCount)
    .slice(0, 5);

  return {
    emailIntelligence: {
      positive,
      neutral,
      negative,
      autoReply,
      actionItems: {
        highIntentFollowUps,
        dealsCreatedFromReplies,
        avgResponseTimeHours:
          responseTimeCount > 0
            ? Math.round((totalResponseTime / responseTimeCount / 3600000) * 10) / 10
            : null,
      },
    },
    sourceAttribution,
    topUtmCampaigns: utmCampaigns.map((row) => ({
      campaign: row.campaign,
      contactCount: row.contact_count,
      revenue: Number(row.revenue) || 0,
    })),
  };
}

/** Slowest: recent activity feed (stage history JOIN + reply/contact/edition queries). */
export const getDashboardActivity = cache(async function getDashboardActivity(): Promise<{
  recentActivity: DashboardData["recentActivity"];
}> {
  const [crmMetrics, recentContactsSettled, recentEditionsSettled, recentRepliesSettled] =
    await Promise.all([
      withTimeout(getSharedCrmMetrics(), 10000, null),
      withTimeout(
        db
          .select({
            id: contacts.id,
            email: contacts.email,
            source: contacts.source,
            createdAt: contacts.createdAt,
          })
          .from(contacts)
          .orderBy(sql`${contacts.createdAt} DESC`)
          .limit(5)
          .catch(() => []),
        8000,
        [],
      ),
      withTimeout(
        db
          .select({
            id: newsletterEditions.id,
            subject: newsletterEditions.subject,
            sentAt: newsletterEditions.sentAt,
            stats: newsletterEditions.stats,
          })
          .from(newsletterEditions)
          .where(eq(newsletterEditions.status, "sent"))
          .orderBy(sql`${newsletterEditions.sentAt} DESC`)
          .limit(5)
          .catch(() => []),
        8000,
        [],
      ),
      withTimeout(
        db
          .select({
            id: outreachReplies.id,
            fromEmail: outreachReplies.fromEmail,
            sentiment: outreachReplies.sentiment,
            receivedAt: outreachReplies.receivedAt,
            contactFirstName: outreachContacts.firstName,
            contactLastName: outreachContacts.lastName,
          })
          .from(outreachReplies)
          .leftJoin(outreachContacts, eq(outreachReplies.contactId, outreachContacts.id))
          .orderBy(sql`${outreachReplies.receivedAt} DESC`)
          .limit(5)
          .catch(() => []),
        8000,
        [],
      ),
    ]);

  const activityItems: DashboardData["recentActivity"] = [];

  (crmMetrics?.recentActivity ?? []).forEach((a) => {
    const fromLabel = a.fromStage ? ` from ${a.fromStage.name}` : "";
    activityItems.push({
      id: a.id,
      type: "deal_stage_change",
      description: `${a.dealName} → ${a.toStage.name}`,
      detail: `Moved${fromLabel}`,
      timestamp: a.changedAt,
      color: a.toStage.color,
      icon: "IconCurrencyDollar",
    });
  });

  recentRepliesSettled.forEach((r) => {
    const name =
      r.contactFirstName || r.contactLastName
        ? `${r.contactFirstName ?? ""} ${r.contactLastName ?? ""}`.trim()
        : r.fromEmail;
    const sentimentLabel = r.sentiment
      ? ` (${r.sentiment.charAt(0).toUpperCase() + r.sentiment.slice(1)})`
      : "";
    activityItems.push({
      id: r.id,
      type: "reply_received",
      description: `${name} replied${sentimentLabel}`,
      timestamp: r.receivedAt,
      color:
        r.sentiment === "positive"
          ? "var(--chart-2)"
          : r.sentiment === "negative"
            ? "var(--destructive)"
            : "var(--muted)",
      icon: "IconMessageCircle",
    });
  });

  recentEditionsSettled.forEach((e) => {
    const stats = e.stats as Record<string, number> | null;
    const recipients = stats?.totalRecipients || stats?.totalSent || 0;
    activityItems.push({
      id: e.id,
      type: "newsletter_sent",
      description: `Newsletter sent to ${recipients.toLocaleString()} subscribers`,
      detail: e.subject ?? undefined,
      timestamp: e.sentAt ?? new Date().toISOString(),
      color: "var(--muted)",
      icon: "IconMail",
    });
  });

  recentContactsSettled.forEach((c) => {
    activityItems.push({
      id: c.id,
      type: "contact_created",
      description: `New contact: ${c.email}`,
      detail: `Source: ${c.source.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase())}`,
      timestamp: c.createdAt ?? new Date().toISOString(),
      color: "var(--foreground)",
      icon: "IconUsers",
    });
  });

  activityItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return { recentActivity: activityItems.slice(0, 5) };
});
