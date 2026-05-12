/**
 * Webhook module types
 */

/**
 * Resend webhook event types
 */
export type ResendEventType =
  | "email.sent"
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.bounced"
  | "email.complained"
  | "email.opened"
  | "email.clicked"
  | "email.received"
  | "email.failed"
  | "email.suppressed";

/**
 * Base webhook event
 */
export interface ResendWebhookEvent {
  type: ResendEventType;
  created_at: string;
  data: {
    created_at: string;
    email_id: string;
    from: string;
    to: string[];
    subject?: string;
    tags?: Record<string, string>;
    [key: string]: unknown;
  };
}

/**
 * Sent event
 */
export interface EmailSentEvent extends ResendWebhookEvent {
  type: "email.sent";
}

/**
 * Delivered event
 */
export interface EmailDeliveredEvent extends ResendWebhookEvent {
  type: "email.delivered";
}

/**
 * Delivery delayed event
 */
export interface EmailDeliveryDelayedEvent extends ResendWebhookEvent {
  type: "email.delivery_delayed";
}

/**
 * Bounced event
 */
export interface EmailBouncedEvent extends ResendWebhookEvent {
  type: "email.bounced";
  data: ResendWebhookEvent["data"] & {
    bounce?: {
      type: string;
      message: string;
    };
  };
}

/**
 * Complained event (spam complaint)
 */
export interface EmailComplainedEvent extends ResendWebhookEvent {
  type: "email.complained";
}

/**
 * Opened event
 */
export interface EmailOpenedEvent extends ResendWebhookEvent {
  type: "email.opened";
  data: ResendWebhookEvent["data"] & {
    ip_address?: string;
    user_agent?: string;
  };
}

/**
 * Clicked event
 */
export interface EmailClickedEvent extends ResendWebhookEvent {
  type: "email.clicked";
  data: ResendWebhookEvent["data"] & {
    /** SDK v6+ nested click object (camelCase) */
    click?: {
      link: string;
      ipAddress: string;
      userAgent: string;
      timestamp: string;
    };
    /** Legacy flat fields — kept as optional fallbacks for replayed events */
    link?: string;
    ip_address?: string;
    user_agent?: string;
  };
}

/**
 * Received event (inbound reply)
 * Note: html/text are NOT included in the webhook payload.
 * Use resend.emails.receiving.get(emailId) to fetch full content.
 */
export interface EmailReceivedEvent extends ResendWebhookEvent {
  type: "email.received";
  data: ResendWebhookEvent["data"] & {
    /** Message-ID from the inbound email (available in webhook metadata) */
    message_id?: string;
    /** Attachment metadata (content must be fetched via Attachments API) */
    attachments?: Array<{
      id: string;
      filename: string;
      content_type: string;
      content_disposition?: string;
      content_id?: string;
    }>;
  };
}

/**
 * Response from resend.emails.receiving.get(emailId)
 * Contains the full email body and headers not included in webhook payloads.
 */
export interface ReceivedEmailContent {
  html: string | null;
  text: string | null;
  headers: Record<string, string> | Array<{ name: string; value: string }>;
}

/**
 * Failed event (API-level failure, distinct from bounce)
 */
export interface EmailFailedEvent extends ResendWebhookEvent {
  type: "email.failed";
  data: ResendWebhookEvent["data"] & {
    error?: {
      type: string;
      message: string;
    };
  };
}

/**
 * Suppressed event (recipient on suppression list)
 */
export interface EmailSuppressedEvent extends ResendWebhookEvent {
  type: "email.suppressed";
  data: ResendWebhookEvent["data"] & {
    reason?: string;
  };
}

/**
 * Webhook handling result
 */
export interface WebhookResult {
  success: boolean;
  eventType: ResendEventType;
  contactId?: string;
  emailNumber?: number;
  error?: string;
}

/**
 * Webhook verification headers
 */
export interface WebhookHeaders {
  "svix-id": string | null;
  "svix-timestamp": string | null;
  "svix-signature": string | null;
}
