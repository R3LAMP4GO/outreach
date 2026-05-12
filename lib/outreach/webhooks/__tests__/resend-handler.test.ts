import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleResendWebhook } from "../resend-handler";
import type { WebhookHeaders } from "../types";

// Mock all external dependencies
vi.mock("../../lib/resend", () => ({
  verifyWebhookSignature: vi.fn().mockResolvedValue(true),
}));

vi.mock("../events/sent", () => ({
  handleEmailSent: vi.fn().mockResolvedValue(true),
}));

vi.mock("../events/delivered", () => ({
  handleEmailDelivered: vi.fn().mockResolvedValue(true),
}));

vi.mock("../events/bounced", () => ({
  handleEmailBounced: vi.fn().mockResolvedValue(true),
}));

vi.mock("../events/opened", () => ({
  handleEmailOpened: vi.fn().mockResolvedValue(true),
}));

vi.mock("../events/clicked", () => ({
  handleEmailClicked: vi.fn().mockResolvedValue(true),
}));

vi.mock("../events/received", () => ({
  handleEmailReceived: vi.fn().mockResolvedValue(true),
}));

// Mock @/lib/db — Drizzle ORM client used for duplicate event detection
const mockLimit = vi.fn().mockResolvedValue([]);
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { verifyWebhookSignature } from "../../lib/resend";
import { handleEmailSent } from "../events/sent";
import { handleEmailDelivered } from "../events/delivered";
import { handleEmailBounced } from "../events/bounced";
import { handleEmailOpened } from "../events/opened";
import { handleEmailClicked } from "../events/clicked";
import { handleEmailReceived } from "../events/received";

const webhookSecret = "whsec_test123";
const defaultHeaders: WebhookHeaders = {
  "svix-id": "msg_test_123",
  "svix-timestamp": "1234567890",
  "svix-signature": "v1,test-sig",
};

function makePayload(type: string, tags: Record<string, string> = {}) {
  return JSON.stringify({
    type,
    created_at: "2025-03-17T10:00:00Z",
    data: {
      created_at: "2025-03-17T10:00:00Z",
      email_id: "email-123",
      from: "sender@example.com",
      to: ["recipient@example.com"],
      tags,
    },
  });
}

describe("handleResendWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no duplicate events found
    mockLimit.mockResolvedValue([]);
    vi.mocked(verifyWebhookSignature).mockResolvedValue(true);
    vi.mocked(handleEmailSent).mockResolvedValue(true);
    vi.mocked(handleEmailDelivered).mockResolvedValue(true);
    vi.mocked(handleEmailBounced).mockResolvedValue(true);
    vi.mocked(handleEmailOpened).mockResolvedValue(true);
    vi.mocked(handleEmailClicked).mockResolvedValue(true);
    vi.mocked(handleEmailReceived).mockResolvedValue(true);
  });

  describe("signature verification", () => {
    it("rejects invalid signature", async () => {
      vi.mocked(verifyWebhookSignature).mockResolvedValue(false);
      const result = await handleResendWebhook(
        makePayload("email.sent"),
        defaultHeaders,
        webhookSecret,
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid webhook signature");
    });
  });

  describe("event routing", () => {
    it("routes email.sent to handleEmailSent", async () => {
      const result = await handleResendWebhook(
        makePayload("email.sent"),
        defaultHeaders,
        webhookSecret,
      );
      expect(result.success).toBe(true);
      expect(result.eventType).toBe("email.sent");
      expect(handleEmailSent).toHaveBeenCalled();
    });

    it("routes email.delivered to handleEmailDelivered", async () => {
      const result = await handleResendWebhook(
        makePayload("email.delivered"),
        defaultHeaders,
        webhookSecret,
      );
      expect(result.success).toBe(true);
      expect(handleEmailDelivered).toHaveBeenCalled();
    });

    it("routes email.bounced to handleEmailBounced", async () => {
      const result = await handleResendWebhook(
        makePayload("email.bounced"),
        defaultHeaders,
        webhookSecret,
      );
      expect(result.success).toBe(true);
      expect(handleEmailBounced).toHaveBeenCalled();
    });

    it("routes email.complained to handleEmailBounced (spam = bounce)", async () => {
      const result = await handleResendWebhook(
        makePayload("email.complained"),
        defaultHeaders,
        webhookSecret,
      );
      expect(result.success).toBe(true);
      expect(handleEmailBounced).toHaveBeenCalled();
    });

    it("routes email.opened to handleEmailOpened", async () => {
      const result = await handleResendWebhook(
        makePayload("email.opened"),
        defaultHeaders,
        webhookSecret,
      );
      expect(result.success).toBe(true);
      expect(handleEmailOpened).toHaveBeenCalled();
    });

    it("routes email.clicked to handleEmailClicked", async () => {
      const result = await handleResendWebhook(
        makePayload("email.clicked"),
        defaultHeaders,
        webhookSecret,
      );
      expect(result.success).toBe(true);
      expect(handleEmailClicked).toHaveBeenCalled();
    });

    it("routes email.received to handleEmailReceived", async () => {
      const result = await handleResendWebhook(
        makePayload("email.received"),
        defaultHeaders,
        webhookSecret,
      );
      expect(result.success).toBe(true);
      expect(handleEmailReceived).toHaveBeenCalled();
    });

    it("handles email.delivery_delayed without error", async () => {
      const result = await handleResendWebhook(
        makePayload("email.delivery_delayed"),
        defaultHeaders,
        webhookSecret,
      );
      expect(result.success).toBe(true);
    });
  });

  describe("tag extraction", () => {
    it("extracts contact_id and email_number from tags", async () => {
      const payload = makePayload("email.sent", { contact_id: "c-123", email_number: "2" });
      const result = await handleResendWebhook(payload, defaultHeaders, webhookSecret);
      expect(result.contactId).toBe("c-123");
      expect(result.emailNumber).toBe(2);
    });

    it("handles missing tags gracefully", async () => {
      const payload = makePayload("email.sent");
      const result = await handleResendWebhook(payload, defaultHeaders, webhookSecret);
      expect(result.contactId).toBeUndefined();
      expect(result.emailNumber).toBeUndefined();
    });
  });

  describe("duplicate detection", () => {
    it("returns success for duplicate events without re-processing", async () => {
      // Simulate Drizzle returning an existing row (duplicate)
      mockLimit.mockResolvedValue([{ id: "existing" }]);

      const result = await handleResendWebhook(
        makePayload("email.sent"),
        defaultHeaders,
        webhookSecret,
      );
      expect(result.success).toBe(true);
      // Should not call the event handler since it's a duplicate
      expect(handleEmailSent).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("handles invalid JSON payload", async () => {
      vi.mocked(verifyWebhookSignature).mockResolvedValue(true);
      const result = await handleResendWebhook("not valid json", defaultHeaders, webhookSecret);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("handles handler returning false", async () => {
      vi.mocked(handleEmailSent).mockResolvedValue(false);
      const result = await handleResendWebhook(
        makePayload("email.sent"),
        defaultHeaders,
        webhookSecret,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Handler failed");
    });

    it("handles handler throwing an error", async () => {
      vi.mocked(handleEmailSent).mockRejectedValue(new Error("DB connection failed"));
      const result = await handleResendWebhook(
        makePayload("email.sent"),
        defaultHeaders,
        webhookSecret,
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe("DB connection failed");
    });

    it("handles unknown event type", async () => {
      const payload = JSON.stringify({
        type: "email.unknown_event",
        created_at: "2025-03-17T10:00:00Z",
        data: {
          created_at: "2025-03-17T10:00:00Z",
          email_id: "email-123",
          from: "sender@example.com",
          to: ["recipient@example.com"],
        },
      });
      const result = await handleResendWebhook(payload, defaultHeaders, webhookSecret);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });
});
