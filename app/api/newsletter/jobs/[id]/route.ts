/**
 * Newsletter Job Status API
 *
 * Check status of workflow runs via QStash API
 *
 * GET /api/newsletter/jobs/[id] - Get workflow run status
 * DELETE /api/newsletter/jobs/[id] - Cancel a workflow run
 */

import { NextRequest, NextResponse } from "next/server";
import { getWorkflowRunStatus, cancelWorkflow } from "@/lib/newsletter/lib/queue";
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
 * GET /api/newsletter/jobs/[id]
 * Get workflow run status
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Verify API key
    if (!verifyApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get workflow run status from QStash
    const status = await getWorkflowRunStatus(id);

    if (!status) {
      return NextResponse.json({ error: "Workflow run not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      workflow: {
        workflowRunId: status.workflowRunId,
        workflowUrl: status.workflowUrl,
        state: status.workflowState,
        createdAt: new Date(status.createdAt).toISOString(),
        updatedAt: new Date(status.updatedAt).toISOString(),
      },
    });
  } catch (error) {
    logger.error("Error fetching workflow status:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch workflow status",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/newsletter/jobs/[id]
 * Cancel a workflow run
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Verify API key
    if (!verifyApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    await cancelWorkflow(id);

    return NextResponse.json({
      success: true,
      message: "Workflow run cancelled successfully",
    });
  } catch (error) {
    logger.error("Error cancelling workflow:", error);
    return NextResponse.json(
      {
        error: "Failed to cancel workflow",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
