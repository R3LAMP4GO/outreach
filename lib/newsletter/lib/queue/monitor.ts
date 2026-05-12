/**
 * Queue Monitoring Utilities (pg-boss)
 *
 * Provides tools for monitoring job status via pg-boss.
 */

import { logger } from "../logger";
import { cancelWorkflowRun } from "./qstash-client";
import { getQueueHealth as pgBossHealth } from "@/lib/queue";

/**
 * Workflow Run Status
 *
 * Kept for API compatibility — maps pg-boss job fields onto the old structure.
 */
export interface WorkflowRunStatus {
  workflowRunId: string;
  workflowUrl: string;
  workflowState: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Queue Statistics
 */
export interface QueueStats {
  timestamp: Date;
}

/**
 * Get workflow run status by ID.
 *
 * pg-boss does not expose a public getJob API, so this always returns null.
 * Callers that stored workflowRunIds should query the `pgboss.job` table
 * directly if they need this level of detail.
 */
export async function getWorkflowRunStatus(
  workflowRunId: string,
): Promise<WorkflowRunStatus | null> {
  logger.debug({ workflowRunId }, "getWorkflowRunStatus called — not supported with pg-boss");
  return null;
}

/**
 * Get recent workflow runs.
 *
 * Not directly supported via pg-boss public API; returns empty array.
 */
export async function getRecentWorkflowRuns(count: number = 10): Promise<WorkflowRunStatus[]> {
  logger.debug({ count }, "getRecentWorkflowRuns called — not supported with pg-boss");
  return [];
}

/**
 * Cancel a workflow run.
 */
export async function cancelWorkflow(workflowRunId: string): Promise<void> {
  await cancelWorkflowRun(workflowRunId);
}

/**
 * Get queue health metrics using pg-boss DB health check.
 */
export async function getQueueHealth(): Promise<{
  healthy: boolean;
  issues: string[];
}> {
  try {
    return await pgBossHealth();
  } catch (error) {
    logger.error({ error }, "Failed to get queue health");
    return {
      healthy: false,
      issues: ["Failed to connect to pg-boss"],
    };
  }
}
