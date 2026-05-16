/**
 * Newsletter validation schemas
 * Provides Zod schemas for newsletter API endpoints
 */

import { z } from "zod";

/**
 * Newsletter generation request schema
 */
export const generateNewsletterSchema = z.object({
  campaignId: z.string().uuid().optional(),
  manual: z.boolean().optional().default(false),
});

export type GenerateNewsletterRequest = z.infer<typeof generateNewsletterSchema>;

/**
 * Newsletter send request schema
 */
export const sendNewsletterSchema = z.object({
  testMode: z.boolean().optional().default(false),
  testEmail: z.string().email().optional(),
});

export type SendNewsletterRequest = z.infer<typeof sendNewsletterSchema>;

/**
 * Newsletter update request schema
 */
export const updateNewsletterSchema = z.object({
  subject: z.string().min(1).max(200).optional(),
  preheader: z.string().max(200).optional(),
  contentHtml: z.string().optional(),
  contentText: z.string().optional(),
  status: z.enum(["draft", "scheduled", "sending", "sent", "failed"]).optional(),
  scheduledAt: z.string().datetime().optional(),
});

export type UpdateNewsletterRequest = z.infer<typeof updateNewsletterSchema>;

/**
 * Newsletter preview personalization schema
 */
export const previewPersonalizationSchema = z.object({
  firstName: z.string().optional().default("there"),
  email: z.string().email().optional(),
});

export type PreviewPersonalizationRequest = z.infer<typeof previewPersonalizationSchema>;

/**
 * Newsletter campaign creation schema
 */
export const createCampaignSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  sendTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/), // HH:MM format
  sendDays: z.array(z.number().min(0).max(6)).min(1).default([2, 3, 4]), // 0=Sun, 1=Mon, etc.
  timezone: z.string().default("Australia/Perth"),
  articleLimit: z.number().int().min(1).max(100).default(50),
  summarizerModel: z.string().default("gpt-4.1-mini"),
  psychologyMode: z
    .enum(["curiosity-driven", "urgency", "benefit-driven"])
    .default("curiosity-driven"),
  platforms: z.array(z.string()).default(["email"]),
  sources: z
    .array(
      z.object({
        type: z.string(),
        url: z.string().url(),
        enabled: z.boolean().default(true),
      }),
    )
    .min(1),
});

export type CreateCampaignRequest = z.infer<typeof createCampaignSchema>;

/**
 * Newsletter campaign update schema
 */
export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(["draft", "active", "paused", "completed"]).optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
  sendTime: z
    .string()
    .regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)
    .optional(),
  sendDays: z.array(z.number().min(0).max(6)).min(1).optional(),
  timezone: z.string().optional(),
  articleLimit: z.number().int().min(1).max(100).optional(),
  summarizerModel: z.string().optional(),
  psychologyMode: z.enum(["curiosity-driven", "urgency", "benefit-driven"]).optional(),
  platforms: z.array(z.string()).optional(),
  sources: z
    .array(
      z.object({
        type: z.string(),
        url: z.string().url(),
        enabled: z.boolean().default(true),
      }),
    )
    .optional(),
});

export type UpdateCampaignRequest = z.infer<typeof updateCampaignSchema>;
