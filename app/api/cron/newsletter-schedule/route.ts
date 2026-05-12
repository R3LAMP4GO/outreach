import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { newsletterEditions, newsletterCampaigns } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { triggerSendWorkflow } from "@/lib/newsletter/lib/queue";
import { logger } from "@/lib/logger";
import { compareBearerToken } from "@/lib/auth/compare-api-keys";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Newsletter Scheduling Cron Job
 * GET /api/cron/newsletter-schedule
 *
 * Checks for newsletters scheduled to send and triggers QStash workflows.
 * Runs every 10 minutes via an Upstash QStash scheduled message.
 *
 * Security: Protected by CRON_SECRET environment variable
 *
 * Process:
 * 1. Query newsletters with status='scheduled' and scheduled_at <= NOW()
 * 2. For each newsletter, atomically claim it by flipping status 'scheduled' -> 'sending'
 * 3. Only if the claim succeeded, trigger the QStash send workflow
 * 4. If the dispatch throws, revert status to 'failed' so it can be retried/inspected
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret using constant-time comparison
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      logger.error("CRON_SECRET not configured");
      return NextResponse.json({ error: "Cron job not configured" }, { status: 500 });
    }

    if (!authHeader || !compareBearerToken(authHeader, cronSecret)) {
      logger.warn("Unauthorized cron attempt", {
        ip: request.headers.get("x-forwarded-for") || "unknown",
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    logger.info("Starting newsletter scheduling check");

    // Find newsletters scheduled to send in the last 15 minutes up to now
    const now = new Date();
    const lookbackStart = new Date(now.getTime() - 15 * 60 * 1000);

    const scheduled = await db
      .select({
        id: newsletterEditions.id,
        campaignId: newsletterEditions.campaignId,
        scheduledAt: newsletterEditions.scheduledAt,
        subject: newsletterEditions.subject,
        campaign: {
          id: newsletterCampaigns.id,
          sources: newsletterCampaigns.sources,
          articleLimit: newsletterCampaigns.articleLimit,
          templateId: newsletterCampaigns.templateId,
        },
      })
      .from(newsletterEditions)
      .innerJoin(newsletterCampaigns, eq(newsletterEditions.campaignId, newsletterCampaigns.id))
      .where(
        and(
          eq(newsletterEditions.status, "scheduled"),
          gte(newsletterEditions.scheduledAt, lookbackStart.toISOString()),
          lte(newsletterEditions.scheduledAt, now.toISOString()),
        ),
      );

    if (scheduled.length === 0) {
      logger.info("No newsletters scheduled for sending");
      return NextResponse.json({
        success: true,
        scheduled: 0,
        message: "No newsletters scheduled",
      });
    }

    let enqueued = 0;
    let failed = 0;

    for (const newsletter of scheduled) {
      const campaign = newsletter.campaign;

      // Skip if no campaign data
      if (!campaign) {
        logger.warn(`Campaign not found for newsletter ${newsletter.id}`);
        failed++;
        continue;
      }

      if (!newsletter.scheduledAt) {
        logger.warn(`Newsletter ${newsletter.id} has no scheduled_at time`);
        failed++;
        continue;
      }

      // Atomic claim: flip 'scheduled' -> 'sending' in a single UPDATE. Only the
      // invocation whose UPDATE actually changed the row (returning.length === 1)
      // is allowed to dispatch the send workflow. This prevents overlapping cron
      // invocations (Vercel retries, manual triggers, clock skew) from double-sending.
      const claimed = await db
        .update(newsletterEditions)
        .set({ status: "sending", updatedAt: new Date().toISOString() })
        .where(
          and(eq(newsletterEditions.id, newsletter.id), eq(newsletterEditions.status, "scheduled")),
        )
        .returning({ id: newsletterEditions.id });

      if (claimed.length === 0) {
        // Another invocation won the race; skip silently.
        continue;
      }

      try {
        // Trigger QStash send workflow — only after we hold the claim.
        await triggerSendWorkflow({
          campaignId: campaign.id,
          sources: (campaign.sources as string[]) || [],
          maxArticles: campaign.articleLimit || 15,
        });

        enqueued++;
        logger.info(`Triggered workflow for newsletter ${newsletter.id}`, {
          subject: newsletter.subject,
          scheduledFor: newsletter.scheduledAt,
        });
      } catch (error) {
        logger.error(
          `Failed to trigger workflow for newsletter ${newsletter.id}; reverting claim:`,
          error,
        );
        failed++;

        // Dispatch failed after we claimed the row — revert to 'failed' so it
        // is visible for inspection and won't be silently retried into a double-send.
        try {
          await db
            .update(newsletterEditions)
            .set({ status: "failed", updatedAt: new Date().toISOString() })
            .where(
              and(
                eq(newsletterEditions.id, newsletter.id),
                eq(newsletterEditions.status, "sending"),
              ),
            );
        } catch (revertError) {
          logger.error(
            `Failed to revert status for newsletter ${newsletter.id} after dispatch failure:`,
            revertError,
          );
        }
      }
    }

    logger.info("Newsletter scheduling check complete", {
      enqueued,
      failed,
      total: scheduled.length,
    });

    return NextResponse.json({
      success: true,
      enqueued,
      failed,
      total: scheduled.length,
    });
  } catch (error) {
    logger.error("Newsletter scheduling cron error:", error);
    return NextResponse.json(
      {
        error: "Failed to process scheduled newsletters",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
