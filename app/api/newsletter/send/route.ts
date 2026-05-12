/**
 * Newsletter Send API
 *
 * Trigger newsletter send (full workflow: curate → generate → publish)
 *
 * POST /api/newsletter/send - Send newsletter for a campaign
 */

import { NextRequest, NextResponse } from "next/server";
import { triggerSendWorkflow } from "@/lib/newsletter/lib/queue";
import { db } from "@/lib/db";
import { newsletterCampaigns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { compareApiKeys } from "@/lib/auth/compare-api-keys";

// Send request schema
const SendNewsletterSchema = z.object({
  campaignId: z.string().min(1, "Campaign ID is required"),
  testMode: z.boolean().optional().default(false),
  testEmails: z.array(z.string().email()).optional(),
  sources: z.array(z.string()).optional(),
  maxArticles: z.number().int().positive().optional(),
});

/**
 * POST /api/newsletter/send
 * Send newsletter (full workflow)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify API key using constant-time comparison
    const apiKey = request.headers.get("x-api-key");
    const validKey = process.env.NEWSLETTER_API_KEY;

    if (!validKey) {
      logger.warn("NEWSLETTER_API_KEY not configured");
    }

    if (!apiKey || !validKey || !compareApiKeys(apiKey, validKey)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limiting
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const rateLimitResult = await import("@/lib/rate-limit").then((m) =>
      m.checkRateLimit(`api-key:${ip}`, m.rateLimiters.api, "api"),
    );

    if (!rateLimitResult.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = SendNewsletterSchema.parse(body);

    // Get campaign details
    const [campaign] = await db
      .select()
      .from(newsletterCampaigns)
      .where(eq(newsletterCampaigns.id, validatedData.campaignId))
      .limit(1);

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Check campaign status
    if (campaign.status !== "active" && !validatedData.testMode) {
      return NextResponse.json(
        {
          error: "Campaign is not active",
          details: "Only active campaigns can send newsletters (use testMode for testing)",
        },
        { status: 400 },
      );
    }

    // Determine sources and article limit
    const sources =
      validatedData.sources ||
      (Array.isArray(campaign.sources)
        ? (campaign.sources as Array<Record<string, string>>).map((s) => s.type)
        : []);
    const maxArticles = validatedData.maxArticles || campaign.articleLimit;

    // Trigger QStash workflow
    const { workflowRunId } = await triggerSendWorkflow({
      campaignId: campaign.id,
      sources,
      maxArticles,
      testMode: validatedData.testMode,
      testEmails: validatedData.testEmails,
    });

    return NextResponse.json(
      {
        success: true,
        message: validatedData.testMode
          ? "Test newsletter workflow started"
          : "Newsletter workflow started",
        workflow: {
          workflowRunId,
          campaignId: campaign.id,
          campaignName: campaign.name,
          testMode: validatedData.testMode,
        },
        statusUrl: `/api/newsletter/jobs/${workflowRunId}`,
      },
      { status: 202 },
    );
  } catch (error) {
    logger.error("Error sending newsletter:", error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: error.issues,
        },
        { status: 400 },
      );
    }

    // Handle other errors
    return NextResponse.json(
      {
        error: "Failed to send newsletter",
        ...(process.env.NODE_ENV === "development" && {
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      },
      { status: 500 },
    );
  }
}
