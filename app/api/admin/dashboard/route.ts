import { NextResponse } from "next/server";
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
import { auth } from "@/lib/auth";
import { getCrmMetrics } from "@/lib/crm/metrics";

interface DashboardData {
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
    type:
      | "deal_stage_change"
      | "reply_received"
      | "newsletter_sent"
      | "contact_created"
      | "meeting_booked";
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

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!session.user.role || !["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    // Run all queries in parallel
    const [
      crmMetrics,
      contactsCountResult,
      repliesCountResult,
      meetingsBookedResult,
      newsletterCountsResult,
      editionsResult,
      campaignsResult,
      intelligenceResult,
      recentContactsResult,
      recentEditionsResult,
      recentRepliesResult,
      topSourcesResult,
      topUtmCampaignsResult,
      stalledDealsResult,
    ] = await Promise.all([
      // 1. CRM metrics via existing function
      getCrmMetrics().catch(() => null),

      // 2. Total contacts count
      db.select({ count: sql<number>`count(*)::int` }).from(contacts),

      // 3. Total outreach replies count
      db.select({ count: sql<number>`count(*)::int` }).from(outreachReplies),

      // 5. Meetings booked - deals in "Meeting Booked" stage
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(deals)
        .innerJoin(stages, eq(deals.stageId, stages.id))
        .where(eq(stages.name, "Meeting Booked")),

      // 6-8. All three newsletter subscriber counts in one scan (avoids 3 separate
      // sequential scans that were causing statement timeouts under pool pressure)
      db.execute(sql`
        SELECT
          count(*) FILTER (WHERE verified = true AND unsubscribed = false)::int AS active_subscribers,
          count(*) FILTER (WHERE verified = true AND unsubscribed = false)::int AS verified,
          count(*) FILTER (WHERE unsubscribed = true)::int                      AS unsubscribed
        FROM newsletter_subscribers
      `),

      // 9. Newsletter editions stats — aggregated in SQL over a bounded window
      db.execute(sql`
        SELECT
          COALESCE(SUM(delivered), 0)::int AS total_sent,
          COUNT(*) FILTER (WHERE delivered > 0)::int AS editions_with_stats,
          COALESCE(SUM(CASE WHEN delivered > 0 THEN opens::float / delivered ELSE 0 END), 0)::float AS total_open_rate,
          COALESCE(SUM(CASE WHEN delivered > 0 THEN clicks::float / delivered ELSE 0 END), 0)::float AS total_click_rate
        FROM (
          SELECT
            COALESCE((stats->>'totalDelivered')::int, (stats->>'totalSent')::int, 0) AS delivered,
            COALESCE((stats->>'totalOpens')::int, 0) AS opens,
            COALESCE((stats->>'totalClicks')::int, 0) AS clicks
          FROM newsletter_editions
          WHERE status = 'sent'
            AND sent_at > now() - interval '365 days'
        ) s
      `),

      // 10. Outreach campaigns
      db
        .select({
          status: outreachCampaigns.status,
          totalSent: outreachCampaigns.totalSent,
          totalReplied: outreachCampaigns.totalReplied,
        })
        .from(outreachCampaigns),

      // 11. Email intelligence — aggregated in SQL over last 90 days
      db.execute(sql`
        SELECT
          count(*) FILTER (WHERE sentiment = 'positive')::int AS positive,
          count(*) FILTER (WHERE sentiment = 'neutral')::int  AS neutral,
          count(*) FILTER (WHERE sentiment = 'negative')::int AS negative,
          count(*) FILTER (WHERE intent = 'other' AND sentiment = 'neutral')::int AS auto_reply,
          count(*) FILTER (
            WHERE is_read = false
              AND is_archived = false
              AND (sentiment = 'positive' OR intent = 'interested')
          )::int AS high_intent_follow_ups,
          count(*) FILTER (WHERE crm_deal_id IS NOT NULL)::int AS deals_created_from_replies,
          COALESCE(
            AVG(EXTRACT(EPOCH FROM (created_at - received_at)))
              FILTER (WHERE received_at IS NOT NULL AND created_at > received_at),
            0
          )::float AS avg_response_seconds,
          count(*) FILTER (WHERE received_at IS NOT NULL AND created_at > received_at)::int AS response_time_count
        FROM outreach_replies
        WHERE created_at > now() - interval '90 days'
      `),

      // 12. Recent contacts for activity feed
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

      // 13. Recent newsletter editions for activity feed
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

      // 14. Recent replies for activity feed (with contact join)
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

      // 15a. Top sources (aggregated in SQL, top 5 by contact count)
      db.execute(sql`
        SELECT
          COALESCE(c.source, 'Unknown') AS source,
          count(DISTINCT c.id)::int      AS contact_count,
          count(d.id)::int               AS deal_count,
          COALESCE(SUM(d.amount), 0)::float AS revenue
        FROM contacts c
        LEFT JOIN deals d ON d.contact_id = c.id
        GROUP BY COALESCE(c.source, 'Unknown')
        ORDER BY contact_count DESC
        LIMIT 5
      `),

      // 15b. Top UTM campaigns (aggregated in SQL, top 5 by contact count)
      db.execute(sql`
        SELECT
          c.original_utm_campaign        AS campaign,
          count(DISTINCT c.id)::int      AS contact_count,
          COALESCE(SUM(d.amount), 0)::float AS revenue
        FROM contacts c
        LEFT JOIN deals d ON d.contact_id = c.id
        WHERE c.original_utm_campaign IS NOT NULL
        GROUP BY c.original_utm_campaign
        ORDER BY contact_count DESC
        LIMIT 5
      `),

      // 16. Stalled deals (no activity in 30 days)
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

    // Meeting stage value
    const meetingStage = pipeline.find(
      (s) => s.slug === "meeting-booked" || s.stage === "Meeting Booked",
    );
    const pipelineInsights = {
      stalledDeals: stalledDealsResult[0]?.count ?? 0,
      meetingStageValue: meetingStage?.value ?? 0,
    };

    // === Build Newsletter ===
    const editionAgg = editionsResult[0] as unknown as
      | {
          total_sent: number;
          editions_with_stats: number;
          total_open_rate: number;
          total_click_rate: number;
        }
      | undefined;
    const totalSentNewsletter = editionAgg?.total_sent ?? 0;
    const editionsWithStats = editionAgg?.editions_with_stats ?? 0;
    const totalOpenRate = editionAgg?.total_open_rate ?? 0;
    const totalClickRate = editionAgg?.total_click_rate ?? 0;

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
    const intelligenceAgg = intelligenceResult[0] as unknown as
      | {
          positive: number;
          neutral: number;
          negative: number;
          auto_reply: number;
          high_intent_follow_ups: number;
          deals_created_from_replies: number;
          avg_response_seconds: number;
          response_time_count: number;
        }
      | undefined;

    const emailIntelligence = {
      positive: intelligenceAgg?.positive ?? 0,
      neutral: intelligenceAgg?.neutral ?? 0,
      negative: intelligenceAgg?.negative ?? 0,
      autoReply: intelligenceAgg?.auto_reply ?? 0,
      actionItems: {
        highIntentFollowUps: intelligenceAgg?.high_intent_follow_ups ?? 0,
        dealsCreatedFromReplies: intelligenceAgg?.deals_created_from_replies ?? 0,
        avgResponseTimeHours:
          intelligenceAgg && intelligenceAgg.response_time_count > 0
            ? Math.round((intelligenceAgg.avg_response_seconds / 3600) * 10) / 10
            : null,
      },
    };

    // === Build Recent Activity ===
    const activityItems: DashboardData["recentActivity"] = [];

    // CRM deal stage changes
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

    // Recent replies
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

    // Recent newsletter sends
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

    // Recent contacts
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

    // Sort by timestamp descending and take top 10
    activityItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const recentActivity = activityItems.slice(0, 10);

    // === Build Source Attribution (aggregated in SQL) ===
    const topSourcesRows = topSourcesResult as unknown as Array<{
      source: string;
      contact_count: number;
      deal_count: number;
      revenue: number;
    }>;

    const sourceAttribution = topSourcesRows.map((row) => ({
      source: row.source.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
      contactCount: row.contact_count,
      dealCount: row.deal_count,
      revenue: row.revenue,
      conversionRate:
        row.contact_count > 0 ? Math.round((row.deal_count / row.contact_count) * 1000) / 10 : 0,
    }));

    // === Build Top UTM Campaigns (aggregated in SQL) ===
    const topUtmRows = topUtmCampaignsResult as unknown as Array<{
      campaign: string;
      contact_count: number;
      revenue: number;
    }>;

    const topUtmCampaigns = topUtmRows.map((row) => ({
      campaign: row.campaign,
      contactCount: row.contact_count,
      revenue: row.revenue,
    }));

    // === Assemble Response ===
    const data: DashboardData = {
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

    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
