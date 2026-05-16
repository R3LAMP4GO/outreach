/**
 * Cap Analytics Polling Cron
 * GET /api/cron/poll-cap-analytics
 *
 * Enqueues a single `poll-cap-analytics` pg-boss job. The worker picks it up
 * and walks every active prospect, polling Cap (cap.so) for new view events.
 *
 * Triggering options:
 *   1. (default) Internal pg-boss schedule in `scripts/worker.ts` fires every
 *      5 minutes via `boss.schedule(...)`. This endpoint is NOT required for
 *      production polling.
 *   2. External cron (Railway cron service, Upstash QStash, plain curl) hits
 *      this endpoint when you want a manual / out-of-band trigger.
 *
 * Both paths converge on the same handler in
 * `lib/prospects/jobs/poll-cap-analytics.ts`.
 *
 * Security: Protected by `CRON_SECRET` environment variable. Constant-time
 * comparison via `compareBearerToken`.
 *
 * See `docs/cap-integration.md` for the operational details.
 */

import { NextRequest, NextResponse } from "next/server";

import { compareBearerToken } from "@/lib/auth/compare-api-keys";
import { logger } from "@/lib/logger";
import { enqueuePollCapAnalytics } from "@/lib/queue";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    logger.error("CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron job not configured" }, { status: 500 });
  }

  if (!authHeader || !compareBearerToken(authHeader, cronSecret)) {
    logger.warn("Unauthorized cron attempt", {
      route: "/api/cron/poll-cap-analytics",
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const jobId = await enqueuePollCapAnalytics();
    logger.info("Enqueued poll-cap-analytics job", { jobId });
    return NextResponse.json({ enqueued: true, jobId });
  } catch (err) {
    logger.error("Failed to enqueue poll-cap-analytics job:", err);
    return NextResponse.json(
      {
        error: "Failed to enqueue poll-cap-analytics job",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization",
      },
    },
  );
}
