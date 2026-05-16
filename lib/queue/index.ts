/**
 * Typed enqueue functions for all pg-boss queues.
 *
 * server-only — never import in Client Components or edge runtime.
 */

import "server-only";
import { getBoss } from "./client";
import type {
  SendWorkflowPayload,
  CurateWorkflowPayload,
  PublishWorkflowPayload,
  CleanupWorkflowPayload,
} from "@/lib/newsletter/lib/queue/types";

// ---------------------------------------------------------------------------
// Queue names (single source of truth)
// ---------------------------------------------------------------------------

export const QUEUE = {
  NEWSLETTER_SEND: "newsletter-send",
  NEWSLETTER_CURATE: "newsletter-curate",
  NEWSLETTER_PUBLISH: "newsletter-publish",
  NEWSLETTER_CLEANUP: "newsletter-cleanup",
  OUTREACH_SEND_EMAIL: "outreach-send-email",
  GENERATE_SEO_REPORT: "generate-seo-report",
  PROCESS_QUO_CALL: "process-quo-call",
  PROSPECT_FOLLOW_UP: "prospect-follow-up",
  POLL_CAP_ANALYTICS: "poll-cap-analytics",
} as const;

// ---------------------------------------------------------------------------
// Outreach payload
// ---------------------------------------------------------------------------

export interface OutreachSendEmailPayload {
  contactId: string;
  campaignId: string;
  emailNumber: 1 | 2 | 3;
  unsubscribeUrl: string;
  forceTextOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Prospect payloads
// ---------------------------------------------------------------------------

export interface GenerateSeoReportPayload {
  prospectId: string;
}

/**
 * Payload for the `process-quo-call` pg-boss job.
 *
 * All three Quo call-related webhooks (`call.completed`, `call.summary.completed`,
 * `call.transcript.completed`) enqueue this same job for the same callId.
 * The handler is idempotent at the call level (see `quo_calls_processed`).
 * The `hasSummary` / `hasTranscript` hints are advisory only — the handler
 * always refetches from the Quo API so an event arriving out of order can't
 * leave us with stale or partial data.
 */
export interface ProcessQuoCallPayload {
  callId: string;
  /** Hint: Quo signalled the AI summary is ready. */
  hasSummary?: boolean;
  /** Hint: Quo signalled the AI transcript is ready. */
  hasTranscript?: boolean;
}

/**
 * Payload for a scheduled prospect follow-up reminder.
 *
 * Enqueued by the Quo call handler when the AI extraction surfaces an
 * explicit follow-up intent + date, and by the follow-up admin route when
 * the admin snoozes a reminder. pg-boss's `startAfter` schedules the job
 * for the follow-up's `dueAt`. The handler (`fire-follow-up.ts`) loads the
 * row by id and creates a notification — everything else is derived from
 * the DB, so this payload stays minimal.
 */
export interface ProspectFollowUpPayload {
  followUpId: string;
}

// ---------------------------------------------------------------------------
// Enqueue functions
// ---------------------------------------------------------------------------

export async function enqueueNewsletterSend(payload: SendWorkflowPayload): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(QUEUE.NEWSLETTER_SEND, payload, {
    retryLimit: 2,
    retryDelay: 60,
    expireInSeconds: 900,
  });
}

export async function enqueueNewsletterCurate(
  payload: CurateWorkflowPayload,
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(QUEUE.NEWSLETTER_CURATE, payload, {
    retryLimit: 2,
    retryDelay: 60,
    expireInSeconds: 900,
  });
}

export async function enqueueNewsletterPublish(
  payload: PublishWorkflowPayload,
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(QUEUE.NEWSLETTER_PUBLISH, payload, {
    retryLimit: 2,
    retryDelay: 60,
    expireInSeconds: 1800,
  });
}

export async function enqueueNewsletterCleanup(
  payload: CleanupWorkflowPayload,
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(QUEUE.NEWSLETTER_CLEANUP, payload, {
    retryLimit: 1,
    retryDelay: 120,
    expireInSeconds: 3600,
  });
}

export async function enqueueOutreachSendEmail(
  payload: OutreachSendEmailPayload,
  options?: { startAfter?: number },
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(QUEUE.OUTREACH_SEND_EMAIL, payload, {
    retryLimit: 2,
    retryDelay: 60,
    expireInSeconds: 600,
    ...(options?.startAfter != null && { startAfter: options.startAfter }),
  });
}

/**
 * Enqueue an SEO report generation job for a prospect.
 *
 * The handler lives in `scripts/worker.ts` (separate task). pg-boss v10+
 * requires the queue to exist before `send` — `createQueue` is idempotent
 * and runs on every call so the website can enqueue even on a cold deploy
 * before the worker has rebooted.
 */
export async function enqueueGenerateSeoReport(
  payload: GenerateSeoReportPayload,
): Promise<string | null> {
  const boss = await getBoss();
  await boss.createQueue(QUEUE.GENERATE_SEO_REPORT);
  return boss.send(QUEUE.GENERATE_SEO_REPORT, payload, {
    retryLimit: 3,
    retryDelay: 120,
    expireInSeconds: 1800,
  });
}

/**
 * Enqueue the Quo call extraction job.
 *
 * `retryLimit: 5` + `retryDelay: 120` (2 min) covers the case where the
 * `call.completed` event arrives BEFORE Quo's AI has produced the summary
 * or transcript. The job handler throws on partial-ready state, pg-boss
 * retries with backoff, and a later retry finds both artefacts ready.
 *
 * `expireInSeconds: 3600` matches the worst-case scenario where Quo takes
 * the full hour to finalise both summary and transcript on a long call.
 */
export async function enqueueProcessQuoCall(
  payload: ProcessQuoCallPayload,
): Promise<string | null> {
  const boss = await getBoss();
  await boss.createQueue(QUEUE.PROCESS_QUO_CALL);
  return boss.send(QUEUE.PROCESS_QUO_CALL, payload, {
    retryLimit: 5,
    retryDelay: 120,
    expireInSeconds: 3600,
  });
}

/**
 * Enqueue the Cap analytics polling job.
 *
 * Payload is intentionally empty — the handler reads `prospects.capVideoId`
 * itself and decides which prospects to poll. Two callers:
 *
 *   1. The pg-boss internal scheduler (`boss.schedule` in `scripts/worker.ts`)
 *      fires every 5 min and is the canonical cron.
 *   2. The HTTP cron endpoint at `/api/cron/poll-cap-analytics` enqueues the
 *      same job for manual / external triggers (curl, Railway cron service,
 *      Upstash QStash, etc.). See `docs/cap-integration.md`.
 *
 * `retryLimit: 1` keeps the job from looping on a transient Cap outage —
 * the next scheduled tick (5 min away) will retry. Each prospect is wrapped
 * in try/catch inside the handler so one bad video doesn't poison the batch.
 *
 * Concurrency is bounded to 1 at the worker (`localConcurrency: 1` in
 * `scripts/worker.ts`) so overlapping ticks queue up rather than racing.
 */
export async function enqueuePollCapAnalytics(): Promise<string | null> {
  const boss = await getBoss();
  await boss.createQueue(QUEUE.POLL_CAP_ANALYTICS);
  return boss.send(
    QUEUE.POLL_CAP_ANALYTICS,
    {},
    {
      retryLimit: 1,
      retryDelay: 60,
      expireInSeconds: 600,
    },
  );
}

/**
 * Enqueue a scheduled prospect follow-up.
 *
 * `startAfter` accepts a Date, ISO string, or seconds-from-now. We pass an
 * ISO string so the job fires at the exact `dueAt` the AI extracted (or
 * the admin set manually). The followUp row in `prospect_follow_ups` is
 * the source of truth; this queue entry is just the scheduling primitive.
 */
export async function enqueueProspectFollowUp(
  payload: ProspectFollowUpPayload,
  options: { dueAt: Date | string },
): Promise<string | null> {
  const boss = await getBoss();
  await boss.createQueue(QUEUE.PROSPECT_FOLLOW_UP);
  const startAfter =
    typeof options.dueAt === "string" ? options.dueAt : options.dueAt.toISOString();
  return boss.send(QUEUE.PROSPECT_FOLLOW_UP, payload, {
    retryLimit: 3,
    retryDelay: 300,
    expireInSeconds: 86400,
    startAfter,
  });
}

/**
 * Cancel a previously enqueued prospect follow-up job.
 *
 * Used by the admin follow-up route (PATCH cancelled / snoozed, DELETE) to
 * remove the pending reminder from pg-boss before it fires. pg-boss only
 * cancels jobs in the `created` / `retry` states — a job that's already
 * `active` / `completed` / `failed` is a no-op, which is the desired
 * behaviour. We swallow errors so a stale job id can't break the parent
 * admin action; the worst case is one extra notification.
 */
export async function cancelProspectFollowUp(jobId: string): Promise<void> {
  try {
    const boss = await getBoss();
    await boss.cancel(QUEUE.PROSPECT_FOLLOW_UP, jobId);
  } catch (err) {
    // Swallowed by design — the follow-up row mutation is the source of truth.
    console.warn(
      `[queue] cancelProspectFollowUp(${jobId}) failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function getQueueHealth(): Promise<{
  healthy: boolean;
  issues: string[];
}> {
  try {
    const boss = await getBoss();
    // pg-boss exposes getQueueSize; if it returns without error the DB connection is alive
    await boss.getQueueStats(QUEUE.NEWSLETTER_SEND);
    return { healthy: true, issues: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { healthy: false, issues: [`pg-boss health check failed: ${message}`] };
  }
}
