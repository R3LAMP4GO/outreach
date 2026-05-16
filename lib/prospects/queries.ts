/**
 * Prospect domain queries.
 *
 * Mirrors the shape of `lib/crm/contacts.ts` so server components / API
 * routes have a consistent surface for list + count work. All queries are
 * server-only and run directly against Drizzle — there is no API layer in
 * between because the prospecting list page is itself a server component.
 */

import "server-only";

import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adminUsers,
  contactTimeline,
  contacts,
  prospectFollowUps,
  prospects,
  videoEngagementEvents,
} from "@/lib/db/schema";
import { sanitizeSearchQuery } from "@/lib/security/input-validation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListProspectsParams {
  /** ILIKE search across businessName / phone / website / city. */
  search?: string;
  /** Filter by `prospects.outreachStage`. */
  stage?: string;
  /** Filter by `prospects.seoReportStatus`. */
  reportStatus?: string;
  /**
   * Filter by `prospects.assignedUserId = currentUser.id`. Pass the current
   * admin's id when the "Assigned to me" toggle is on; pass `null`/omit to
   * skip the filter.
   */
  assignedUserId?: string | null;
  /** 1-based page number. */
  page: number;
  /** Rows per page (capped upstream — we don't re-validate here). */
  limit: number;
}

export interface ProspectListRow {
  id: string;
  businessName: string;
  phone: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  outreachStage: string;
  seoReportStatus: string;
  lastTouchedAt: string | null;
  createdAt: string;
  assignedUserId: string | null;
  assignedUserName: string | null;
  assignedUserEmail: string | null;
  assignedUserAvatarUrl: string | null;
}

export interface ListProspectsResult {
  rows: ProspectListRow[];
  total: number;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List prospects with search, filter, and pagination.
 *
 * Sort: `lastTouchedAt DESC NULLS LAST, createdAt DESC` so the freshest
 * touched records float to the top, with untouched-but-recently-imported
 * prospects right behind them.
 */
export async function listProspects(params: ListProspectsParams): Promise<ListProspectsResult> {
  const { search, stage, reportStatus, assignedUserId, page, limit } = params;

  const conditions = [];

  if (search) {
    const sanitized = sanitizeSearchQuery(search);
    if (sanitized.length === 0) {
      return { rows: [], total: 0, page, limit };
    }
    const pattern = `%${sanitized}%`;
    conditions.push(
      or(
        ilike(prospects.businessName, pattern),
        ilike(prospects.phone, pattern),
        ilike(prospects.website, pattern),
        ilike(prospects.city, pattern),
      ),
    );
  }

  if (stage) {
    conditions.push(eq(prospects.outreachStage, stage));
  }

  if (reportStatus) {
    conditions.push(eq(prospects.seoReportStatus, reportStatus));
  }

  if (assignedUserId) {
    conditions.push(eq(prospects.assignedUserId, assignedUserId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const offset = (page - 1) * limit;

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: prospects.id,
        businessName: prospects.businessName,
        phone: prospects.phone,
        website: prospects.website,
        city: prospects.city,
        state: prospects.state,
        outreachStage: prospects.outreachStage,
        seoReportStatus: prospects.seoReportStatus,
        lastTouchedAt: prospects.lastTouchedAt,
        createdAt: prospects.createdAt,
        assignedUserId: prospects.assignedUserId,
        assignedUserName: adminUsers.name,
        assignedUserEmail: adminUsers.email,
        assignedUserAvatarUrl: adminUsers.avatarUrl,
      })
      .from(prospects)
      .leftJoin(adminUsers, eq(prospects.assignedUserId, adminUsers.id))
      .where(whereClause)
      .orderBy(sql`${prospects.lastTouchedAt} DESC NULLS LAST, ${prospects.createdAt} DESC`)
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(prospects).where(whereClause),
  ]);

  return {
    rows,
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  };
}

// ---------------------------------------------------------------------------
// Stats (header counters)
// ---------------------------------------------------------------------------

export interface ProspectingStats {
  /** SEO report ready AND outreach stage still `new` — these are next-up. */
  readyToCall: number;
  /** SEO report failed — needs admin attention. */
  reportsFailed: number;
  /** Pending follow-ups due today (date-only comparison). */
  followUpsToday: number;
}

/**
 * Server-side counters for the prospecting header.
 *
 * Two queries are issued in parallel:
 *   - one against `prospects` using `FILTER (WHERE ...)` so we only scan the
 *     table once for both counters,
 *   - one against `prospect_follow_ups` for today's pending follow-ups.
 */
export async function getProspectingStats(): Promise<ProspectingStats> {
  const [prospectsResult, followUpsResult] = await Promise.all([
    db.execute(sql`
      SELECT
        count(*) FILTER (
          WHERE seo_report_status = 'ready' AND outreach_stage = 'new'
        )::int AS ready_to_call,
        count(*) FILTER (
          WHERE seo_report_status = 'failed'
        )::int AS reports_failed
      FROM prospects
    `),
    db.execute(sql`
      SELECT count(*)::int AS follow_ups_today
      FROM prospect_follow_ups
      WHERE due_at::date = current_date AND status = 'pending'
    `),
  ]);

  const counts = prospectsResult[0] as unknown as
    | { ready_to_call: number; reports_failed: number }
    | undefined;
  const followUps = followUpsResult[0] as unknown as { follow_ups_today: number } | undefined;

  return {
    readyToCall: counts?.ready_to_call ?? 0,
    reportsFailed: counts?.reports_failed ?? 0,
    followUpsToday: followUps?.follow_ups_today ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Detail (single prospect cockpit)
// ---------------------------------------------------------------------------

export interface ProspectDetailContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  roleAtCompany: string | null;
  jobTitle: string | null;
  isPrimaryContact: boolean;
  lastSpokeAt: string | null;
  createdAt: string | null;
}

export interface ProspectDetailFollowUp {
  id: string;
  dueAt: string;
  reason: string | null;
  status: string;
  source: string;
  contactId: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ProspectDetailTimelineEvent {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string | null;
  contactId: string | null;
  prospectId: string | null;
}

export interface ProspectEngagementStats {
  totalViews: number;
  uniqueViewers: number;
  averageWatchPercent: number | null;
  completionCount: number;
  lastViewedAt: string | null;
}

export interface ProspectDetailRow {
  id: string;
  businessName: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  industry: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  googlePlaceId: string | null;
  outreachStage: string;
  seoReportStatus: string;
  seoReportUrl: string | null;
  seoReportError: string | null;
  capVideoId: string | null;
  capVideoUrl: string | null;
  lastTouchedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedUserId: string | null;
  assignedUserName: string | null;
  assignedUserEmail: string | null;
  assignedUserAvatarUrl: string | null;
}

export interface ProspectDetail {
  prospect: ProspectDetailRow;
  contacts: ProspectDetailContact[];
  followUps: ProspectDetailFollowUp[];
  timelineEvents: ProspectDetailTimelineEvent[];
  engagementStats: ProspectEngagementStats;
}

/**
 * Fetch everything the prospect cockpit needs in a single round-trip.
 *
 * Returns `null` when the prospect id does not exist so the page can call
 * `notFound()` and render the framework 404.
 *
 * Engagement stats are computed in SQL against `videoEngagementEvents` for
 * the prospect's `capVideoId` (or directly by `prospectId` as a fallback for
 * events that were captured before we copied the video id over).
 */
export async function getProspectDetail(id: string): Promise<ProspectDetail | null> {
  const [row] = await db
    .select({
      id: prospects.id,
      businessName: prospects.businessName,
      address: prospects.address,
      city: prospects.city,
      state: prospects.state,
      country: prospects.country,
      industry: prospects.industry,
      phone: prospects.phone,
      website: prospects.website,
      notes: prospects.notes,
      googlePlaceId: prospects.googlePlaceId,
      outreachStage: prospects.outreachStage,
      seoReportStatus: prospects.seoReportStatus,
      seoReportUrl: prospects.seoReportUrl,
      seoReportError: prospects.seoReportError,
      capVideoId: prospects.capVideoId,
      capVideoUrl: prospects.capVideoUrl,
      lastTouchedAt: prospects.lastTouchedAt,
      createdAt: prospects.createdAt,
      updatedAt: prospects.updatedAt,
      assignedUserId: prospects.assignedUserId,
      assignedUserName: adminUsers.name,
      assignedUserEmail: adminUsers.email,
      assignedUserAvatarUrl: adminUsers.avatarUrl,
    })
    .from(prospects)
    .leftJoin(adminUsers, eq(prospects.assignedUserId, adminUsers.id))
    .where(eq(prospects.id, id))
    .limit(1);

  if (!row) return null;

  const prospect = row;

  const [contactRows, followUpRows, engagementRow] = await Promise.all([
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
        roleAtCompany: contacts.roleAtCompany,
        jobTitle: contacts.jobTitle,
        isPrimaryContact: contacts.isPrimaryContact,
        lastSpokeAt: contacts.lastSpokeAt,
        createdAt: contacts.createdAt,
      })
      .from(contacts)
      .where(eq(contacts.prospectId, id))
      .orderBy(
        // Primary first, then most recent.
        sql`${contacts.isPrimaryContact} DESC, ${contacts.createdAt} DESC NULLS LAST`,
      ),
    db
      .select({
        id: prospectFollowUps.id,
        dueAt: prospectFollowUps.dueAt,
        reason: prospectFollowUps.reason,
        status: prospectFollowUps.status,
        source: prospectFollowUps.source,
        contactId: prospectFollowUps.contactId,
        completedAt: prospectFollowUps.completedAt,
        createdAt: prospectFollowUps.createdAt,
      })
      .from(prospectFollowUps)
      .where(eq(prospectFollowUps.prospectId, id))
      .orderBy(
        // Pending first by due date, then everything else newest first.
        sql`CASE WHEN ${prospectFollowUps.status} = 'pending' THEN 0 ELSE 1 END, ${prospectFollowUps.dueAt} ASC`,
      ),
    computeEngagementStats(id, prospect.capVideoId),
  ]);

  // Timeline events: union of (prospectId = this) + (contactId IN any contact
  // of this prospect). Run in a second pass so we can scope to the contacts
  // we just loaded — keeps the index hits tight.
  const contactIds = contactRows.map((c) => c.id);
  const timelineEvents = await db
    .select({
      id: contactTimeline.id,
      eventType: contactTimeline.eventType,
      title: contactTimeline.title,
      description: contactTimeline.description,
      metadata: contactTimeline.metadata,
      createdAt: contactTimeline.createdAt,
      contactId: contactTimeline.contactId,
      prospectId: contactTimeline.prospectId,
    })
    .from(contactTimeline)
    .where(
      contactIds.length > 0
        ? or(eq(contactTimeline.prospectId, id), inArray(contactTimeline.contactId, contactIds))
        : eq(contactTimeline.prospectId, id),
    )
    .orderBy(desc(contactTimeline.createdAt))
    .limit(200);

  return {
    prospect,
    contacts: contactRows,
    followUps: followUpRows,
    timelineEvents: timelineEvents.map((event) => ({
      ...event,
      metadata: event.metadata as Record<string, unknown> | null,
    })),
    engagementStats: engagementRow,
  };
}

/**
 * Aggregate the prospect's Cap video engagement.
 *
 * Prefers the join on `capVideoId` (so we still count views from before the
 * row was reassigned), and falls back to `prospectId` for events captured
 * without a video id on the prospect record yet.
 */
async function computeEngagementStats(
  prospectId: string,
  capVideoId: string | null,
): Promise<ProspectEngagementStats> {
  const whereClause = capVideoId
    ? or(
        eq(videoEngagementEvents.capVideoId, capVideoId),
        eq(videoEngagementEvents.prospectId, prospectId),
      )
    : eq(videoEngagementEvents.prospectId, prospectId);

  const [agg] = await db
    .select({
      totalViews: sql<number>`count(*)::int`,
      uniqueViewers: sql<number>`count(distinct ${videoEngagementEvents.viewerIp})::int`,
      averageWatchPercent: sql<number | null>`avg(${videoEngagementEvents.watchPercent})::float`,
      completionCount: sql<number>`count(*) FILTER (WHERE ${videoEngagementEvents.eventType} = 'completed' OR ${videoEngagementEvents.watchPercent} >= 90)::int`,
      lastViewedAt: sql<string | null>`max(${videoEngagementEvents.occurredAt})::text`,
    })
    .from(videoEngagementEvents)
    .where(whereClause);

  return {
    totalViews: agg?.totalViews ?? 0,
    uniqueViewers: agg?.uniqueViewers ?? 0,
    averageWatchPercent:
      agg?.averageWatchPercent != null ? Math.round(agg.averageWatchPercent) : null,
    completionCount: agg?.completionCount ?? 0,
    lastViewedAt: agg?.lastViewedAt ?? null,
  };
}
