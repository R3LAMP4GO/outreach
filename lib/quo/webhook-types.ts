/**
 * Zod schemas + types for Quo (formerly OpenPhone) webhook event payloads.
 *
 * NOT server-only — these are pure schema definitions used by both the route
 * handler (server) and tests (vitest happy-dom). The Quo REST client in
 * ./client.ts is server-only; keep that boundary intact.
 *
 * Wire envelope (verified against):
 *   - https://support.openphone.com/core-concepts/integrations/webhooks
 *   - Pipedream `openphone` source connectors (11k★) — test-event.mjs samples
 *   - Auxx-Ai/auxx-ai webhook route (49★)
 *
 * Every Quo event ships in the same envelope:
 *
 *   {
 *     "id":        "EVxxxxxxxxxxxxxxxxxxxxxxxxxx",
 *     "object":    "event",
 *     "apiVersion":"v4",
 *     "createdAt": "2025-04-10T21:41:01.247Z",
 *     "type":      "call.completed" | "message.received" | ...,
 *     "data":      { "object": { ...event-specific fields } }
 *   }
 *
 * The discriminator for the Zod union is `type`. The inner `data.object`
 * shape is what differs per event.
 *
 * Only the fields the webhook handler actually reads are required. Anything
 * else Quo ships through (rare schema additions, future-only fields) is kept
 * via `.passthrough()` so we never reject a payload over a strict-extra-key
 * check — that would force a 4xx and Quo would eventually disable the endpoint.
 */
import { z } from "zod";

// ─── Shared sub-shapes ───────────────────────────────────────────────────────

/**
 * A call object as it appears in `data.object` on call.* events.
 *
 * `to` is documented as a string in webhook payloads (vs. string[] in the
 * REST GET response) — we union both for future-proofness.
 *
 * `voicemail` is only present on incoming calls that went to voicemail.
 */
const callObjectSchema = z
  .object({
    id: z.string(),
    object: z.literal("call").optional(),
    direction: z.enum(["incoming", "outgoing"]),
    status: z.string(),
    from: z.string(),
    to: z.union([z.string(), z.array(z.string())]),
    createdAt: z.string(),
    answeredAt: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    conversationId: z.string().optional(),
    phoneNumberId: z.string().optional(),
    userId: z.string().optional(),
    media: z.array(z.unknown()).optional(),
    voicemail: z
      .object({
        url: z.string().optional(),
        duration: z.number().optional(),
        type: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

/**
 * A message object as it appears in `data.object` on message.* events.
 *
 * Quo uses `text` on the wire (vs. our Quo REST client's transformed `body`).
 * We keep the wire name here so the webhook handler reads exactly what
 * arrived — no transform layer between signature verification and dispatch.
 */
const messageObjectSchema = z
  .object({
    id: z.string(),
    object: z.literal("message").optional(),
    from: z.string(),
    to: z.union([z.string(), z.array(z.string())]),
    direction: z.enum(["incoming", "outgoing"]),
    text: z.string().nullable().optional(),
    status: z.string().optional(),
    createdAt: z.string(),
    userId: z.string().optional(),
    phoneNumberId: z.string().optional(),
    conversationId: z.string().optional(),
  })
  .passthrough();

/**
 * The summary / transcript event payloads aren't publicly documented as
 * full samples. We require only `callId` (every Quo AI event references the
 * source call) and let the rest pass through. The job handler refetches the
 * full payload via the REST client anyway — we just need the callId to know
 * which call advanced.
 */
const callSummaryObjectSchema = z
  .object({
    callId: z.string(),
    status: z.string().optional(),
    summary: z
      .union([z.string(), z.array(z.string())])
      .nullable()
      .optional(),
    nextSteps: z.array(z.string()).nullable().optional(),
  })
  .passthrough();

const callTranscriptObjectSchema = z
  .object({
    callId: z.string(),
    status: z.string().optional(),
    dialogue: z.array(z.unknown()).optional(),
  })
  .passthrough();

// ─── Envelope factory ────────────────────────────────────────────────────────

/**
 * Wraps an inner `data.object` schema in the standard Quo event envelope so
 * we only declare the envelope shape once.
 */
function envelope<T extends z.ZodTypeAny, K extends string>(type: K, dataObject: T) {
  return z.object({
    id: z.string(),
    object: z.literal("event").optional(),
    apiVersion: z.string().optional(),
    createdAt: z.string(),
    type: z.literal(type),
    data: z.object({
      object: dataObject,
    }),
  });
}

// ─── Event schemas ───────────────────────────────────────────────────────────

export const quoCallCompletedSchema = envelope("call.completed", callObjectSchema);
export const quoCallSummaryCompletedSchema = envelope(
  "call.summary.completed",
  callSummaryObjectSchema,
);
export const quoCallTranscriptCompletedSchema = envelope(
  "call.transcript.completed",
  callTranscriptObjectSchema,
);
export const quoMessageReceivedSchema = envelope("message.received", messageObjectSchema);
export const quoMessageDeliveredSchema = envelope("message.delivered", messageObjectSchema);

/**
 * Discriminated union of every Quo event we recognise. Add a new event by
 * appending its schema here and the route's switch picks it up.
 *
 * IMPORTANT: this is a `discriminatedUnion` on `type`. Unknown event types
 * fail at Zod parse time — the route handler logs them and ACKs with 200
 * so Quo doesn't disable the endpoint. Don't add a fallback "unknown"
 * variant; let Zod reject and the handler convert that to a 200 ack.
 */
export const quoWebhookEventSchema = z.discriminatedUnion("type", [
  quoCallCompletedSchema,
  quoCallSummaryCompletedSchema,
  quoCallTranscriptCompletedSchema,
  quoMessageReceivedSchema,
  quoMessageDeliveredSchema,
]);

export type QuoWebhookEvent = z.infer<typeof quoWebhookEventSchema>;
export type QuoCallCompletedEvent = z.infer<typeof quoCallCompletedSchema>;
export type QuoCallSummaryCompletedEvent = z.infer<typeof quoCallSummaryCompletedSchema>;
export type QuoCallTranscriptCompletedEvent = z.infer<typeof quoCallTranscriptCompletedSchema>;
export type QuoMessageReceivedEvent = z.infer<typeof quoMessageReceivedSchema>;
export type QuoMessageDeliveredEvent = z.infer<typeof quoMessageDeliveredSchema>;

/** All event-type discriminator strings we handle. */
export type QuoWebhookEventType = QuoWebhookEvent["type"];
