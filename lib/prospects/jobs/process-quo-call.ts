/**
 * pg-boss handler: process-quo-call
 *
 * Triggered three times per call (call.completed, call.summary.completed,
 * call.transcript.completed). The handler is idempotent at the callId level
 * via the `quo_calls_processed` table.
 *
 * Flow
 * ----
 * 1. Short-circuit if `quo_calls_processed` already has the callId.
 * 2. Fetch call metadata + summary + transcript from the Quo REST API.
 *    Quo's AI artefacts take a minute or two to generate after the call
 *    ends; if either is missing, throw so pg-boss retries with backoff
 *    (queue config: 5 retries, 2-minute delay = up to 10 min of patience).
 * 3. Run `extractCallData` (gg-ai) against summary + transcript.
 * 4. Find or create the prospect by phone (digits-only match against
 *    `prospects.phone`). The direction is determined by which of from/to
 *    matches `QUO_PHONE_NUMBER`.
 * 5. Upsert contact ONLY if the AI captured an email \u2014 `contacts.email`
 *    is NOT NULL in the schema, so a contact row without an email isn't
 *    representable. When no email, person info is logged on the prospect
 *    and stashed in the timeline event metadata instead.
 * 6. Update prospect.outreachStage (called \u2192 phone_captured \u2192 email_captured)
 *    and prospect.lastTouchedAt.
 * 7. Write `call_made` (outgoing) or `call_received` (incoming) timeline event
 *    with the full AI extraction in metadata.
 * 8. If the AI surfaced a follow-up intent + date, insert a row in
 *    `prospect_follow_ups` and enqueue a scheduled pg-boss job for that date.
 * 9. Insert into `quo_calls_processed` so subsequent triggers for the same
 *    callId are no-ops.
 *
 * Failure model
 * -------------
 * Any thrown error bubbles up to pg-boss, which records the job failure and
 * retries per the queue's retry config. Partial-ready (missing summary or
 * transcript) is the most common "failure" \u2014 we throw a `QuoArtefactsNotReadyError`
 * with a clear message so the operator can tell partial-ready from real
 * failures in the worker logs.
 */
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/worker";
import { contacts, prospectFollowUps, prospects, quoCallsProcessed } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { writeTimelineEvent } from "@/lib/crm/timeline";
import { enqueueProspectFollowUp } from "@/lib/queue";

import { extractCallData, type CallExtraction } from "@/lib/ai/gg-client";
import { getCall, getCallSummary, getCallTranscript } from "@/lib/quo/client";
import type { QuoCall } from "@/lib/quo/types";
import { getProspectPhoneFromQuo, normalisePhoneDigits } from "@/lib/quo/webhook-handlers";

// ─── Public payload + handler ────────────────────────────────────────────────

export interface ProcessQuoCallJob {
  data: {
    callId: string;
    hasSummary?: boolean;
    hasTranscript?: boolean;
  };
}

/**
 * Thrown when Quo hasn't finished generating the summary or transcript yet.
 *
 * Separate error class so the worker can log a `[partial-ready]` line vs.
 * the noisy stack trace it would print for an unexpected fault.
 */
export class QuoArtefactsNotReadyError extends Error {
  constructor(callId: string, missing: string[]) {
    super(`Quo artefacts not yet ready for ${callId}: missing [${missing.join(", ")}]`);
    this.name = "QuoArtefactsNotReadyError";
  }
}

export async function handleProcessQuoCall(job: ProcessQuoCallJob): Promise<void> {
  const { callId } = job.data;
  logger.info("[process-quo-call] start", {
    callId,
    hasSummary: job.data.hasSummary === true,
    hasTranscript: job.data.hasTranscript === true,
  });

  // ---------------------------------------------------------------------------
  // 1. Idempotency check
  // ---------------------------------------------------------------------------
  const existing = await db
    .select({ callId: quoCallsProcessed.callId })
    .from(quoCallsProcessed)
    .where(eq(quoCallsProcessed.callId, callId))
    .limit(1);
  if (existing.length > 0) {
    logger.info("[process-quo-call] already processed \u2014 skipping", { callId });
    return;
  }

  // ---------------------------------------------------------------------------
  // 2. Fetch artefacts. If summary OR transcript is missing, throw so
  //    pg-boss retries. Quo's AI usually takes 1\u20132 min to populate them.
  // ---------------------------------------------------------------------------
  const call = await getCall(callId);
  const [summary, transcript] = await Promise.all([
    getCallSummary(callId),
    getCallTranscript(callId),
  ]);

  const missing: string[] = [];
  if (!summary || !summary.summary.trim()) missing.push("summary");
  if (!transcript || transcript.dialogue.length === 0) missing.push("transcript");
  if (missing.length > 0) {
    logger.info("[process-quo-call] partial-ready \u2014 will retry", { callId, missing });
    throw new QuoArtefactsNotReadyError(callId, missing);
  }

  // ---------------------------------------------------------------------------
  // 3. Determine prospect phone + direction
  // ---------------------------------------------------------------------------
  const ourNumber = process.env.QUO_PHONE_NUMBER;
  const fromNumber = call.from ?? "";
  const toNumber = Array.isArray(call.to) ? (call.to[0] ?? "") : (call.to ?? "");
  const { prospectPhone, direction } = getProspectPhoneFromQuo(fromNumber, toNumber, ourNumber);

  if (!prospectPhone) {
    logger.warn("[process-quo-call] no phone on call \u2014 skipping", { callId });
    await markCallProcessed(callId, null, null);
    return;
  }

  // ---------------------------------------------------------------------------
  // 4. Run AI extraction. We always pass the same transcript+summary so the
  //    extraction is deterministic enough to re-run after a manual reset.
  // ---------------------------------------------------------------------------
  const transcriptText = transcript!.dialogue.map((d) => `${d.speaker}: ${d.content}`).join("\n");

  const extraction = await extractCallData({
    transcript: transcriptText,
    summary: summary!.summary,
    callDurationSeconds: call.duration,
    callerNumber: prospectPhone,
  });

  // ---------------------------------------------------------------------------
  // 5. Find or create prospect
  // ---------------------------------------------------------------------------
  const prospect = await findOrCreateProspect(prospectPhone);

  // ---------------------------------------------------------------------------
  // 6. Upsert contact (only when we have an email; schema requires it NOT NULL)
  // ---------------------------------------------------------------------------
  let contactId: string | null = null;
  if (extraction.emailCaptured && extraction.personName) {
    contactId = await upsertContactForProspect({
      prospectId: prospect.id,
      personName: extraction.personName,
      email: extraction.emailCaptured,
      role: extraction.personRole,
      phone: extraction.phoneCaptured ?? prospectPhone,
    });
  } else if (extraction.personName) {
    // No email \u2014 stash the person on the prospect notes so we don't lose them.
    await appendPersonToProspectNotes(prospect.id, extraction);
  }

  // ---------------------------------------------------------------------------
  // 7. Update prospect outreachStage + lastTouchedAt
  // ---------------------------------------------------------------------------
  const nextStage = nextOutreachStage(extraction);
  const nowIso = new Date().toISOString();
  await db
    .update(prospects)
    .set({
      outreachStage: nextStage,
      lastTouchedAt: nowIso,
      updatedAt: nowIso,
    })
    .where(eq(prospects.id, prospect.id));

  // ---------------------------------------------------------------------------
  // 8. Timeline event
  // ---------------------------------------------------------------------------
  await writeTimelineEvent({
    prospectId: prospect.id,
    contactId: contactId ?? undefined,
    eventType: direction === "outgoing" ? "call_made" : "call_received",
    title: timelineTitle(call, extraction, direction, prospectPhone),
    description: extraction.summaryBullets.join("\n"),
    metadata: {
      callId,
      direction,
      prospectPhone,
      callDurationSeconds: call.duration,
      personName: extraction.personName,
      personRole: extraction.personRole,
      emailCaptured: extraction.emailCaptured,
      phoneCaptured: extraction.phoneCaptured,
      sentiment: extraction.sentiment,
      followUpIntent: extraction.followUpIntent,
      followUpDate: extraction.followUpDate,
      followUpReason: extraction.followUpReason,
      isNewContact: extraction.isNewContact,
      summaryBullets: extraction.summaryBullets,
    },
  });

  // ---------------------------------------------------------------------------
  // 9. Schedule follow-up if the AI surfaced one
  // ---------------------------------------------------------------------------
  if (extraction.followUpIntent && extraction.followUpDate) {
    await scheduleFollowUp({
      prospectId: prospect.id,
      contactId,
      dueAt: extraction.followUpDate,
      reason: extraction.followUpReason,
    });
  }

  // ---------------------------------------------------------------------------
  // 10. Mark processed
  // ---------------------------------------------------------------------------
  await markCallProcessed(callId, prospect.id, contactId);

  logger.info("[process-quo-call] done", {
    callId,
    prospectId: prospect.id,
    contactId,
    sentiment: extraction.sentiment,
    followUpScheduled: extraction.followUpIntent && !!extraction.followUpDate,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Format a sane title for the timeline event. Prefers the captured person
 * name when we have one; falls back to the prospect's phone number.
 */
function timelineTitle(
  _call: QuoCall,
  extraction: CallExtraction,
  direction: "incoming" | "outgoing",
  prospectPhone: string,
): string {
  const verb = direction === "outgoing" ? "Called" : "Received call from";
  const who = extraction.personName ?? prospectPhone;
  return `${verb} ${who}`;
}

/**
 * Map AI extraction \u2192 prospect.outreachStage.
 *
 * Hierarchy: called < phone_captured < email_captured. Once a contact has
 * given us an email we treat it as the strongest signal.
 */
function nextOutreachStage(extraction: CallExtraction): string {
  if (extraction.emailCaptured) return "email_captured";
  if (extraction.phoneCaptured) return "phone_captured";
  return "called";
}

/**
 * Find a prospect by phone (exact match OR digits-only match) or create a
 * stub one if nothing matches. The stub uses a `businessName` of
 * `Unknown \u2014 <phone>` so the admin can spot it in the prospects list and
 * fill in real details later.
 */
async function findOrCreateProspect(
  prospectPhone: string,
): Promise<{ id: string; businessName: string }> {
  const digits = normalisePhoneDigits(prospectPhone);

  if (digits) {
    const [match] = await db
      .select({ id: prospects.id, businessName: prospects.businessName })
      .from(prospects)
      .where(
        sql`${prospects.phone} = ${prospectPhone} OR regexp_replace(${prospects.phone}, '\\D', '', 'g') = ${digits}`,
      )
      .limit(1);
    if (match) return match;
  }

  // No match \u2014 create a stub.
  const businessName = `Unknown \u2014 ${prospectPhone}`;
  logger.warn("[process-quo-call] no prospect matched \u2014 creating stub", {
    prospectPhone,
  });
  const [inserted] = await db
    .insert(prospects)
    .values({
      businessName,
      phone: prospectPhone,
      outreachStage: "called",
    })
    .returning({ id: prospects.id, businessName: prospects.businessName });

  return inserted;
}

/**
 * Upsert a contact under a prospect by (prospectId, lower-cased name).
 *
 * Update path: bumps `lastSpokeAt` and fills `roleAtCompany` only when it
 * was previously null (don't clobber an admin-set role with the AI's guess
 * from a later call).
 *
 * Insert path: splits the name on the first whitespace; if the name is a
 * single token we put it in firstName and leave lastName null.
 */
async function upsertContactForProspect(args: {
  prospectId: string;
  personName: string;
  email: string;
  role: string | null;
  phone: string;
}): Promise<string> {
  const normalisedName = args.personName.trim().toLowerCase();

  // Case-insensitive lookup on combined first+last name.
  const [existing] = await db
    .select({
      id: contacts.id,
      roleAtCompany: contacts.roleAtCompany,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.prospectId, args.prospectId),
        sql`lower(trim(coalesce(${contacts.firstName}, '') || ' ' || coalesce(${contacts.lastName}, ''))) = ${normalisedName}`,
      ),
    )
    .limit(1);

  const nowIso = new Date().toISOString();

  if (existing) {
    await db
      .update(contacts)
      .set({
        lastSpokeAt: nowIso,
        lastTouchDate: nowIso,
        updatedAt: nowIso,
        // Only fill role when currently null \u2014 admin overrides win.
        ...(existing.roleAtCompany == null && args.role ? { roleAtCompany: args.role } : {}),
      })
      .where(eq(contacts.id, existing.id));
    return existing.id;
  }

  const { firstName, lastName } = splitName(args.personName);
  const [inserted] = await db
    .insert(contacts)
    .values({
      prospectId: args.prospectId,
      firstName,
      lastName,
      email: args.email,
      phone: args.phone,
      roleAtCompany: args.role ?? null,
      source: "quo_call",
      firstTouchDate: nowIso,
      lastTouchDate: nowIso,
      lastSpokeAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .returning({ id: contacts.id });

  return inserted.id;
}

/**
 * Append the captured person info to `prospects.notes` when we don't have an
 * email and therefore can't create a real contact row. Lossy fallback, but
 * keeps the info visible to the admin.
 */
async function appendPersonToProspectNotes(
  prospectId: string,
  extraction: CallExtraction,
): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  const role = extraction.personRole ? ` (${extraction.personRole})` : "";
  const phone = extraction.phoneCaptured ? ` \u2014 ${extraction.phoneCaptured}` : "";
  const note = `[${stamp}] Spoke with ${extraction.personName}${role}${phone}`;

  await db
    .update(prospects)
    .set({
      notes: sql`coalesce(${prospects.notes} || E'\\n', '') || ${note}`,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(prospects.id, prospectId));
}

/**
 * Insert the follow-up row + enqueue a scheduled pg-boss job for the dueAt.
 *
 * The AI returns dueAt as `YYYY-MM-DD`. We expand it to midnight local time
 * (UTC \u2014 we don't know the prospect's timezone) so the scheduled job fires
 * on the right calendar day.
 */
async function scheduleFollowUp(args: {
  prospectId: string;
  contactId: string | null;
  dueAt: string;
  reason: string | null;
}): Promise<void> {
  // Normalise dueAt: AI returns `YYYY-MM-DD`; pad to a full ISO timestamp.
  const dueAtIso = /^\d{4}-\d{2}-\d{2}$/.test(args.dueAt)
    ? `${args.dueAt}T09:00:00.000Z`
    : args.dueAt;

  const [followUp] = await db
    .insert(prospectFollowUps)
    .values({
      prospectId: args.prospectId,
      contactId: args.contactId,
      dueAt: dueAtIso,
      reason: args.reason ?? null,
      source: "ai_extracted",
      status: "pending",
    })
    .returning({ id: prospectFollowUps.id });

  try {
    const pgbossJobId = await enqueueProspectFollowUp(
      { followUpId: followUp.id },
      { dueAt: dueAtIso },
    );
    if (pgbossJobId) {
      await db
        .update(prospectFollowUps)
        .set({ pgbossJobId })
        .where(eq(prospectFollowUps.id, followUp.id));
    }
  } catch (err) {
    // Failure to schedule the pg-boss job is non-fatal; the followup row
    // still exists and an admin can manually trigger it from the UI.
    logger.error("[process-quo-call] failed to enqueue follow-up job", {
      followUpId: followUp.id,
      dueAt: dueAtIso,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  await writeTimelineEvent({
    prospectId: args.prospectId,
    contactId: args.contactId ?? undefined,
    eventType: "follow_up_scheduled",
    title: `Follow-up scheduled for ${dueAtIso.slice(0, 10)}`,
    description: args.reason,
    metadata: {
      followUpId: followUp.id,
      dueAt: dueAtIso,
      reason: args.reason,
      source: "ai_extracted",
    },
  });
}

async function markCallProcessed(
  callId: string,
  prospectId: string | null,
  contactId: string | null,
): Promise<void> {
  await db
    .insert(quoCallsProcessed)
    .values({ callId, prospectId, contactId })
    .onConflictDoNothing({ target: quoCallsProcessed.callId });
}

function splitName(name: string): { firstName: string; lastName: string | null } {
  const trimmed = name.trim();
  if (!trimmed) return { firstName: "", lastName: null };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
