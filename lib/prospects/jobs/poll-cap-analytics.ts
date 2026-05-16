/**
 * pg-boss handler: poll-cap-analytics
 *
 * Polls Cap (cap.so) for new view events on every active prospect's recorded
 * video, then writes engagement timeline entries + hot-lead notifications.
 *
 * Triggered every 5 minutes by an internal `boss.schedule(...)` in
 * `scripts/worker.ts`. The HTTP endpoint at `/api/cron/poll-cap-analytics`
 * enqueues the same job for manual / external triggers.
 *
 * ─── Scope ────────────────────────────────────────────────────────────────
 *
 * "Active prospect" = `capVideoId IS NOT NULL` AND
 *   (lastTouchedAt within `CAP_POLL_LOOKBACK_DAYS` days
 *    OR outreachStage in {emailed, email_captured, phone_captured}).
 *
 * Anything older or with no engagement signal is skipped to keep the per-tick
 * Cap API spend bounded.
 *
 * ─── Cap analytics limitation ────────────────────────────────────────────
 *
 * Cap currently has no public per-view analytics endpoint. `getVideoAnalytics`
 * throws `CapApiError(501)` by default — the handler treats that as a
 * graceful skip (debug log, not a failure). When Cap ships an endpoint or the
 * team self-hosts and exposes one, the existing Zod schema in
 * `lib/cap/types.ts > capVideoAnalyticsSchema` is the contract; the parsing
 * boundary below (marked `TODO(cap-analytics)`) consumes that shape directly.
 *
 * See `outreach/lib/cap/README.md` for the full gap analysis.
 */

import { and, eq, gte, inArray, isNotNull, or } from "drizzle-orm";

import { db } from "@/lib/db/worker";
import {
  adminUsers,
  contacts,
  notifications,
  prospects,
  videoEngagementEvents,
} from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { writeTimelineEvent } from "@/lib/crm/timeline";
import { CapApiError, getVideoAnalytics } from "@/lib/cap/client";
import type { CapVideoAnalytics, CapVideoView } from "@/lib/cap/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_LOOKBACK_DAYS = 30;
/** Outreach stages that should ALWAYS be polled regardless of `lastTouchedAt`. */
const ACTIVE_STAGES = ["emailed", "email_captured", "phone_captured"] as const;
/** Hard cap on prospects per tick. 1000 is well above realistic batch sizes. */
const MAX_PROSPECTS_PER_TICK = 1000;
/** Hard cap on existing engagement rows fetched per prospect (for dedupe). */
const MAX_EXISTING_EVENTS = 10000;

/** Engagement-event types written to `video_engagement_events.event_type`. */
export type EngagementEventType =
  | "first_view"
  | "watched_50"
  | "watched_75"
  | "watched_completed"
  | "video_rewatched";

/** Engagement events that should also notify the assigned admin. */
const HOT_LEAD_EVENTS: ReadonlySet<EngagementEventType> = new Set([
  "watched_75",
  "watched_completed",
  "video_rewatched",
]);

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Pick the engagement event type for a single view.
 *
 * Rules (in evaluation order — most-engaged signal wins, so a first view at
 * 90% surfaces as `watched_completed` and fires a hot-lead notification
 * rather than being buried under a generic `first_view` marker):
 *   1. Viewer already has a prior view (rewatch beats raw % — a 5% rewatch
 *      is more interesting than a 5% first view)  → `video_rewatched`
 *   2. Watch fraction ≥ 0.90                       → `watched_completed`
 *   3. Watch fraction ≥ 0.75                       → `watched_75`
 *   4. Watch fraction ≥ 0.50                       → `watched_50`
 *   5. Otherwise (low-engagement, first-time or repeat) → `first_view`
 *
 * `priorViewerCount` is the count of EARLIER views (existing + same-batch)
 * by the same viewer (matched by IP). When `null`, the viewer is anonymous
 * and we never classify as a rewatch.
 *
 * `videoHasAnyPriorView` is included for callers / future rules but is no
 * longer used to gate the engagement buckets — see rule #5 above.
 */
export function classifyEngagement(args: {
  videoHasAnyPriorView: boolean;
  priorViewerCount: number | null;
  watchPercent: number;
}): EngagementEventType {
  const { priorViewerCount, watchPercent } = args;
  const pct = Math.max(0, Math.min(1, watchPercent));

  if (priorViewerCount !== null && priorViewerCount > 0) return "video_rewatched";
  if (pct >= 0.9) return "watched_completed";
  if (pct >= 0.75) return "watched_75";
  if (pct >= 0.5) return "watched_50";
  return "first_view";
}

/** Map an engagement event type → the timeline event type stored in `contact_timeline`. */
function timelineEventTypeFor(
  eventType: EngagementEventType,
): "video_viewed" | "video_completed" | "video_rewatched" {
  if (eventType === "watched_completed") return "video_completed";
  if (eventType === "video_rewatched") return "video_rewatched";
  return "video_viewed";
}

/** Dedupe key combining capVideoId + occurredAt + viewerIp (null IP stays distinct). */
function dedupeKey(
  capVideoId: string,
  occurredAt: string,
  viewerIp: string | null | undefined,
): string {
  return `${capVideoId}::${occurredAt}::${viewerIp ?? ""}`;
}

/** Build the human-readable notification title for a hot-lead event. */
function hotLeadMessage(
  businessName: string,
  eventType: EngagementEventType,
  watchPercent: number,
): string {
  const pct = Math.round(Math.max(0, Math.min(1, watchPercent)) * 100);
  switch (eventType) {
    case "watched_completed":
      return `${businessName} watched the full video (${pct}%)`;
    case "watched_75":
      return `${businessName} watched ${pct}% of the video`;
    case "video_rewatched":
      return `${businessName} rewatched the video`;
    default:
      return `${businessName} engaged with the video`;
  }
}

// ─── DB-touching helpers (kept thin so the orchestrator stays readable) ──────

interface ActiveProspect {
  id: string;
  businessName: string;
  capVideoId: string;
  assignedUserId: string | null;
  outreachStage: string;
  lastTouchedAt: string | null;
}

async function loadActiveProspects(lookbackDays: number): Promise<ActiveProspect[]> {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  const rows = await db
    .select({
      id: prospects.id,
      businessName: prospects.businessName,
      capVideoId: prospects.capVideoId,
      assignedUserId: prospects.assignedUserId,
      outreachStage: prospects.outreachStage,
      lastTouchedAt: prospects.lastTouchedAt,
    })
    .from(prospects)
    .where(
      and(
        isNotNull(prospects.capVideoId),
        or(
          gte(prospects.lastTouchedAt, cutoff),
          inArray(prospects.outreachStage, [...ACTIVE_STAGES]),
        ),
      ),
    )
    .limit(MAX_PROSPECTS_PER_TICK);

  // capVideoId is NOT NULL by predicate, but TS doesn't know that.
  return rows.flatMap((r) => (r.capVideoId ? [{ ...r, capVideoId: r.capVideoId }] : []));
}

interface ExistingEvent {
  viewerIp: string | null;
  occurredAt: string | null;
}

async function loadExistingEvents(capVideoId: string): Promise<ExistingEvent[]> {
  const rows = await db
    .select({
      viewerIp: videoEngagementEvents.viewerIp,
      occurredAt: videoEngagementEvents.occurredAt,
    })
    .from(videoEngagementEvents)
    .where(eq(videoEngagementEvents.capVideoId, capVideoId))
    .limit(MAX_EXISTING_EVENTS);
  return rows;
}

async function loadPrimaryContactId(prospectId: string): Promise<string | null> {
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.prospectId, prospectId), eq(contacts.isPrimaryContact, true)))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Pick the user id who should receive the hot-lead notification.
 *
 * 1. `prospects.assigned_user_id` if set.
 * 2. Fallback: the first row in `admin_users` (single-admin systems).
 * 3. `null` if neither exists — caller should skip the notification.
 *
 * Result is memoised across the whole tick by the caller so we don't issue
 * the same fallback SELECT for every prospect.
 */
async function pickNotificationRecipient(
  prospect: ActiveProspect,
  fallbackAdminUserId: { current: string | null | undefined },
): Promise<string | null> {
  if (prospect.assignedUserId) return prospect.assignedUserId;
  if (fallbackAdminUserId.current !== undefined) return fallbackAdminUserId.current;

  const rows = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
  fallbackAdminUserId.current = rows[0]?.id ?? null;
  return fallbackAdminUserId.current;
}

// ─── Per-prospect orchestrator ───────────────────────────────────────────────

interface PollProspectResult {
  newEvents: number;
}

/**
 * Process a single prospect's Cap views.
 *
 * Caller MUST wrap this in try/catch — one prospect failing should not kill
 * the batch.
 */
async function pollProspect(
  prospect: ActiveProspect,
  fallbackAdminUserId: { current: string | null | undefined },
): Promise<PollProspectResult> {
  // --- 1. Fetch analytics from Cap. -----------------------------------------
  let analytics: CapVideoAnalytics | null;
  try {
    analytics = await getVideoAnalytics(prospect.capVideoId);
  } catch (err) {
    // Cap doesn't yet expose a public analytics endpoint. The client throws
    // CapApiError(501) in that case. Treat as a silent skip so the cron log
    // isn't flooded with the same message every 5 min.
    if (err instanceof CapApiError && err.status === 501) {
      logger.debug("[poll-cap-analytics] cap analytics not yet available; skipping", {
        prospectId: prospect.id,
        capVideoId: prospect.capVideoId,
      });
      return { newEvents: 0 };
    }
    throw err; // Bubble auth / 5xx so the per-prospect catch records it.
  }

  if (!analytics) {
    logger.debug("[poll-cap-analytics] no analytics returned (likely 404)", {
      prospectId: prospect.id,
      capVideoId: prospect.capVideoId,
    });
    return { newEvents: 0 };
  }

  // TODO(cap-analytics): this is the response-parsing boundary. The Cap
  // client today returns `CapVideoAnalytics` with `views: []` because no
  // public per-view endpoint exists. Once Cap ships one, the existing
  // schema in `lib/cap/types.ts > capVideoAnalyticsSchema` already declares
  // the shape we want — no change needed here.
  const views = analytics.views ?? [];
  if (views.length === 0) {
    return { newEvents: 0 };
  }

  // --- 2. Load dedupe set + primary contact. --------------------------------
  const existing = await loadExistingEvents(prospect.capVideoId);
  const existingKeys = new Set(
    existing.map((e) => dedupeKey(prospect.capVideoId, e.occurredAt ?? "", e.viewerIp)),
  );

  // Per-viewer counts include both pre-existing rows AND newly-inserted ones
  // in this same batch so the second view by the same IP within a single
  // tick is correctly classified as a rewatch.
  const viewerCounts = new Map<string, number>();
  for (const e of existing) {
    if (e.viewerIp) viewerCounts.set(e.viewerIp, (viewerCounts.get(e.viewerIp) ?? 0) + 1);
  }
  let videoHasAnyPriorView = existing.length > 0;

  const primaryContactId = await loadPrimaryContactId(prospect.id);

  // --- 3. Sort views chronologically so "first_view" really is the earliest.
  const sorted = [...views].sort((a, b) => a.watchedAt.localeCompare(b.watchedAt));

  let newEvents = 0;
  for (const view of sorted) {
    const key = dedupeKey(prospect.capVideoId, view.watchedAt, view.viewerIp ?? null);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key); // protect against duplicate views WITHIN one Cap response

    await recordView({
      prospect,
      primaryContactId,
      view,
      videoHasAnyPriorView,
      viewerCounts,
      fallbackAdminUserId,
    });
    newEvents++;
    videoHasAnyPriorView = true;
  }

  // --- 4. Bump lastTouchedAt only if something actually landed. -------------
  if (newEvents > 0) {
    await db
      .update(prospects)
      .set({ lastTouchedAt: new Date().toISOString() })
      .where(eq(prospects.id, prospect.id));
  }

  return { newEvents };
}

interface RecordViewArgs {
  prospect: ActiveProspect;
  primaryContactId: string | null;
  view: CapVideoView;
  videoHasAnyPriorView: boolean;
  viewerCounts: Map<string, number>;
  fallbackAdminUserId: { current: string | null | undefined };
}

async function recordView(args: RecordViewArgs): Promise<void> {
  const {
    prospect,
    primaryContactId,
    view,
    videoHasAnyPriorView,
    viewerCounts,
    fallbackAdminUserId,
  } = args;

  const ip = view.viewerIp ?? null;
  const priorViewerCount = ip !== null ? (viewerCounts.get(ip) ?? 0) : null;

  const eventType = classifyEngagement({
    videoHasAnyPriorView,
    priorViewerCount,
    watchPercent: view.watchPercent,
  });

  const watchPercentInt = Math.round(Math.max(0, Math.min(1, view.watchPercent)) * 100);
  const watchDurationInt = Math.round(view.watchDurationSeconds);

  // --- (a) engagement row -----------------------------------------------------
  await db.insert(videoEngagementEvents).values({
    capVideoId: prospect.capVideoId,
    contactId: primaryContactId,
    prospectId: prospect.id,
    eventType,
    occurredAt: view.watchedAt,
    viewerIp: ip,
    viewerCountry: view.country ?? null,
    watchDurationSeconds: watchDurationInt,
    watchPercent: watchPercentInt,
    rawPayload: view as unknown as Record<string, unknown>,
  });

  // Bump in-memory viewer count so a third+ view in the same batch is also a rewatch.
  if (ip !== null) viewerCounts.set(ip, (viewerCounts.get(ip) ?? 0) + 1);

  // --- (b) timeline entry -----------------------------------------------------
  // `writeTimelineEvent` is non-throwing (logs internally) and accepts
  // EITHER contactId OR prospectId per the relaxed CHECK constraint added
  // in schema migration 0007. A prospect with no primary contact yet (the
  // typical pre-engagement state) still gets its timeline row.
  await writeTimelineEvent({
    ...(primaryContactId ? { contactId: primaryContactId } : {}),
    prospectId: prospect.id,
    eventType: timelineEventTypeFor(eventType),
    title: hotLeadMessage(prospect.businessName, eventType, view.watchPercent),
    metadata: {
      capVideoId: prospect.capVideoId,
      engagementEventType: eventType,
      watchPercent: watchPercentInt,
      watchDurationSeconds: watchDurationInt,
      viewerIp: ip,
      country: view.country ?? null,
      occurredAt: view.watchedAt,
    },
  });

  // --- (c) hot-lead notification ---------------------------------------------
  if (!HOT_LEAD_EVENTS.has(eventType)) return;

  const userId = await pickNotificationRecipient(prospect, fallbackAdminUserId);
  if (!userId) {
    logger.warn("[poll-cap-analytics] no admin user to receive hot-lead notification", {
      prospectId: prospect.id,
    });
    return;
  }

  await db.insert(notifications).values({
    userId,
    type: "video_engagement",
    priority: "HIGH",
    title: "Hot lead: video engagement",
    message: hotLeadMessage(prospect.businessName, eventType, view.watchPercent),
    relatedId: prospect.id,
    relatedType: "prospect",
  });
}

// ─── Public entry point (registered in scripts/worker.ts) ────────────────────

export interface PollCapAnalyticsResult {
  prospectsPolled: number;
  newEventsWritten: number;
  errors: number;
}

export async function handlePollCapAnalytics(): Promise<PollCapAnalyticsResult> {
  const startedAt = Date.now();
  const lookbackRaw = process.env.CAP_POLL_LOOKBACK_DAYS;
  const lookbackDays =
    lookbackRaw && Number.isFinite(Number(lookbackRaw)) && Number(lookbackRaw) > 0
      ? Number(lookbackRaw)
      : DEFAULT_LOOKBACK_DAYS;

  logger.info("[poll-cap-analytics] start", { lookbackDays });

  let active: ActiveProspect[];
  try {
    active = await loadActiveProspects(lookbackDays);
  } catch (err) {
    logger.error("[poll-cap-analytics] failed to load active prospects", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  if (active.length === 0) {
    logger.info("[poll-cap-analytics] complete", {
      prospectsPolled: 0,
      newEventsWritten: 0,
      errors: 0,
      durationMs: Date.now() - startedAt,
    });
    return { prospectsPolled: 0, newEventsWritten: 0, errors: 0 };
  }

  // Memoise the fallback admin lookup across the whole tick.
  const fallbackAdminUserId: { current: string | null | undefined } = { current: undefined };

  let prospectsPolled = 0;
  let newEventsWritten = 0;
  let errors = 0;

  for (const prospect of active) {
    prospectsPolled++;
    try {
      const result = await pollProspect(prospect, fallbackAdminUserId);
      newEventsWritten += result.newEvents;
    } catch (err) {
      errors++;
      logger.error("[poll-cap-analytics] prospect failed", {
        prospectId: prospect.id,
        capVideoId: prospect.capVideoId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const durationMs = Date.now() - startedAt;
  logger.info("[poll-cap-analytics] complete", {
    prospectsPolled,
    newEventsWritten,
    errors,
    durationMs,
  });

  return { prospectsPolled, newEventsWritten, errors };
}
