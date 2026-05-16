/**
 * Zod validation schemas for API routes
 *
 * Provides runtime type validation for external data
 */

import { z } from "zod";

// ============================================================================
// Common Schemas
// ============================================================================

export const emailSchema = z
  .string()
  .email("Invalid email format")
  .transform((val) => val.toLowerCase().trim());

export const passwordSchema = z.string().min(1, "Password is required");

// ============================================================================
// Admin Security Schemas
// ============================================================================

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(12, "Password must be at least 12 characters"),
});

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(12, "Password must be at least 12 characters"),
});

export const enableTotpSchema = z.object({
  secret: z.string().min(1, "Secret is required"),
  token: z.string().length(6, "Token must be 6 digits"),
});

export const disableTotpSchema = z.object({
  token: z.string().length(6, "Token must be 6 digits"),
});

// ============================================================================
// Admin Invitation Schemas
// ============================================================================

export const createInvitationSchema = z.object({
  email: emailSchema,
  role: z.enum(["admin", "super_admin"]).optional().default("admin"),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, "Token is required"),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  password: z.string().min(12, "Password must be at least 12 characters"),
});

// ============================================================================
// Admin Settings Schema
// ============================================================================

export const updateSettingsSchema = z.object({
  profileSettings: z.object({
    firstName: z.string().max(50).optional().default(""),
    lastName: z.string().max(50).optional().default(""),
    jobTitle: z.string().max(100).optional().default(""),
  }),
  notifications: z.object({
    notificationEmail: z.string().email().or(z.literal("")).optional().default(""),
    newContact: z.boolean().optional().default(true),
    newSubscriber: z.boolean().optional().default(true),
  }),
  preferences: z.object({
    theme: z.enum(["light", "dark", "system"]).optional().default("system"),
    language: z.string().optional().default("en-AU"),
    timezone: z.string().optional().default("Australia/Perth"),
  }),
});

// ============================================================================
// CRM Schemas
// ============================================================================

export const dealCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  contact_id: z.string().uuid("Invalid contact id"),
  stage_slug: z.string().min(1, "Stage is required").max(100),
  pipeline_slug: z.string().min(1).max(100).default("sales-pipeline"),
  amount: z.number().min(0).optional().nullable(),
  probability: z.number().int().min(0).max(100).optional().nullable(),
  source: z.string().min(1).max(100).default("manual"),
  notes: z.string().max(2000).optional().nullable(),
  expected_close_date: z.string().datetime().optional().nullable(),
});

export const dealUpdateSchema = z.object({
  stage_id: z.string().uuid().optional(),
  name: z.string().min(1).max(200).optional(),
  amount: z.number().min(0).optional().nullable(),
  probability: z.number().min(0).max(100).optional().nullable(),
  expected_close_date: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const moveDealSchema = z.object({
  stage_id: z.string().uuid("Invalid stage ID"),
});

export const bulkUpdateDealsSchema = z.object({
  deal_ids: z
    .array(z.string().uuid())
    .min(1, "At least one deal ID is required")
    .max(100, "Maximum 100 deals"),
  updates: z.object({
    stage_slug: z.string().optional(),
  }),
});

export const bulkDeleteDealsSchema = z.object({
  deal_ids: z
    .array(z.string().uuid())
    .min(1, "At least one deal ID is required")
    .max(100, "Maximum 100 deals"),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Sanitize error messages to prevent information disclosure
 * Returns generic message for database errors, preserves validation errors
 */
export function sanitizeError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.map((e) => e.message).join(", ");
  }

  // Log full error server-side for debugging
  console.error("API Error:", error);

  // Return generic message to client
  return "An error occurred. Please try again.";
}

/**
 * Parse and validate request body with Zod schema
 * Returns { success: true, data } or { success: false, error }
 */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ success: true; data: z.infer<T> } | { success: false; error: string }> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      return { success: false, error: result.error.issues.map((e) => e.message).join(", ") };
    }

    return { success: true, data: result.data };
  } catch {
    return { success: false, error: "Invalid request body" };
  }
}
