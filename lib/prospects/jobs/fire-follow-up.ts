/**
 * pg-boss handler: prospect-follow-up
 *
 * Fires at the scheduled `dueAt` of a `prospect_follow_ups` row. The job was
 * enqueued by either:
 *
 *   - `process-quo-call` when the AI extraction surfaced a follow-up intent
 *     with a concrete date, OR
 *   - the admin route (`PATCH /api/admin/prospects/[id]/follow-ups/[followUpId]`)
 *     when the user snoozed an existing reminder to a later date.
 *
 * Responsibility
 * --------------
 * 1. Load the follow-up row by id. Short-circuit if it has been completed
 *    or cancelled in the meantime (the source of truth is the row, not the
 *    queue). A snoozed row still fires once \u2014 the snooze action enqueues a
 *    fresh job, but if the old one slips through pg-boss's cancel window
 *    we don't want to swallow it.
 * 2. Load the prospect + (optional) contact so the notification can show a
 *    human-readable title.
 * 3. Pick a recipient user id: `prospect.assignedUserId` if set, otherwise
 *    fall back to the first admin (matches the existing convention in
 *    `poll-cap-analytics` / `webhook-handlers.notifyAdmin`).
 * 4. Insert a `follow_up_due` notification with `relatedId = prospect.id`
 *    so the UI can deep-link to `/admin/prospecting/{id}`.
 *
 * We deliberately DO NOT flip the follow-up status here \u2014 the admin marks
 * it `completed` from the UI. Auto-flipping would hide the reminder before
 * the user has actually done anything about it.
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/worker";
import { adminUsers, contacts, notifications, prospectFollowUps, prospects } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

// ─── Public payload + handler ────────────────────────────────────────────────

export interface FireFollowUpJob {
  data: {
    followUpId: string;
  };
}

/**
 * Statuses that should still trigger a notification when the scheduled job
 * fires. `completed` and `cancelled` short-circuit; `pending` is the default
 * for fresh rows; `snoozed` is the resting state after the admin re-armed
 * the reminder via PATCH.
 */
const FIRABLE_STATUSES = new Set(["pending", "snoozed"]);

export async function handleFireFollowUp(job: FireFollowUpJob): Promise<void> {
  const { followUpId } = job.data;
  logger.info("[fire-follow-up] start", { followUpId });

  // ---------------------------------------------------------------------------
  // 1. Load the follow-up + short-circuit if no longer fireable.
  // ---------------------------------------------------------------------------
  const [followUp] = await db
    .select({
      id: prospectFollowUps.id,
      prospectId: prospectFollowUps.prospectId,
      contactId: prospectFollowUps.contactId,
      reason: prospectFollowUps.reason,
      status: prospectFollowUps.status,
    })
    .from(prospectFollowUps)
    .where(eq(prospectFollowUps.id, followUpId))
    .limit(1);

  if (!followUp) {
    logger.warn("[fire-follow-up] follow-up not found \u2014 skipping", { followUpId });
    return;
  }

  if (!FIRABLE_STATUSES.has(followUp.status)) {
    logger.info("[fire-follow-up] follow-up no longer pending \u2014 skipping", {
      followUpId,
      status: followUp.status,
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // 2. Load the prospect (required for the notification title + link).
  // ---------------------------------------------------------------------------
  const [prospect] = await db
    .select({
      id: prospects.id,
      businessName: prospects.businessName,
      assignedUserId: prospects.assignedUserId,
    })
    .from(prospects)
    .where(eq(prospects.id, followUp.prospectId))
    .limit(1);

  if (!prospect) {
    logger.warn("[fire-follow-up] prospect not found \u2014 skipping", {
      followUpId,
      prospectId: followUp.prospectId,
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // 3. Load the contact name (optional \u2014 used in the notification title).
  // ---------------------------------------------------------------------------
  let contactName: string | null = null;
  if (followUp.contactId) {
    const [contact] = await db
      .select({
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(contacts)
      .where(eq(contacts.id, followUp.contactId))
      .limit(1);
    if (contact) {
      const parts = [contact.firstName, contact.lastName].filter(
        (p): p is string => typeof p === "string" && p.trim().length > 0,
      );
      contactName = parts.length > 0 ? parts.join(" ") : null;
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Pick a recipient: assigned user > first admin > skip.
  // ---------------------------------------------------------------------------
  let userId: string | null = prospect.assignedUserId;
  if (!userId) {
    const [admin] = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
    userId = admin?.id ?? null;
  }

  if (!userId) {
    logger.warn("[fire-follow-up] no admin user to receive notification \u2014 skipping", {
      followUpId,
      prospectId: prospect.id,
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // 5. Insert the notification.
  // ---------------------------------------------------------------------------
  const title = `Follow up: ${contactName ?? prospect.businessName}`;
  const message = followUp.reason?.trim() || "Scheduled follow-up";

  await db.insert(notifications).values({
    userId,
    type: "follow_up_due",
    priority: "INFO",
    title,
    message,
    relatedId: prospect.id,
    relatedType: "prospect",
  });

  logger.info("[fire-follow-up] notification created", {
    followUpId,
    prospectId: prospect.id,
    userId,
  });
}
