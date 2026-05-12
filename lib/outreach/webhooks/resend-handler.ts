/**
 * Main Resend webhook handler
 *
 * This handles ALL Resend webhook events in a single endpoint
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachEmailEvents } from "@/lib/db/schema";
import type {
  ResendWebhookEvent,
  WebhookResult,
  WebhookHeaders,
  EmailSentEvent,
  EmailDeliveredEvent,
  EmailBouncedEvent,
  EmailOpenedEvent,
  EmailClickedEvent,
  EmailReceivedEvent,
  EmailFailedEvent,
  EmailSuppressedEvent,
} from "./types";
import { verifyWebhookSignature } from "../lib/resend";
import { logger } from "@/lib/logger";
import { handleEmailSent } from "./events/sent";
import { handleEmailDelivered } from "./events/delivered";
import { handleEmailBounced } from "./events/bounced";
import { handleEmailOpened } from "./events/opened";
import { handleEmailClicked } from "./events/clicked";
import { handleEmailReceived } from "./events/received";

/**
 * Handle Resend webhook
 *
 * This is the main entry point for processing all Resend webhook events.
 * It verifies the webhook signature, parses the event, and routes to the
 * appropriate handler.
 *
 * @param payload - Raw webhook payload string
 * @param headers - Webhook headers (svix-id, svix-timestamp, svix-signature)
 * @param webhookSecret - Webhook secret from Resend dashboard
 * @returns Webhook result
 *
 * @example
 * ```typescript
 * // In your Next.js API route:
 * export async function POST(req: Request) {
 *   const payload = await req.text()
 *   const headers = {
 *     'svix-id': req.headers.get('svix-id'),
 *     'svix-timestamp': req.headers.get('svix-timestamp'),
 *     'svix-signature': req.headers.get('svix-signature'),
 *   }
 *
 *   const result = await handleResendWebhook(
 *     payload,
 *     headers,
 *     process.env.RESEND_WEBHOOK_SECRET!
 *   )
 *
 *   return Response.json({ success: result.success })
 * }
 * ```
 */
export async function handleResendWebhook(
  payload: string,
  headers: WebhookHeaders,
  webhookSecret: string,
): Promise<WebhookResult> {
  const result: WebhookResult = {
    success: false,
    eventType: "email.sent", // Default, will be overwritten
  };

  try {
    // Step 1: Verify webhook signature
    const isValid = await verifyWebhookSignature(
      payload,
      {
        id: headers["svix-id"],
        timestamp: headers["svix-timestamp"],
        signature: headers["svix-signature"],
      },
      webhookSecret,
    );

    if (!isValid) {
      result.error = "Invalid webhook signature";
      return result;
    }

    // Step 2: Parse event
    const event: ResendWebhookEvent = JSON.parse(payload);
    result.eventType = event.type;

    // Extract contact info from tags
    const contactId = event.data.tags?.contact_id;
    const emailNumber = event.data.tags?.email_number
      ? parseInt(event.data.tags.email_number)
      : undefined;

    result.contactId = contactId;
    result.emailNumber = emailNumber;

    // Step 3: Check for duplicate events (idempotency)
    const svixId = headers["svix-id"];
    if (svixId) {
      const isDuplicate = await checkDuplicateEvent(svixId);
      if (isDuplicate) {
        console.log(`Duplicate event detected: ${svixId}`);
        result.success = true; // Return success to acknowledge
        return result;
      }
    }

    // Step 4: Route to appropriate handler
    let handled = false;

    switch (event.type) {
      case "email.sent":
        handled = await handleEmailSent(event as EmailSentEvent, svixId || null);
        break;

      case "email.delivered":
        handled = await handleEmailDelivered(event as EmailDeliveredEvent, svixId || null);
        break;

      case "email.delivery_delayed":
        // Log but don't take action
        console.log("Email delivery delayed:", event.data.email_id);
        handled = true;
        break;

      case "email.bounced":
        handled = await handleEmailBounced(event as EmailBouncedEvent, svixId || null);
        break;

      case "email.complained":
        // Spam complaints are immediate hard bounces — normalize with synthetic bounce field
        handled = await handleEmailBounced(
          normalizeAsBounceEvent(event, "spam_complaint", "Spam complaint"),
          svixId || null,
        );
        break;

      case "email.opened":
        handled = await handleEmailOpened(event as EmailOpenedEvent, svixId || null);
        break;

      case "email.clicked":
        handled = await handleEmailClicked(event as EmailClickedEvent, svixId || null);
        break;

      case "email.received":
        handled = await handleEmailReceived(event as EmailReceivedEvent, svixId || null);
        break;

      case "email.failed": {
        // API-level failure — immediate hard bounce with descriptive type
        const failedEvent = event as EmailFailedEvent;
        const failMessage = failedEvent.data.error?.message || "API failure";
        logger.warn("Email failed:", event.data.email_id, failedEvent.data.error);
        handled = await handleEmailBounced(
          normalizeAsBounceEvent(event, "api_failure", failMessage),
          svixId || null,
        );
        break;
      }

      case "email.suppressed": {
        // Recipient on suppression list — immediate hard bounce
        const suppressedEvent = event as EmailSuppressedEvent;
        const suppressMessage = suppressedEvent.data.reason || "Suppressed";
        logger.warn("Email suppressed:", event.data.email_id, suppressedEvent.data.reason);
        handled = await handleEmailBounced(
          normalizeAsBounceEvent(event, "suppressed", suppressMessage),
          svixId || null,
        );
        break;
      }

      default:
        // Acknowledge unknown event types — rejecting them causes Svix to
        // retry and eventually disable the endpoint.
        logger.warn(`Unknown/unhandled event type: ${event.type}`);
        handled = true;
    }

    result.success = handled;

    if (!handled) {
      result.error = `Handler failed or returned false for event type: ${event.type}`;
    }
  } catch (error) {
    // Infrastructure errors (DB failures, etc.) must bubble up so the
    // route handler returns 5xx and Resend/Svix retries the delivery.
    // Non-infrastructure errors (bad payloads, signature issues) are
    // captured on the result so the route acks with 200 — retrying
    // those is pointless and will eventually disable the endpoint.
    if (error instanceof WebhookInfrastructureError) {
      throw error;
    }
    logger.error("Error handling webhook:", error);
    result.error = error instanceof Error ? error.message : "Unknown error";
  }

  return result;
}

/**
 * Thrown for transient infrastructure failures (e.g. DB errors) that should
 * cause the webhook endpoint to return 5xx so the delivery is retried.
 */
export class WebhookInfrastructureError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "WebhookInfrastructureError";
  }
}

/**
 * Normalize a non-bounce event (complained, failed, suppressed) into an
 * EmailBouncedEvent shape by injecting a synthetic `bounce` field.
 * This ensures the bounce handler classifies them as hard bounces with
 * descriptive bounce_type values instead of "unknown".
 */
function normalizeAsBounceEvent(
  event: ResendWebhookEvent,
  bounceType: string,
  bounceMessage: string,
): EmailBouncedEvent {
  return {
    ...event,
    type: "email.bounced",
    data: {
      ...event.data,
      bounce: {
        type: bounceType,
        message: bounceMessage,
      },
    },
  } as EmailBouncedEvent;
}

/**
 * Check if an event has already been processed (using svix-id).
 *
 * IMPORTANT: On DB failure, throws `WebhookInfrastructureError` rather than
 * silently returning `false`. Returning `false` here would cause the event
 * to be re-processed on every retry, double-counting opens/clicks and
 * creating duplicate replies. Throwing ensures the webhook endpoint returns
 * 5xx so Resend retries delivery instead of silently losing idempotency.
 */
async function checkDuplicateEvent(svixId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: outreachEmailEvents.id })
      .from(outreachEmailEvents)
      .where(eq(outreachEmailEvents.svixId, svixId))
      .limit(1);

    return !!row;
  } catch (error) {
    logger.error("Failed to check duplicate event:", {
      svixId,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new WebhookInfrastructureError("Failed to check duplicate event", error);
  }
}
