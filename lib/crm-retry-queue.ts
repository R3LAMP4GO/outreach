/**
 * CRM Sync Retry Queue
 *
 * Provides resilient CRM synchronization by queueing failed operations
 * for automatic retry with exponential backoff. Prevents data loss when
 * the database is temporarily unavailable.
 *
 * Usage:
 *   import { enqueueCrmOperation, processCrmQueue } from '@/lib/crm-retry-queue'
 *
 *   // In API route - enqueue failed operation
 *   await enqueueCrmOperation('upsert_contact', payload, submissionId)
 *
 *   // In cron job - process pending operations
 *   await processCrmQueue()
 */

import { db } from "@/lib/db";
import { crmSyncQueue, contactSubmissions, contacts, deals } from "@/lib/db/schema";
import { eq, sql, inArray, and, lt } from "drizzle-orm";
import { logger } from "@/lib/logger";

// Exponential backoff schedule (in seconds)
const RETRY_DELAYS = [
  60, // 1 minute
  300, // 5 minutes
  900, // 15 minutes
  3600, // 1 hour
  21600, // 6 hours
];

type OperationType =
  | "upsert_contact"
  | "create_deal"
  | "link_submission"
  | "newsletter_subscriber_sync";

interface UpsertContactPayload {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  company: string | null;
  notes: string;
  contactStatus: string;
  source: string;
  originalSource: string;
  originalSourceDetail: string;
  originalUtmSource: string | null;
  originalUtmMedium: string | null;
  originalUtmCampaign: string | null;
  latestSource: string;
  latestSourceDetail: string;
  latestUtmSource: string | null;
  latestUtmMedium: string | null;
  latestUtmCampaign: string | null;
  firstTouchDate: string;
  lastTouchDate: string;
}

interface CreateDealPayload {
  contactId: string;
  dealName: string;
  stageId: string;
  notes: string;
  source: string;
  stageEnteredAt: string;
}

interface LinkSubmissionPayload {
  contactId: string;
}

interface NewsletterSubscriberPayload {
  email: string;
  verifiedAt: string;
}

type QueuePayload =
  | UpsertContactPayload
  | CreateDealPayload
  | LinkSubmissionPayload
  | NewsletterSubscriberPayload;

/**
 * Enqueue a failed CRM operation for retry
 */
export async function enqueueCrmOperation(
  operationType: OperationType,
  payload: QueuePayload,
  submissionId?: string,
  contactId?: string,
): Promise<void> {
  try {
    // Calculate initial retry time (1 minute from now)
    const nextRetryAt = new Date(Date.now() + RETRY_DELAYS[0] * 1000).toISOString();

    await db.insert(crmSyncQueue).values({
      operationType,
      payload: payload as unknown as Record<string, unknown>,
      submissionId: submissionId || null,
      contactId: contactId || null,
      attempts: 0,
      maxAttempts: RETRY_DELAYS.length,
      nextRetryAt,
      status: "pending",
    });

    logger.info(`Enqueued ${operationType} for retry`, {
      submissionId,
      contactId,
      nextRetryAt,
    });
  } catch (error) {
    logger.error("Failed to enqueue CRM operation:", error, {
      operationType,
      submissionId,
      contactId,
    });
  }
}

/**
 * Process pending items in the retry queue
 * Should be called by a cron job or background worker
 */
export async function processCrmQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const now = new Date().toISOString();

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    // Atomically claim a batch of pending items ready for retry.
    // Using `FOR UPDATE SKIP LOCKED` ensures concurrent cron invocations
    // (e.g. Vercel retries or overlapping schedules) claim disjoint sets
    // of rows — preventing duplicate CRM upserts / deal creations.
    type ClaimedRow = {
      id: string;
      operation_type: string;
      payload: unknown;
      submission_id: string | null;
      contact_id: string | null;
      attempts: number;
      max_attempts: number;
    };

    const claimedRows = await db.execute<ClaimedRow>(sql`
      UPDATE crm_sync_queue
      SET status = 'processing', updated_at = NOW()
      WHERE id IN (
        SELECT id FROM crm_sync_queue
        WHERE status = 'pending' AND next_retry_at <= ${now}
        ORDER BY created_at ASC
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, operation_type, payload, submission_id, contact_id, attempts, max_attempts
    `);

    const queueItems = claimedRows.map((r) => ({
      id: r.id,
      operationType: r.operation_type,
      payload: r.payload,
      submissionId: r.submission_id,
      contactId: r.contact_id,
      attempts: r.attempts,
      maxAttempts: r.max_attempts,
    }));

    if (queueItems.length === 0) {
      logger.info("No pending queue items to process");
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    logger.info(`Claimed ${queueItems.length} queue items for processing`);

    // Process each item (already marked as 'processing' atomically above)
    for (const item of queueItems) {
      processed++;

      try {
        // Execute the operation
        const success = await executeOperation(
          item.operationType as OperationType,
          item.payload as QueuePayload,
          item.submissionId,
          item.contactId,
        );

        if (success) {
          // Mark as completed
          await db
            .update(crmSyncQueue)
            .set({
              status: "completed",
              completedAt: now,
            })
            .where(eq(crmSyncQueue.id, item.id));

          succeeded++;
          logger.info(`Successfully processed ${item.operationType}`, {
            queueId: item.id,
            attempts: item.attempts + 1,
          });
        } else {
          // Increment attempts and schedule next retry
          const newAttempts = item.attempts + 1;

          if (newAttempts >= item.maxAttempts) {
            // Max retries exceeded - mark as failed
            await db
              .update(crmSyncQueue)
              .set({
                status: "failed",
                attempts: newAttempts,
                completedAt: now,
                lastError: "Max retry attempts exceeded",
              })
              .where(eq(crmSyncQueue.id, item.id));

            failed++;
            logger.error(`Max retries exceeded for ${item.operationType}`, {
              queueId: item.id,
              attempts: newAttempts,
              submissionId: item.submissionId,
            });
          } else {
            // Schedule next retry with exponential backoff
            const delaySeconds = RETRY_DELAYS[newAttempts] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
            const nextRetry = new Date(Date.now() + delaySeconds * 1000).toISOString();

            await db
              .update(crmSyncQueue)
              .set({
                status: "pending",
                attempts: newAttempts,
                nextRetryAt: nextRetry,
                lastError: "Operation failed, will retry",
              })
              .where(eq(crmSyncQueue.id, item.id));

            logger.warn(`Retry scheduled for ${item.operationType}`, {
              queueId: item.id,
              attempts: newAttempts,
              nextRetry,
            });
          }
        }
      } catch (error) {
        logger.error("Error processing queue item:", error, {
          queueId: item.id,
          operationType: item.operationType,
        });

        // Update with error, keep as pending for next attempt
        const newAttempts = item.attempts + 1;
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (newAttempts >= item.maxAttempts) {
          await db
            .update(crmSyncQueue)
            .set({
              status: "failed",
              attempts: newAttempts,
              completedAt: now,
              lastError: errorMessage,
            })
            .where(eq(crmSyncQueue.id, item.id));
          failed++;
        } else {
          const delaySeconds = RETRY_DELAYS[newAttempts] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
          const nextRetry = new Date(Date.now() + delaySeconds * 1000).toISOString();

          await db
            .update(crmSyncQueue)
            .set({
              status: "pending",
              attempts: newAttempts,
              nextRetryAt: nextRetry,
              lastError: errorMessage,
            })
            .where(eq(crmSyncQueue.id, item.id));
        }
      }
    }

    logger.info("Queue processing complete", {
      processed,
      succeeded,
      failed,
    });

    return { processed, succeeded, failed };
  } catch (error) {
    logger.error("Fatal error processing CRM queue:", error);
    return { processed, succeeded, failed };
  }
}

/**
 * Execute a queued CRM operation
 * Returns true on success, false on failure
 */
async function executeOperation(
  operationType: OperationType,
  payload: QueuePayload,
  submissionId: string | null,
  _contactId: string | null,
): Promise<boolean> {
  try {
    switch (operationType) {
      case "upsert_contact": {
        const p = payload as UpsertContactPayload;

        // Type definition for the function return value
        type ContactUpsertResult = {
          contact_id: string;
          created: boolean;
          updated: boolean;
          status_applied: string;
        };

        // Call the RPC function via raw SQL
        const rows = await db.execute<ContactUpsertResult>(sql`
          SELECT * FROM upsert_contact_with_hierarchy_protection(
            p_email := ${p.email},
            p_first_name := ${p.firstName},
            p_last_name := ${p.lastName},
            p_phone := ${p.phone},
            p_company := ${p.company},
            p_notes := ${p.notes},
            p_contact_status := ${p.contactStatus},
            p_source := ${p.source},
            p_original_source := ${p.originalSource},
            p_original_source_detail := ${p.originalSourceDetail},
            p_original_utm_source := ${p.originalUtmSource},
            p_original_utm_medium := ${p.originalUtmMedium},
            p_original_utm_campaign := ${p.originalUtmCampaign},
            p_first_touch_date := ${p.firstTouchDate},
            p_latest_source := ${p.latestSource},
            p_latest_source_detail := ${p.latestSourceDetail},
            p_latest_utm_source := ${p.latestUtmSource},
            p_latest_utm_medium := ${p.latestUtmMedium},
            p_latest_utm_campaign := ${p.latestUtmCampaign},
            p_last_touch_date := ${p.lastTouchDate},
            p_updated_at := ${new Date().toISOString()}
          )
        `);

        const row = rows[0];

        if (!row) {
          logger.error("Upsert contact returned no result");
          return false;
        }

        logger.info(
          `Retry upsert contact: ${row.contact_id} (status: ${row.status_applied}, created: ${row.created})`,
        );

        // If we have a submission_id, link it to the contact
        if (submissionId && row.contact_id) {
          await db
            .update(contactSubmissions)
            .set({ contactId: row.contact_id })
            .where(eq(contactSubmissions.id, submissionId));
        }

        return true;
      }

      case "create_deal": {
        const p = payload as CreateDealPayload;

        try {
          await db.insert(deals).values({
            contactId: p.contactId,
            name: p.dealName,
            stageId: p.stageId,
            stageEnteredAt: p.stageEnteredAt,
            source: p.source,
            status: "open",
            notes: p.notes,
          });
        } catch (error) {
          // Check if unique constraint violation (deal already exists)
          if (error instanceof Error && (error as { code?: string }).code === "23505") {
            logger.info("Deal already exists (race condition resolved)");
            return true; // Treat as success
          }

          logger.error("Create deal failed:", error);
          return false;
        }

        return true;
      }

      case "link_submission": {
        const p = payload as LinkSubmissionPayload;

        if (!submissionId) {
          logger.error("Link submission requires submissionId");
          return false;
        }

        await db
          .update(contactSubmissions)
          .set({ contactId: p.contactId })
          .where(eq(contactSubmissions.id, submissionId));

        return true;
      }

      case "newsletter_subscriber_sync": {
        const p = payload as NewsletterSubscriberPayload;

        // Use RPC function for consistency and hierarchy protection
        type ContactUpsertResult = {
          contact_id: string;
          created: boolean;
          updated: boolean;
          status_applied: string;
        };

        const rows = await db.execute<ContactUpsertResult>(sql`
          SELECT * FROM upsert_contact_with_hierarchy_protection(
            p_email := ${p.email},
            p_contact_status := ${"subscriber"},
            p_source := ${"newsletter_signup"},
            p_original_source := ${"newsletter_signup"},
            p_original_source_detail := ${"Newsletter subscription verified"},
            p_first_touch_date := ${p.verifiedAt},
            p_latest_source := ${"newsletter_signup"},
            p_latest_source_detail := ${"Newsletter subscription verified"},
            p_last_touch_date := ${p.verifiedAt},
            p_updated_at := ${p.verifiedAt}
          )
        `);

        const row = rows[0];

        if (!row) {
          logger.error("Newsletter sync returned no result");
          return false;
        }

        // Mark contact as newsletter subscriber in CRM
        await db
          .update(contacts)
          .set({ isNewsletterSubscriber: true })
          .where(eq(contacts.id, row.contact_id));

        logger.info(
          `Newsletter subscriber synced: ${row.contact_id} (status: ${row.status_applied})`,
        );
        return true;
      }

      default:
        logger.error("Unknown operation type:", operationType);
        return false;
    }
  } catch (error) {
    logger.error("Execute operation error:", error);
    return false;
  }
}

/**
 * Cleanup old completed/failed queue items
 * Should be called periodically (e.g., daily cron)
 */
export async function cleanupCrmQueue(retentionDays = 7): Promise<number> {
  try {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

    const deleted = await db
      .delete(crmSyncQueue)
      .where(
        and(
          inArray(crmSyncQueue.status, ["completed", "failed"]),
          lt(crmSyncQueue.completedAt, cutoffDate),
        ),
      )
      .returning({ id: crmSyncQueue.id });

    const deletedCount = deleted.length;
    logger.info(`Cleaned up ${deletedCount} old queue items`);

    return deletedCount;
  } catch (error) {
    logger.error("Cleanup queue error:", error);
    return 0;
  }
}
