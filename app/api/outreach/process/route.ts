import { NextRequest } from "next/server";
import { processDueEmails } from "@/lib/outreach/sending";
import { logger } from "@/lib/logger";
import { Resend } from "resend";
import { OUTREACH_BATCH_SIZE } from "@/lib/constants";
import { compareBearerToken } from "@/lib/auth/compare-api-keys";

export const maxDuration = 300;

/**
 * GET /api/outreach/process
 *
 * Process due emails and send them via Resend.
 * Called every 15 minutes by the pg-boss schedule registered in scripts/worker.ts.
 * Also exposed as a manual HTTP trigger.
 *
 * @headers Authorization - Bearer token with cron secret
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Validate cron secret using constant-time comparison
    const authHeader = request.headers.get("authorization");
    const expectedToken = process.env.OUTREACH_CRON_SECRET || process.env.CRON_SECRET;

    if (!authHeader || !expectedToken || !compareBearerToken(authHeader, expectedToken)) {
      logger.error("Unauthorized cron attempt - invalid secret");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Validate required environment variables
    if (!process.env.NEXT_PUBLIC_SITE_URL) {
      logger.error("NEXT_PUBLIC_SITE_URL is not configured");
      return Response.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    // 3. Get Resend client from environment
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      logger.error("RESEND_API_KEY not configured");
      return Response.json(
        { error: "Email service not configured. Please set RESEND_API_KEY environment variable." },
        { status: 500 },
      );
    }

    const resend = new Resend(apiKey);

    logger.debug("Starting email processing job...");

    // 4. Process due emails — enqueues individual sends to pg-boss
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
    const result = await processDueEmails(resend, {
      batchSize: OUTREACH_BATCH_SIZE,
      unsubscribeBaseUrl: `${siteUrl}/unsubscribe`,
    });

    // 5. Log results
    const errorResults = result.results.filter((r) => !r.success);
    logger.debug(`Email processing completed:`, {
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      errors: errorResults.length,
    });

    // Return detailed result
    return Response.json(
      {
        success: true,
        total: result.total,
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
        errors: errorResults.map((r) => ({ contactId: r.contactId, error: r.error })),
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error("Error processing emails:", error);

    return Response.json(
      {
        success: false,
        error: "Failed to process emails",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/outreach/process
 *
 * Alternative endpoint for POST-based cron jobs (some providers prefer POST).
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
