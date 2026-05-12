import { NextRequest } from "next/server";
import { handleResendWebhook } from "@/lib/outreach/webhooks";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * POST /api/outreach/webhooks/resend
 *
 * Handle Resend webhook events (email.sent, email.delivered, email.bounced, etc.)
 * Updates email_queue status and logs events.
 *
 * @headers svix-id, svix-timestamp, svix-signature - Svix webhook signature headers
 */
export async function POST(request: NextRequest) {
  try {
    // 0. Rate limiting (before signature verification to prevent DoS on HMAC computation)
    const clientIp = getClientIp(request);
    const rateLimitResult = await checkRateLimit(
      `webhook:resend:${clientIp}`,
      { limit: 100, windowMs: 60 * 1000 }, // 100 requests per minute
      "api",
    );

    if (!rateLimitResult.success) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }

    // 1. Get raw payload (required for signature verification)
    const payload = await request.text();

    if (!payload) {
      return Response.json({ error: "Empty payload" }, { status: 400 });
    }

    // 2. Get webhook secret from environment
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error("RESEND_WEBHOOK_SECRET not configured");
      return Response.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    // 3. Extract Svix headers
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      logger.error("Missing required Svix headers");
      return Response.json({ error: "Missing webhook signature headers" }, { status: 400 });
    }

    const headers = {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    };

    // 4. Handle webhook
    logger.debug("Processing Resend webhook event...");

    const result = await handleResendWebhook(payload, headers, webhookSecret);

    if (!result.success) {
      // Log the failure but still return 200 to acknowledge receipt.
      // Returning 4xx causes Svix (Resend's delivery engine) to back off
      // and eventually stop delivering webhooks entirely. Handler failures
      // (missing tags, unknown event types) are not retryable — only
      // infrastructure failures (caught exceptions) should trigger retries.
      logger.error("Webhook processing failed:", result.error);
      return Response.json(
        {
          success: false,
          error: result.error,
        },
        { status: 200 },
      );
    }

    logger.debug("Webhook processed successfully:", result.eventType);

    return Response.json(
      {
        success: true,
        eventType: result.eventType,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error("Error handling webhook:", error);

    // Return 500 so Resend retries on transient server errors (DB down, etc.)
    return Response.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}
