/**
 * Newsletter queue client (pg-boss)
 *
 * Provides the same exported function names as the old QStash client so
 * callers don't need to change their imports.
 */

import { logger } from "../logger";
import {
  enqueueNewsletterSend,
  enqueueNewsletterCurate,
  enqueueNewsletterPublish,
  enqueueNewsletterCleanup,
} from "@/lib/queue";
import type {
  SendWorkflowPayload,
  CurateWorkflowPayload,
  CleanupWorkflowPayload,
  PublishWorkflowPayload,
} from "./types";

/**
 * Enqueue the full newsletter send workflow (curate → generate → publish).
 * Returns a synthetic workflowRunId (the pg-boss job id).
 */
export async function triggerSendWorkflow(
  payload: SendWorkflowPayload,
): Promise<{ workflowRunId: string }> {
  const jobId = await enqueueNewsletterSend(payload);

  logger.info({ jobId, campaignId: payload.campaignId }, "newsletter-send job enqueued");

  return { workflowRunId: jobId ?? "unknown" };
}

/**
 * Enqueue a publish-only job for an already-generated newsletter edition.
 */
export async function triggerPublishWorkflow(
  payload: PublishWorkflowPayload,
): Promise<{ workflowRunId: string }> {
  const jobId = await enqueueNewsletterPublish(payload);

  logger.info(
    { jobId, campaignId: payload.campaignId, newsletterId: payload.newsletterId },
    "newsletter-publish job enqueued",
  );

  return { workflowRunId: jobId ?? "unknown" };
}

/**
 * Enqueue a standalone curation job.
 */
export async function triggerCurateWorkflow(
  payload: CurateWorkflowPayload,
): Promise<{ workflowRunId: string }> {
  const jobId = await enqueueNewsletterCurate(payload);

  logger.info({ jobId, campaignId: payload.campaignId }, "newsletter-curate job enqueued");

  return { workflowRunId: jobId ?? "unknown" };
}

/**
 * Enqueue a cleanup job.
 */
export async function triggerCleanupWorkflow(
  payload: CleanupWorkflowPayload,
): Promise<{ workflowRunId: string }> {
  const jobId = await enqueueNewsletterCleanup(payload);

  logger.info({ jobId }, "newsletter-cleanup job enqueued");

  return { workflowRunId: jobId ?? "unknown" };
}

/**
 * Cancel a job by id. pg-boss does not support cancel-by-id for already-started jobs,
 * but we can delete a scheduled/queued job via the internal API. For now this is a no-op
 * that logs a warning — production use case is uncommon.
 */
export async function cancelWorkflowRun(workflowRunId: string): Promise<void> {
  logger.warn(
    { workflowRunId },
    "cancelWorkflowRun called — pg-boss cancellation is not implemented; job will run to completion",
  );
}
