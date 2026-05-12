/**
 * Typed enqueue functions for all pg-boss queues.
 *
 * server-only — never import in Client Components or edge runtime.
 */

import "server-only";
import { getBoss } from "./client";
import type {
  SendWorkflowPayload,
  CurateWorkflowPayload,
  PublishWorkflowPayload,
  CleanupWorkflowPayload,
} from "@/lib/newsletter/lib/queue/types";

// ---------------------------------------------------------------------------
// Queue names (single source of truth)
// ---------------------------------------------------------------------------

export const QUEUE = {
  NEWSLETTER_SEND: "newsletter-send",
  NEWSLETTER_CURATE: "newsletter-curate",
  NEWSLETTER_PUBLISH: "newsletter-publish",
  NEWSLETTER_CLEANUP: "newsletter-cleanup",
  OUTREACH_SEND_EMAIL: "outreach-send-email",
} as const;

// ---------------------------------------------------------------------------
// Outreach payload
// ---------------------------------------------------------------------------

export interface OutreachSendEmailPayload {
  contactId: string;
  campaignId: string;
  emailNumber: 1 | 2 | 3;
  unsubscribeUrl: string;
  forceTextOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Enqueue functions
// ---------------------------------------------------------------------------

export async function enqueueNewsletterSend(payload: SendWorkflowPayload): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(QUEUE.NEWSLETTER_SEND, payload, {
    retryLimit: 2,
    retryDelay: 60,
    expireInSeconds: 900,
  });
}

export async function enqueueNewsletterCurate(
  payload: CurateWorkflowPayload,
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(QUEUE.NEWSLETTER_CURATE, payload, {
    retryLimit: 2,
    retryDelay: 60,
    expireInSeconds: 900,
  });
}

export async function enqueueNewsletterPublish(
  payload: PublishWorkflowPayload,
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(QUEUE.NEWSLETTER_PUBLISH, payload, {
    retryLimit: 2,
    retryDelay: 60,
    expireInSeconds: 1800,
  });
}

export async function enqueueNewsletterCleanup(
  payload: CleanupWorkflowPayload,
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(QUEUE.NEWSLETTER_CLEANUP, payload, {
    retryLimit: 1,
    retryDelay: 120,
    expireInSeconds: 3600,
  });
}

export async function enqueueOutreachSendEmail(
  payload: OutreachSendEmailPayload,
  options?: { startAfter?: number },
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(QUEUE.OUTREACH_SEND_EMAIL, payload, {
    retryLimit: 2,
    retryDelay: 60,
    expireInSeconds: 600,
    ...(options?.startAfter != null && { startAfter: options.startAfter }),
  });
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function getQueueHealth(): Promise<{
  healthy: boolean;
  issues: string[];
}> {
  try {
    const boss = await getBoss();
    // pg-boss exposes getQueueSize; if it returns without error the DB connection is alive
    await boss.getQueueStats(QUEUE.NEWSLETTER_SEND);
    return { healthy: true, issues: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { healthy: false, issues: [`pg-boss health check failed: ${message}`] };
  }
}
