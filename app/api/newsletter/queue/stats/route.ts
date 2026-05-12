/**
 * Newsletter Queue Statistics API
 *
 * Get workflow health metrics and recent runs
 *
 * GET /api/newsletter/queue/stats - Get queue statistics
 */

import { NextRequest, NextResponse } from "next/server";
import { getQueueHealth, getRecentWorkflowRuns } from "@/lib/newsletter/lib/queue";
import { logger } from "@/lib/logger";
import { compareApiKeys } from "@/lib/auth/compare-api-keys";

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
 * GET /api/newsletter/queue/stats
 * Get workflow health and recent runs
 */
export async function GET(request: NextRequest) {
  try {
    // Verify API key
    if (!verifyApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get health and recent runs
    const [health, recentRuns] = await Promise.all([getQueueHealth(), getRecentWorkflowRuns(10)]);

    return NextResponse.json({
      success: true,
      health,
      recentRuns,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching queue stats:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch queue statistics",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
