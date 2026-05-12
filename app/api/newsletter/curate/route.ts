/**
 * Newsletter Curation API
 *
 * Triggers a QStash workflow to fetch, dedupe, score, and filter articles.
 *
 * POST /api/newsletter/curate
 * - Starts content curation workflow
 * - Returns workflow run ID for status tracking
 */

import { NextRequest, NextResponse } from "next/server";
import { triggerCurateWorkflow } from "@/lib/newsletter/lib/queue";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { compareApiKeys } from "@/lib/auth/compare-api-keys";

// Validation schema
const CurateRequestSchema = z.object({
  campaignId: z.string().min(1, "Campaign ID is required"),
  sources: z.array(z.string()).min(1, "At least one source is required"),
  maxArticles: z.number().int().positive().optional().default(15),
  userId: z.string().optional(),
});

/**
 * Verify API key using constant-time comparison
 */
function verifyApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get("x-api-key");
  const validKey = process.env.NEWSLETTER_API_KEY;

  if (!validKey) {
    logger.warn("NEWSLETTER_API_KEY not configured");
    return false;
  }

  if (!apiKey) {
    return false;
  }

  return compareApiKeys(apiKey, validKey);
}

/**
 * POST /api/newsletter/curate
 * Trigger a curation workflow
 */
export async function POST(request: NextRequest) {
  try {
    // Verify API key
    if (!verifyApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = CurateRequestSchema.parse(body);

    // Trigger QStash workflow
    const { workflowRunId } = await triggerCurateWorkflow({
      campaignId: validatedData.campaignId,
      sources: validatedData.sources,
      maxArticles: validatedData.maxArticles,
      userId: validatedData.userId,
    });

    return NextResponse.json(
      {
        success: true,
        workflowRunId,
        message: "Curation workflow triggered successfully",
        data: {
          campaignId: validatedData.campaignId,
          sources: validatedData.sources,
          maxArticles: validatedData.maxArticles,
        },
        statusUrl: `/api/newsletter/jobs/${workflowRunId}`,
      },
      { status: 202 },
    );
  } catch (error) {
    logger.error("Error in curate endpoint:", error);

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
        error: "Failed to trigger curation workflow",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
