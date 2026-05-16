/**
 * Quo (formerly OpenPhone) webhook handler.
 *
 * POST /api/webhooks/quo
 *
 * Receives the following event types and dispatches them appropriately:
 *
 *   call.completed              -> enqueue process-quo-call (AI extraction)
 *   call.summary.completed      -> enqueue process-quo-call (AI summary ready)
 *   call.transcript.completed   -> enqueue process-quo-call (transcript ready)
 *   message.received            -> inline: timeline event + admin notification
 *   message.delivered           -> inline: timeline event (delivery receipt)
 *
 * Unauthenticated (webhooks always are) but HMAC-signature-verified per
 * Quo's documented `openphone-signature` header format. See
 * lib/quo/verify-signature.ts for the exact algorithm.
 *
 * Idempotency: every accepted delivery is recorded in `quo_webhook_events`
 * by event id BEFORE downstream dispatch. Duplicate deliveries (Quo's
 * at-least-once guarantee) short-circuit with a 200 ack and no work.
 *
 * Latency target: < 500 ms. Heavy work (AI extraction, transcript fetch)
 * is offloaded to the `process-quo-call` pg-boss job. Webhook providers
 * retry on timeouts, so the route must ALWAYS ack quickly.
 *
 * Mirrors the structure of `app/api/webhooks/cal/route.ts` and
 * `lib/outreach/webhooks/resend-handler.ts`.
 */
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { db } from "@/lib/db";
import { quoWebhookEvents } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { enqueueProcessQuoCall } from "@/lib/queue";

import { verifyQuoSignature } from "@/lib/quo/verify-signature";
import { quoWebhookEventSchema, type QuoWebhookEvent } from "@/lib/quo/webhook-types";
import { handleQuoMessageDelivered, handleQuoMessageReceived } from "@/lib/quo/webhook-handlers";

// Defense-in-depth size guard. Quo payloads top out around 4 KB; 1 MB is
// generous enough that nothing legitimate trips it but small enough that a
// malicious request can't OOM us.
const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

export async function POST(request: NextRequest) {
  try {
    // 1. Rate limit BEFORE signature verification. HMAC is cheap but not
    // free; a flood of bogus requests with no signature still costs the
    // raw-body read + a buffer compare. 100/min/IP is plenty for one Quo
    // workspace.
    const clientIp = getClientIp(request);
    const rate = await checkRateLimit(
      `webhook:quo:${clientIp}`,
      { limit: 100, windowMs: 60 * 1000 },
      "api",
    );
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // 2. Read the raw body BEFORE any JSON parsing. HMAC is over the exact
    // bytes Quo sent; re-stringifying parsed JSON drops the whitespace Quo
    // signed and breaks the digest.
    const rawBody = await request.text();
    if (!rawBody) {
      return NextResponse.json({ error: "Empty payload" }, { status: 400 });
    }
    if (rawBody.length > MAX_BODY_SIZE) {
      logger.warn("Quo webhook payload too large", { size: rawBody.length });
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    // 3. Verify HMAC signature. Missing secret is a 500 (server
    // misconfiguration); missing/invalid header is a 401 (bad request).
    const webhookSecret = process.env.QUO_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error("QUO_WEBHOOK_SECRET not configured");
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    const sigHeader = request.headers.get("openphone-signature");
    const sigCheck = verifyQuoSignature(rawBody, sigHeader, webhookSecret);
    if (!sigCheck.valid) {
      logger.warn("Quo webhook signature verification failed", { reason: sigCheck.reason });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 4. Parse + validate the JSON payload. Malformed JSON is a 400 (won't
    // succeed on retry). Unknown event types Zod-fail and we ack with 200
    // so Quo doesn't disable the endpoint over a schema mismatch.
    let event: QuoWebhookEvent;
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      event = quoWebhookEventSchema.parse(parsed);
    } catch (err) {
      if (err instanceof ZodError) {
        logger.warn("Quo webhook payload did not match any known event schema", {
          issues: err.issues.slice(0, 5),
        });
        // 200 ack: a 4xx would cause Quo to retry indefinitely and
        // eventually disable the webhook.
        return NextResponse.json({ message: "Event type not handled" }, { status: 200 });
      }
      logger.warn("Quo webhook payload was not valid JSON", {
        bodyLength: rawBody.length,
        contentType: request.headers.get("content-type"),
      });
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    // 5. Idempotency. Record the event id BEFORE dispatch — pg-boss enqueue
    // is itself idempotent for the same payload, but our timeline writes
    // and admin notifications are not. `ON CONFLICT DO NOTHING` on the
    // event-id PK makes the second arrival a no-op.
    const inserted = await db
      .insert(quoWebhookEvents)
      .values({ id: event.id, eventType: event.type })
      .onConflictDoNothing({ target: quoWebhookEvents.id })
      .returning({ id: quoWebhookEvents.id });

    if (inserted.length === 0) {
      logger.debug("Quo webhook duplicate event id — short-circuiting", {
        eventId: event.id,
        eventType: event.type,
      });
      return NextResponse.json(
        { success: true, duplicate: true, eventType: event.type },
        { status: 200 },
      );
    }

    // 6. Dispatch by event type. Heavy events (call.*) enqueue a pg-boss
    // job and return immediately. Lightweight events (message.*) run
    // inline because they're a single DB insert.
    switch (event.type) {
      case "call.completed": {
        await enqueueProcessQuoCall({ callId: event.data.object.id });
        break;
      }
      case "call.summary.completed": {
        await enqueueProcessQuoCall({
          callId: event.data.object.callId,
          hasSummary: true,
        });
        break;
      }
      case "call.transcript.completed": {
        await enqueueProcessQuoCall({
          callId: event.data.object.callId,
          hasTranscript: true,
        });
        break;
      }
      case "message.received": {
        await handleQuoMessageReceived(event);
        break;
      }
      case "message.delivered": {
        await handleQuoMessageDelivered(event);
        break;
      }
    }

    return NextResponse.json({ success: true, eventType: event.type }, { status: 200 });
  } catch (err) {
    // Any uncaught failure is treated as infrastructure (DB down, pg-boss
    // connection lost). Return 5xx so Quo retries with backoff.
    logger.error("Quo webhook unexpected error", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/webhooks/quo
 *
 * Trivial health check so the operator can confirm the route is mounted
 * after a deploy without firing a real signed payload.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Quo webhook endpoint is active",
  });
}
