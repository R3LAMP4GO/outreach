/**
 * CRM Queue Processing Cron Job
 * GET /api/cron/process-crm-queue
 *
 * Processes pending CRM sync operations with exponential backoff retry logic.
 * Triggered by an Upstash QStash scheduled message every 10 minutes.
 *
 * Security: Protected by CRON_SECRET environment variable
 */

import { NextRequest, NextResponse } from "next/server";
import { processCrmQueue, cleanupCrmQueue } from "@/lib/crm-retry-queue";
import { logger } from "@/lib/logger";
import { compareBearerToken } from "@/lib/auth/compare-api-keys";

/**
 * GET /api/cron/process-crm-queue
 * Process pending CRM operations from retry queue
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret using constant-time comparison
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      logger.error("CRON_SECRET not configured in environment variables");
      return NextResponse.json({ error: "Cron job not configured" }, { status: 500 });
    }

    if (!authHeader || !compareBearerToken(authHeader, cronSecret)) {
      logger.warn("Unauthorized cron job attempt", {
        ip: request.headers.get("x-forwarded-for") || "unknown",
      });

      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Process the queue
    logger.info("Starting CRM queue processing");
    const result = await processCrmQueue();

    // Cleanup old completed/failed items (keep 7 days)
    const deletedCount = await cleanupCrmQueue(7);

    logger.info("CRM queue processing complete", {
      ...result,
      cleanedUp: deletedCount,
    });

    return NextResponse.json({
      success: true,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      cleanedUp: deletedCount,
    });
  } catch (error) {
    logger.error("CRM queue processing error:", error);

    return NextResponse.json(
      {
        error: "Failed to process CRM queue",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
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
