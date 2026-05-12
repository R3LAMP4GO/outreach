/**
 * Resend client factory - Uses environment variables
 */

import { Resend } from "resend";
import { Webhook } from "svix";
import type { ResendConfig } from "../types/config";

/**
 * Creates a Resend client using environment variables
 *
 * @param config - Resend API key or configuration object
 * @returns Resend client instance
 *
 * @example
 * ```typescript
 * const resend = await createResendClient()
 * ```
 */
export async function createResendClient(config?: ResendConfig | string): Promise<Resend | null> {
  const apiKey = typeof config === "string" ? config : process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error("RESEND_API_KEY not configured in environment");
    return null;
  }

  return new Resend(apiKey);
}

/**
 * Verifies a Resend webhook signature using Svix
 *
 * @param payload - Raw webhook payload
 * @param headers - Webhook headers (svix-id, svix-timestamp, svix-signature)
 * @param webhookSecret - Webhook secret from Resend dashboard
 * @returns True if signature is valid, false otherwise
 *
 * @example
 * ```typescript
 * const isValid = await verifyWebhookSignature(
 *   rawBody,
 *   {
 *     id: req.headers.get('svix-id'),
 *     timestamp: req.headers.get('svix-timestamp'),
 *     signature: req.headers.get('svix-signature')
 *   },
 *   process.env.RESEND_WEBHOOK_SECRET!
 * )
 * ```
 */
export async function verifyWebhookSignature(
  payload: string,
  headers: {
    id: string | null;
    timestamp: string | null;
    signature: string | null;
  },
  webhookSecret: string,
): Promise<boolean> {
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return false;
  }

  try {
    const wh = new Webhook(webhookSecret);
    wh.verify(payload, {
      "svix-id": headers.id,
      "svix-timestamp": headers.timestamp,
      "svix-signature": headers.signature,
    });
    return true;
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return false;
  }
}
