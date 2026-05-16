/**
 * Inline handlers for the lightweight Quo webhook events that do NOT need
 * AI extraction or transcript fetch.
 *
 * Separated from `app/api/webhooks/quo/route.ts` so the route stays a
 * pure dispatcher and these handlers stay individually unit-testable.
 *
 * - `handleQuoMessageReceived`: inbound SMS. Find prospect by phone, write a
 *   `sms_received` timeline event, create an in-app notification for the
 *   admin so they see the message in their inbox.
 *
 * - `handleQuoMessageDelivered`: outbound SMS delivery receipt. Write a
 *   `sms_sent` timeline event tagged `metadata.delivered = true` so the
 *   activity log shows the send completed end-to-end.
 *
 * Both handlers are best-effort. They MUST NOT throw on missing-prospect or
 * timeline-write failures \u2014 the webhook route returns 200 as long as the
 * idempotency record was inserted, and we don't want a missing prospect to
 * convert into Quo retrying the same event forever.
 */
import "server-only";

import { and, desc, eq, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { adminUsers, contacts, notifications, prospects } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { writeTimelineEvent } from "@/lib/crm/timeline";

import type { QuoMessageDeliveredEvent, QuoMessageReceivedEvent } from "./webhook-types";

// ─── Phone normalisation ─────────────────────────────────────────────────────

/**
 * Strip every non-digit character. Quo phone numbers arrive as `+15551234567`;
 * prospects in our DB may have been entered as `(555) 123-4567`, `555.123.4567`,
 * `+15551234567`, etc. Comparing digits-only sidesteps all the formatting drift.
 */
export function normalisePhoneDigits(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\D+/g, "");
}

/**
 * Decide which side of a Quo call/message is the prospect.
 *
 * Quo's own number lives in `QUO_PHONE_NUMBER`. Whichever of `from` / `to`
 * does NOT match that is the external party we care about.
 *
 * Returns the prospect's number in E.164-ish form (whatever Quo sent).
 */
export function getProspectPhoneFromQuo(
  fromNumber: string,
  toNumber: string,
  ourQuoNumber: string | undefined,
): { prospectPhone: string; direction: "incoming" | "outgoing" } {
  const ours = normalisePhoneDigits(ourQuoNumber);
  const fromDigits = normalisePhoneDigits(fromNumber);
  const toDigits = normalisePhoneDigits(toNumber);

  if (ours && fromDigits === ours) {
    return { prospectPhone: toNumber, direction: "outgoing" };
  }
  if (ours && toDigits === ours) {
    return { prospectPhone: fromNumber, direction: "incoming" };
  }
  // No QUO_PHONE_NUMBER configured \u2014 fall back to the direction Quo claimed
  // on the wire. Best-effort; the operator should set the env var.
  return { prospectPhone: fromNumber, direction: "incoming" };
}

/**
 * Best-effort phone-based prospect lookup.
 *
 * Tries two strategies: an exact `prospects.phone = $1` match, then a
 * digits-only `regexp_replace(phone, '\\D', '', 'g') = $2` match. The latter
 * catches `(555) 123-4567` vs `+15551234567` formatting drift.
 *
 * Returns the most recent matching prospect (by `createdAt`) if there are
 * duplicates \u2014 dedupe at the prospect-import layer, not here.
 */
export async function findProspectByPhone(
  phoneRaw: string,
): Promise<{ id: string; businessName: string } | null> {
  if (!phoneRaw) return null;
  const digits = normalisePhoneDigits(phoneRaw);
  if (!digits) return null;

  try {
    const [row] = await db
      .select({ id: prospects.id, businessName: prospects.businessName })
      .from(prospects)
      .where(
        or(
          eq(prospects.phone, phoneRaw),
          sql`regexp_replace(${prospects.phone}, '\\D', '', 'g') = ${digits}`,
        ),
      )
      .orderBy(desc(prospects.createdAt))
      .limit(1);
    return row ?? null;
  } catch (err) {
    logger.error("findProspectByPhone failed", {
      phoneDigits: digits.slice(-6),
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Best-effort contact lookup for a prospect. Used by the delivered handler
 * so the timeline event lands on the contact's timeline (preferred) instead
 * of just the prospect's.
 */
async function findPrimaryContactForProspect(prospectId: string): Promise<{ id: string } | null> {
  try {
    const [row] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.prospectId, prospectId), eq(contacts.isPrimaryContact, true)))
      .limit(1);
    if (row) return row;

    // Fallback: any contact for this prospect, most recent first.
    const [fallback] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.prospectId, prospectId))
      .orderBy(desc(contacts.createdAt))
      .limit(1);
    return fallback ?? null;
  } catch (err) {
    logger.error("findPrimaryContactForProspect failed", {
      prospectId,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Insert an admin notification. Resolves to the inserted row or null on
 * failure \u2014 never throws.
 */
async function notifyAdmin(args: {
  type: string;
  priority?: "INFO" | "WARN" | "ERROR";
  title: string;
  message: string;
  relatedId?: string | null;
  relatedType?: string | null;
}): Promise<void> {
  try {
    const [admin] = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
    if (!admin) {
      logger.warn("notifyAdmin: no admin user found, skipping notification");
      return;
    }
    await db.insert(notifications).values({
      userId: admin.id,
      type: args.type,
      priority: args.priority ?? "INFO",
      title: args.title,
      message: args.message,
      relatedId: args.relatedId ?? null,
      relatedType: args.relatedType ?? null,
    });
  } catch (err) {
    logger.error("notifyAdmin failed", {
      type: args.type,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Public handlers ─────────────────────────────────────────────────────────

/**
 * Handle `message.received` (inbound SMS).
 *
 * Inline because it's a single timeline insert + a single notification insert
 * \u2014 no AI, no external fetch. Stays well under the 500 ms webhook budget.
 *
 * Best-effort: a missing prospect logs a warning and still creates the
 * notification, so the admin sees the message even when the sender isn't
 * a known prospect yet.
 */
export async function handleQuoMessageReceived(event: QuoMessageReceivedEvent): Promise<void> {
  const msg = event.data.object;
  const ourNumber = process.env.QUO_PHONE_NUMBER;
  const to = Array.isArray(msg.to) ? (msg.to[0] ?? "") : msg.to;
  const { prospectPhone } = getProspectPhoneFromQuo(msg.from, to, ourNumber);

  const prospect = await findProspectByPhone(prospectPhone);
  const contact = prospect ? await findPrimaryContactForProspect(prospect.id) : null;
  const bodyText = (msg.text ?? "").trim();
  const preview = bodyText.length > 120 ? `${bodyText.slice(0, 117)}\u2026` : bodyText;

  if (prospect) {
    await writeTimelineEvent({
      prospectId: prospect.id,
      contactId: contact?.id,
      eventType: "sms_received",
      title: `SMS from ${msg.from}`,
      description: preview || null,
      metadata: {
        messageId: msg.id,
        from: msg.from,
        to,
        body: bodyText,
        createdAt: msg.createdAt,
        quoConversationId: msg.conversationId ?? null,
      },
    });
  } else {
    logger.warn("Quo message.received: no prospect matched phone", {
      from: msg.from,
      messageId: msg.id,
    });
  }

  await notifyAdmin({
    type: "sms_received",
    title: prospect ? `New SMS from ${prospect.businessName}` : `New SMS from ${msg.from}`,
    message: preview || "(no message body)",
    relatedId: prospect?.id ?? msg.id,
    relatedType: prospect ? "prospect" : "quo_message",
  });
}

/**
 * Handle `message.delivered` (outbound SMS delivery receipt).
 *
 * The original `sms_sent` event was written when the message was queued.
 * This handler appends a delivery-receipt timeline event so the activity
 * log shows the outbound message reached the carrier.
 *
 * Best-effort: a missing prospect is logged and ignored \u2014 no notification,
 * since admins don't need to be pinged on every delivered SMS.
 */
export async function handleQuoMessageDelivered(event: QuoMessageDeliveredEvent): Promise<void> {
  const msg = event.data.object;
  const ourNumber = process.env.QUO_PHONE_NUMBER;
  const to = Array.isArray(msg.to) ? (msg.to[0] ?? "") : msg.to;
  const { prospectPhone } = getProspectPhoneFromQuo(msg.from, to, ourNumber);

  const prospect = await findProspectByPhone(prospectPhone);
  if (!prospect) {
    logger.warn("Quo message.delivered: no prospect matched phone", {
      to,
      messageId: msg.id,
    });
    return;
  }

  const contact = await findPrimaryContactForProspect(prospect.id);
  const bodyText = (msg.text ?? "").trim();
  const preview = bodyText.length > 120 ? `${bodyText.slice(0, 117)}\u2026` : bodyText;

  await writeTimelineEvent({
    prospectId: prospect.id,
    contactId: contact?.id,
    eventType: "sms_sent",
    title: `SMS delivered to ${to}`,
    description: preview || null,
    metadata: {
      messageId: msg.id,
      from: msg.from,
      to,
      body: bodyText,
      createdAt: msg.createdAt,
      delivered: true,
      quoConversationId: msg.conversationId ?? null,
    },
  });
}
