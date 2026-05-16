/**
 * Zod schemas for the subset of the Quo (formerly OpenPhone) REST API
 * we actually consume.
 *
 * Each schema transforms the raw API payload into the shape our app reads,
 * so callers never have to know about wire-level quirks like:
 *   - messages use `text`, we expose `body`
 *   - transcript dialogue entries use `identifier`, we expose `speaker`
 *   - call summaries return `summary` as either `string[]` or a single string;
 *     we always expose a single joined string
 *
 * Reference (researched 2026-05-15):
 *   - https://www.openphone.com/docs/api-reference
 *   - openclaw/skills (4.4k★) — skills/dwhite-oss/openphone/SKILL.md
 *   - activepieces/activepieces (22k★) — packages/pieces/community/open-phone/
 *   - TechNickAI/openclaw-config — skills/quo/SKILL.md (transcript payload sample)
 *
 * Only the fields we actually read are required. Anything else the API ships
 * is silently dropped by Zod (default behavior).
 */

import { z } from "zod";

// ─── Messages ────────────────────────────────────────────────────────────────
// POST /v1/messages and the message webhook events return:
//   { data: { id, to[], from, text, direction, status, createdAt, updatedAt, ... } }
// The task spec names the payload field `body`; the API ships `text`.

export const quoMessageSchema = z
  .object({
    id: z.string(),
    from: z.string(),
    to: z.array(z.string()),
    direction: z.enum(["incoming", "outgoing"]),
    text: z.string().nullable().optional(),
    createdAt: z.string(),
  })
  .transform((raw) => ({
    id: raw.id,
    from: raw.from,
    to: raw.to,
    direction: raw.direction,
    body: raw.text ?? "",
    createdAt: raw.createdAt,
  }));

export type QuoMessage = z.infer<typeof quoMessageSchema>;

// ─── Calls ───────────────────────────────────────────────────────────────────
// GET /v1/calls/{callId} returns metadata only — no recording URL, no
// transcript. `participants` holds the external party (or parties); our own
// Quo number is implied by `phoneNumberId`.
//
// `from` / `to` / `recordingUrl` are NOT on the REST GET payload; they ARE on
// the webhook event payloads. Schema marks them optional so the same type
// parses both shapes.

export const quoCallSchema = z.object({
  id: z.string(),
  direction: z.enum(["incoming", "outgoing"]),
  status: z.string(),
  duration: z.number(),
  createdAt: z.string(),
  completedAt: z.string().nullable().optional(),
  from: z.string().optional(),
  to: z.union([z.string(), z.array(z.string())]).optional(),
  recordingUrl: z.string().optional(),
  participants: z.array(z.string()).optional(),
  phoneNumberId: z.string().optional(),
});

export type QuoCall = z.infer<typeof quoCallSchema>;

// ─── Contacts ────────────────────────────────────────────────────────────────
// POST /v1/contacts wire shape is wrapped in `defaultFields`. We flatten it
// down to a flat object plus a single `phoneNumbers: string[]`.

const contactPhoneNumberSchema = z.object({
  value: z.string().nullable(),
});

export const quoContactSchema = z
  .object({
    id: z.string(),
    source: z.string().nullable().optional(),
    defaultFields: z.object({
      firstName: z.string().nullable().optional(),
      lastName: z.string().nullable().optional(),
      company: z.string().nullable().optional(),
      phoneNumbers: z.array(contactPhoneNumberSchema).optional(),
    }),
  })
  .transform((raw) => {
    const fullName = [raw.defaultFields.firstName, raw.defaultFields.lastName]
      .filter((part): part is string => Boolean(part))
      .join(" ")
      .trim();
    return {
      id: raw.id,
      name: fullName,
      company: raw.defaultFields.company ?? null,
      source: raw.source ?? null,
      phoneNumbers: (raw.defaultFields.phoneNumbers ?? [])
        .map((p) => p.value)
        .filter((v): v is string => Boolean(v)),
    };
  });

export type QuoContact = z.infer<typeof quoContactSchema>;

// ─── Call summary ────────────────────────────────────────────────────────────
// GET /v1/call-summaries/{callId} returns:
//   { data: { callId, summary: string[] | string | null, nextSteps: string[] | null, status, ... } }
// Quo treats summary bullets as an array; we collapse to a single newline-
// joined string so consumers don't have to branch.

export const quoCallSummarySchema = z
  .object({
    callId: z.string(),
    summary: z
      .union([z.string(), z.array(z.string())])
      .nullable()
      .optional(),
    nextSteps: z.array(z.string()).nullable().optional(),
  })
  .transform((raw) => {
    const summary = Array.isArray(raw.summary) ? raw.summary.join("\n") : (raw.summary ?? "");
    return {
      callId: raw.callId,
      summary,
      nextSteps: raw.nextSteps ?? [],
    };
  });

export type QuoCallSummary = z.infer<typeof quoCallSummarySchema>;

// ─── Call transcript ─────────────────────────────────────────────────────────
// GET /v1/call-transcripts/{callId} returns:
//   { data: { callId, dialogue: [{ content, start, end, identifier, userId }] } }
// We rename `identifier` → `speaker` to match the rest of the codebase.

const transcriptDialogueEntrySchema = z
  .object({
    content: z.string(),
    start: z.number(),
    end: z.number(),
    identifier: z.string().nullable().optional(),
  })
  .transform((raw) => ({
    speaker: raw.identifier ?? "unknown",
    content: raw.content,
    start: raw.start,
    end: raw.end,
  }));

export const quoCallTranscriptSchema = z.object({
  callId: z.string(),
  dialogue: z.array(transcriptDialogueEntrySchema),
});

export type QuoCallTranscript = z.infer<typeof quoCallTranscriptSchema>;

// ─── Response envelope ───────────────────────────────────────────────────────
// Every Quo REST endpoint that returns a single resource wraps it in
// `{ data: ... }`. This helper builds the envelope schema around the inner one.

export function quoEnvelope<T extends z.ZodTypeAny>(inner: T) {
  return z.object({ data: inner });
}

// ─── Error envelope ──────────────────────────────────────────────────────────
// Documented Quo error shape (also confirmed in activepieces/open-phone source).
// Schema is permissive: every field is optional because Quo occasionally
// returns plain `{ message }` payloads.

export const quoErrorSchema = z
  .object({
    message: z.string().optional(),
    code: z.string().optional(),
    status: z.number().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough();

export type QuoErrorBody = z.infer<typeof quoErrorSchema>;
