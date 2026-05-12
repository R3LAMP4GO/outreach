// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — partial Supabase mocks cause type mismatches
/**
 * Tests for Zod validation schemas
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  emailSchema,
  passwordSchema,
  changePasswordSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  enableTotpSchema,
  disableTotpSchema,
  createInvitationSchema,
  acceptInvitationSchema,
  updateSettingsSchema,
  dealUpdateSchema,
  moveDealSchema,
  bulkUpdateDealsSchema,
  bulkDeleteDealsSchema,
  paginationSchema,
  sanitizeError,
} from "../validations";

// ============================================================
// emailSchema
// ============================================================

describe("emailSchema", () => {
  it("should accept a valid email", () => {
    const result = emailSchema.safeParse("user@example.com");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("user@example.com");
  });

  it("should reject an invalid email", () => {
    const result = emailSchema.safeParse("not-an-email");
    expect(result.success).toBe(false);
  });

  it("should reject email with leading/trailing whitespace (validation before transform)", () => {
    // Zod validates email format before applying .toLowerCase().trim() transform
    const result = emailSchema.safeParse("  user@example.com  ");
    expect(result.success).toBe(false);
  });

  it("should lowercase the email", () => {
    const result = emailSchema.safeParse("User@Example.COM");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("user@example.com");
  });

  it("should reject an empty string", () => {
    const result = emailSchema.safeParse("");
    expect(result.success).toBe(false);
  });
});

// ============================================================
// passwordSchema
// ============================================================

describe("passwordSchema", () => {
  it("should accept a non-empty password", () => {
    const result = passwordSchema.safeParse("any-password");
    expect(result.success).toBe(true);
  });

  it("should reject an empty string", () => {
    const result = passwordSchema.safeParse("");
    expect(result.success).toBe(false);
  });
});

// ============================================================
// changePasswordSchema
// ============================================================

describe("changePasswordSchema", () => {
  it("should accept valid current and new passwords", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "oldpass",
      newPassword: "newpassword12",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing currentPassword", () => {
    const result = changePasswordSchema.safeParse({ newPassword: "newpassword12" });
    expect(result.success).toBe(false);
  });

  it("should reject missing newPassword", () => {
    const result = changePasswordSchema.safeParse({ currentPassword: "oldpass" });
    expect(result.success).toBe(false);
  });

  it("should reject newPassword shorter than 12 characters", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "oldpass",
      newPassword: "short",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// requestPasswordResetSchema
// ============================================================

describe("requestPasswordResetSchema", () => {
  it("should accept a valid email", () => {
    const result = requestPasswordResetSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
  });

  it("should reject invalid email", () => {
    const result = requestPasswordResetSchema.safeParse({ email: "bad" });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// resetPasswordSchema
// ============================================================

describe("resetPasswordSchema", () => {
  it("should accept valid token and password", () => {
    const result = resetPasswordSchema.safeParse({
      token: "abc123",
      password: "validpassword1",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty token", () => {
    const result = resetPasswordSchema.safeParse({
      token: "",
      password: "validpassword1",
    });
    expect(result.success).toBe(false);
  });

  it("should reject short password", () => {
    const result = resetPasswordSchema.safeParse({
      token: "abc123",
      password: "short",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// enableTotpSchema
// ============================================================

describe("enableTotpSchema", () => {
  it("should accept valid secret and 6-digit token", () => {
    const result = enableTotpSchema.safeParse({ secret: "JBSWY3DPEHPK3PXP", token: "123456" });
    expect(result.success).toBe(true);
  });

  it("should reject token that is not exactly 6 characters", () => {
    const result = enableTotpSchema.safeParse({ secret: "JBSWY3DPEHPK3PXP", token: "12345" });
    expect(result.success).toBe(false);
  });

  it("should reject empty secret", () => {
    const result = enableTotpSchema.safeParse({ secret: "", token: "123456" });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// disableTotpSchema
// ============================================================

describe("disableTotpSchema", () => {
  it("should accept a 6-digit token", () => {
    const result = disableTotpSchema.safeParse({ token: "654321" });
    expect(result.success).toBe(true);
  });

  it("should reject a 7-digit token", () => {
    const result = disableTotpSchema.safeParse({ token: "1234567" });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// createInvitationSchema
// ============================================================

describe("createInvitationSchema", () => {
  it("should accept valid email with default role", () => {
    const result = createInvitationSchema.safeParse({ email: "admin@test.com" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.role).toBe("admin");
  });

  it("should accept super_admin role", () => {
    const result = createInvitationSchema.safeParse({
      email: "admin@test.com",
      role: "super_admin",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid role", () => {
    const result = createInvitationSchema.safeParse({
      email: "admin@test.com",
      role: "viewer",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// acceptInvitationSchema
// ============================================================

describe("acceptInvitationSchema", () => {
  it("should accept valid input", () => {
    const result = acceptInvitationSchema.safeParse({
      token: "invite-token",
      name: "John Doe",
      password: "securepassword1",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing name", () => {
    const result = acceptInvitationSchema.safeParse({
      token: "invite-token",
      name: "",
      password: "securepassword1",
    });
    expect(result.success).toBe(false);
  });

  it("should reject name exceeding 100 characters", () => {
    const result = acceptInvitationSchema.safeParse({
      token: "invite-token",
      name: "A".repeat(101),
      password: "securepassword1",
    });
    expect(result.success).toBe(false);
  });

  it("should reject password shorter than 12 characters", () => {
    const result = acceptInvitationSchema.safeParse({
      token: "invite-token",
      name: "John",
      password: "short",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// updateSettingsSchema
// ============================================================

describe("updateSettingsSchema", () => {
  it("should accept full valid settings", () => {
    const result = updateSettingsSchema.safeParse({
      profileSettings: { firstName: "Jake", lastName: "S", jobTitle: "Dev" },
      notifications: { notificationEmail: "jake@test.com", newContact: true, newSubscriber: false },
      preferences: { theme: "dark", language: "en-US", timezone: "America/New_York" },
    });
    expect(result.success).toBe(true);
  });

  it("should apply defaults for omitted fields", () => {
    const result = updateSettingsSchema.safeParse({
      profileSettings: {},
      notifications: {},
      preferences: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.profileSettings.firstName).toBe("");
      expect(result.data.notifications.newContact).toBe(true);
      expect(result.data.preferences.theme).toBe("system");
    }
  });

  it("should reject invalid theme value", () => {
    const result = updateSettingsSchema.safeParse({
      profileSettings: {},
      notifications: {},
      preferences: { theme: "neon" },
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// dealUpdateSchema
// ============================================================

describe("dealUpdateSchema", () => {
  it("should accept partial updates", () => {
    const result = dealUpdateSchema.safeParse({ name: "New Deal" });
    expect(result.success).toBe(true);
  });

  it("should accept nullable fields", () => {
    const result = dealUpdateSchema.safeParse({ amount: null, notes: null });
    expect(result.success).toBe(true);
  });

  it("should reject negative amount", () => {
    const result = dealUpdateSchema.safeParse({ amount: -100 });
    expect(result.success).toBe(false);
  });

  it("should reject probability above 100", () => {
    const result = dealUpdateSchema.safeParse({ probability: 150 });
    expect(result.success).toBe(false);
  });

  it("should reject invalid stage_id (not UUID)", () => {
    const result = dealUpdateSchema.safeParse({ stage_id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// moveDealSchema
// ============================================================

describe("moveDealSchema", () => {
  it("should accept a valid UUID stage_id", () => {
    const result = moveDealSchema.safeParse({
      stage_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    });
    expect(result.success).toBe(true);
  });

  it("should reject a non-UUID stage_id", () => {
    const result = moveDealSchema.safeParse({ stage_id: "invalid" });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// bulkUpdateDealsSchema
// ============================================================

describe("bulkUpdateDealsSchema", () => {
  it("should accept valid deal IDs and updates", () => {
    const result = bulkUpdateDealsSchema.safeParse({
      deal_ids: ["a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
      updates: { stage_slug: "won" },
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty deal_ids array", () => {
    const result = bulkUpdateDealsSchema.safeParse({
      deal_ids: [],
      updates: {},
    });
    expect(result.success).toBe(false);
  });

  it("should reject more than 100 deal_ids", () => {
    const ids = Array.from(
      { length: 101 },
      (_, i) => `a1b2c3d4-e5f6-7890-abcd-${String(i).padStart(12, "0")}`,
    );
    const result = bulkUpdateDealsSchema.safeParse({ deal_ids: ids, updates: {} });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// bulkDeleteDealsSchema
// ============================================================

describe("bulkDeleteDealsSchema", () => {
  it("should accept valid deal IDs", () => {
    const result = bulkDeleteDealsSchema.safeParse({
      deal_ids: ["a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty array", () => {
    const result = bulkDeleteDealsSchema.safeParse({ deal_ids: [] });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// paginationSchema
// ============================================================

describe("paginationSchema", () => {
  it("should apply defaults when no input provided", () => {
    const result = paginationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("should accept valid page and limit", () => {
    const result = paginationSchema.safeParse({ page: 3, limit: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(50);
    }
  });

  it("should coerce string values to numbers", () => {
    const result = paginationSchema.safeParse({ page: "2", limit: "10" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(10);
    }
  });

  it("should reject page less than 1", () => {
    const result = paginationSchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it("should reject limit greater than 100", () => {
    const result = paginationSchema.safeParse({ limit: 200 });
    expect(result.success).toBe(false);
  });

  it("should reject non-integer values", () => {
    const result = paginationSchema.safeParse({ page: 1.5 });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// sanitizeError
// ============================================================

describe("sanitizeError", () => {
  it("should return Zod error messages joined by comma", () => {
    const zodError = new z.ZodError([
      {
        code: "too_small",
        minimum: 1,
        type: "string",
        inclusive: true,
        exact: false,
        message: "Required",
        path: ["name"],
      },
    ]);
    expect(sanitizeError(zodError)).toBe("Required");
  });

  it("should return generic message for non-Zod errors", () => {
    expect(sanitizeError(new Error("DB connection failed"))).toBe(
      "An error occurred. Please try again.",
    );
  });

  it("should return generic message for unknown error types", () => {
    expect(sanitizeError("string error")).toBe("An error occurred. Please try again.");
  });
});
