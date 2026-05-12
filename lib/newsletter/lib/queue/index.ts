/**
 * Queue Library
 *
 * QStash Workflow-based job queue for reliable newsletter processing.
 *
 * Features:
 * - Durable workflow execution via QStash
 * - Automatic retries with step-level durability
 * - No separate worker process needed
 * - Serverless-compatible (runs on Vercel)
 *
 * Architecture:
 * - Workflow endpoints: Handle job execution via `serve()`
 * - QStash Client: Triggers workflows and manages runs
 * - Jobs: Type-safe job processors for each operation
 * - Monitor: Workflow status and health checks
 */

// Types
export type {
  CurateJobData,
  GenerateJobData,
  PublishJobData,
  CleanupJobData,
  CurateJobResult,
  GenerateJobResult,
  PublishJobResult,
  CleanupJobResult,
  SendWorkflowPayload,
  CurateWorkflowPayload,
  CleanupWorkflowPayload,
  PublishWorkflowPayload,
} from "./types";

// Queue Client
export {
  triggerSendWorkflow,
  triggerPublishWorkflow,
  triggerCurateWorkflow,
  triggerCleanupWorkflow,
  cancelWorkflowRun,
} from "./qstash-client";

// Job Processors
export { processCurateJob } from "./jobs/curate-job";
export { processGenerateJob } from "./jobs/generate-job";
export { processPublishJob } from "./jobs/publish-job";
export { processCleanupJob } from "./jobs/cleanup-job";

// Monitoring
export {
  getWorkflowRunStatus,
  getRecentWorkflowRuns,
  cancelWorkflow,
  getQueueHealth,
  type WorkflowRunStatus,
  type QueueStats,
} from "./monitor";
