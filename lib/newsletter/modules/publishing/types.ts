/**
 * Publishing Module Types
 *
 * Types for email sending, batch processing, and delivery tracking.
 */

import { z } from "zod";

/**
 * Email recipient with personalization
 */
export const EmailRecipientSchema = z.object({
  id: z.string(), // Subscriber ID
  email: z.string().email(),
  name: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type EmailRecipient = z.infer<typeof EmailRecipientSchema>;

/**
 * Email template content
 */
export const EmailTemplateSchema = z.object({
  subject: z.string(),
  preheader: z.string().optional(),
  html: z.string(),
  text: z.string(),
  replyTo: z.string().email().optional(),
});

export type EmailTemplate = z.infer<typeof EmailTemplateSchema>;

/**
 * Email send options
 */
export const EmailSendOptionsSchema = z.object({
  from: z.object({
    email: z.string().email(),
    name: z.string(),
  }),
  replyTo: z.string().email().optional(),
  tags: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
      }),
    )
    .optional(),
  headers: z.record(z.string(), z.string()).optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        content: z.string(),
        contentType: z.string().optional(),
      }),
    )
    .optional(),
});

export type EmailSendOptions = z.infer<typeof EmailSendOptionsSchema>;

/**
 * Send result for individual email
 */
export const SendResultSchema = z.object({
  success: z.boolean(),
  recipientId: z.string(),
  email: z.string().email(),
  resendId: z.string().optional(), // Resend message ID
  messageId: z.string().optional(), // Email Message-ID header
  error: z.string().optional(),
  errorCode: z.string().optional(),
  timestamp: z.date().default(() => new Date()),
});

export type SendResult = z.infer<typeof SendResultSchema>;

/**
 * Batch send result with aggregated stats
 */
export const BatchSendResultSchema = z.object({
  total: z.number(),
  sent: z.number(),
  failed: z.number(),
  skipped: z.number(),
  results: z.array(SendResultSchema),
  errors: z.array(
    z.object({
      email: z.string(),
      error: z.string(),
      code: z.string().optional(),
    }),
  ),
  startedAt: z.date(),
  completedAt: z.date(),
  duration: z.number(), // Duration in ms
});

export type BatchSendResult = z.infer<typeof BatchSendResultSchema>;

/**
 * Rate limit configuration
 */
export const RateLimitConfigSchema = z.object({
  maxRequestsPerSecond: z.number().default(10),
  maxRequestsPerHour: z.number().default(1000),
  burstSize: z.number().default(20),
});

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

/**
 * Retry configuration
 */
export const RetryConfigSchema = z.object({
  maxRetries: z.number().default(3),
  initialDelay: z.number().default(1000), // 1 second
  maxDelay: z.number().default(30000), // 30 seconds
  backoffMultiplier: z.number().default(2), // Exponential backoff
  retryableStatusCodes: z.array(z.number()).default([429, 500, 502, 503, 504]),
});

export type RetryConfig = z.infer<typeof RetryConfigSchema>;

/**
 * Email send status for tracking
 */
export const EmailSendStatusSchema = z.enum([
  "queued",
  "sending",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "failed",
  "rejected",
]);

export type EmailSendStatus = z.infer<typeof EmailSendStatusSchema>;

/**
 * Email delivery tracking
 */
export const EmailDeliverySchema = z.object({
  id: z.string(),
  editionId: z.string(),
  subscriberId: z.string(),
  email: z.string().email(),
  status: EmailSendStatusSchema,

  // Provider IDs
  resendId: z.string().optional(),
  messageId: z.string().optional(),

  // Timestamps
  queuedAt: z.date(),
  sentAt: z.date().optional(),
  deliveredAt: z.date().optional(),
  openedAt: z.date().optional(),
  clickedAt: z.date().optional(),
  bouncedAt: z.date().optional(),
  failedAt: z.date().optional(),

  // Error tracking
  error: z.string().optional(),
  errorCode: z.string().optional(),
  retryCount: z.number().default(0),

  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export type EmailDelivery = z.infer<typeof EmailDeliverySchema>;

/**
 * Unsubscribe link configuration
 */
export const UnsubscribeLinkSchema = z.object({
  url: z.string().url(),
  oneClickUrl: z.string().url().optional(),
  text: z.string().default("Unsubscribe"),
});

export type UnsubscribeLink = z.infer<typeof UnsubscribeLinkSchema>;

/**
 * Email personalization tokens
 */
export interface PersonalizationTokens {
  [key: string]: string | number | boolean;
}

/**
 * Resend API error response
 */
export interface ResendError {
  name: string;
  message: string;
  statusCode?: number;
}

/**
 * Email validation result
 */
export const EmailValidationResultSchema = z.object({
  valid: z.boolean(),
  email: z.string(),
  reason: z.string().optional(),
});

export type EmailValidationResult = z.infer<typeof EmailValidationResultSchema>;

/**
 * Batch processing options
 */
export const BatchProcessingOptionsSchema = z.object({
  batchSize: z.number().default(100),
  concurrency: z.number().default(5),
  delayBetweenBatches: z.number().default(1000), // 1 second
  stopOnError: z.boolean().default(false),
});

export type BatchProcessingOptions = z.infer<typeof BatchProcessingOptionsSchema>;
