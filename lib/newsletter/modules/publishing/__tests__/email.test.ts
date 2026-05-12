// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — partial Supabase mocks cause type mismatches
/**
 * Email Publisher Tests
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { EmailPublisher, createEmailPublisher } from "../email";
import type { EmailRecipient, EmailTemplate, EmailSendOptions, UnsubscribeLink } from "../types";

// Mock Resend
vi.mock("resend", () => {
  return {
    Resend: class MockResend {
      emails = { send: vi.fn() };
      constructor() {}
    },
  };
});

describe("EmailPublisher", () => {
  let publisher: EmailPublisher;
  let mockSend: Mock;

  const testRecipient: EmailRecipient = {
    id: "sub_123",
    email: "test@example.com",
    name: "Test User",
  };

  const testTemplate: EmailTemplate = {
    subject: "Test Newsletter",
    preheader: "This is a test",
    html: "<h1>Test Newsletter</h1><p>Content here</p>",
    text: "Test Newsletter\n\nContent here",
  };

  const testOptions: EmailSendOptions = {
    from: {
      email: "newsletter@example.com",
      name: "Test Newsletter",
    },
  };

  const testUnsubscribeLink: UnsubscribeLink = {
    url: "https://example.com/unsubscribe/sub_123",
    text: "Unsubscribe",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    publisher = new EmailPublisher({
      apiKey: "test_api_key",
      enableRateLimiting: false, // Disable for testing
      enableRetry: false, // Disable for testing
    });

    mockSend = (publisher as unknown as { resend: { emails: { send: ReturnType<typeof vi.fn> } } })
      .resend.emails.send;
  });

  describe("sendToRecipient", () => {
    it("should send email successfully", async () => {
      mockSend.mockResolvedValue({
        data: { id: "msg_123" },
        error: null,
      });

      const result = await publisher.sendToRecipient(
        testRecipient,
        testTemplate,
        testOptions,
        testUnsubscribeLink,
      );

      expect(result.success).toBe(true);
      expect(result.recipientId).toBe("sub_123");
      expect(result.email).toBe("test@example.com");
      expect(result.resendId).toBe("msg_123");
      expect(result.error).toBeUndefined();

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "Test Newsletter <newsletter@example.com>",
          to: "test@example.com",
          subject: "Test Newsletter",
          headers: expect.objectContaining({
            "List-Unsubscribe": "<https://example.com/unsubscribe/sub_123>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }),
        }),
      );
    });

    it("should include unsubscribe footer in HTML", async () => {
      mockSend.mockResolvedValue({
        data: { id: "msg_123" },
        error: null,
      });

      await publisher.sendToRecipient(
        testRecipient,
        testTemplate,
        testOptions,
        testUnsubscribeLink,
      );

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain("unsubscribe");
      expect(call.html).toContain(testUnsubscribeLink.url);
    });

    it("should handle Resend API error", async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: "API Error" },
      });

      const result = await publisher.sendToRecipient(testRecipient, testTemplate, testOptions);

      expect(result.success).toBe(false);
      expect(result.error).toBe("API Error");
    });

    it("should validate email address", async () => {
      const invalidRecipient = {
        ...testRecipient,
        email: "invalid-email",
      };

      const result = await publisher.sendToRecipient(invalidRecipient, testTemplate, testOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid email");
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("should detect common email typos", async () => {
      const typoRecipient = {
        ...testRecipient,
        email: "test@gmial.com", // Common typo
      };

      const result = await publisher.sendToRecipient(typoRecipient, testTemplate, testOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("typo");
    });

    it("should include tags when provided", async () => {
      mockSend.mockResolvedValue({
        data: { id: "msg_123" },
        error: null,
      });

      const optionsWithTags = {
        ...testOptions,
        tags: [
          { name: "campaign", value: "test-campaign" },
          { name: "edition", value: "edition-123" },
        ],
      };

      await publisher.sendToRecipient(testRecipient, testTemplate, optionsWithTags);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: optionsWithTags.tags,
        }),
      );
    });

    it("should use reply-to from template if provided", async () => {
      mockSend.mockResolvedValue({
        data: { id: "msg_123" },
        error: null,
      });

      const templateWithReplyTo = {
        ...testTemplate,
        replyTo: "reply@example.com",
      };

      await publisher.sendToRecipient(testRecipient, templateWithReplyTo, testOptions);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: "reply@example.com",
        }),
      );
    });
  });

  describe("sendBatch", () => {
    it("should send emails to multiple recipients", async () => {
      mockSend.mockResolvedValue({
        data: { id: "msg_123" },
        error: null,
      });

      const recipients: EmailRecipient[] = [
        { id: "sub_1", email: "user1@example.com" },
        { id: "sub_2", email: "user2@example.com" },
        { id: "sub_3", email: "user3@example.com" },
      ];

      const result = await publisher.sendBatch(recipients, testTemplate, testOptions, undefined, {
        batchSize: 10,
        delayBetweenBatches: 0,
      });

      expect(result.total).toBe(3);
      expect(result.sent).toBe(3);
      expect(result.failed).toBe(0);
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it("should process in batches", async () => {
      mockSend.mockResolvedValue({
        data: { id: "msg_123" },
        error: null,
      });

      const recipients: EmailRecipient[] = Array.from({ length: 25 }, (_, i) => ({
        id: `sub_${i}`,
        email: `user${i}@example.com`,
      }));

      const result = await publisher.sendBatch(recipients, testTemplate, testOptions, undefined, {
        batchSize: 10,
        concurrency: 2,
        delayBetweenBatches: 0,
      });

      expect(result.total).toBe(25);
      expect(result.sent).toBe(25);
      expect(mockSend).toHaveBeenCalledTimes(25);
    });

    it("should continue processing on errors by default", async () => {
      let callCount = 0;
      mockSend.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.resolve({
            data: null,
            error: { message: "Failed" },
          });
        }
        return Promise.resolve({
          data: { id: `msg_${callCount}` },
          error: null,
        });
      });

      const recipients: EmailRecipient[] = Array.from({ length: 5 }, (_, i) => ({
        id: `sub_${i}`,
        email: `user${i}@example.com`,
      }));

      const result = await publisher.sendBatch(recipients, testTemplate, testOptions, undefined, {
        delayBetweenBatches: 0,
      });

      expect(result.total).toBe(5);
      expect(result.sent).toBe(4);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it("should stop on error when configured", async () => {
      let callCount = 0;
      mockSend.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.resolve({
            data: null,
            error: { message: "Failed" },
          });
        }
        return Promise.resolve({
          data: { id: `msg_${callCount}` },
          error: null,
        });
      });

      const recipients: EmailRecipient[] = Array.from({ length: 5 }, (_, i) => ({
        id: `sub_${i}`,
        email: `user${i}@example.com`,
      }));

      const result = await publisher.sendBatch(recipients, testTemplate, testOptions, undefined, {
        batchSize: 10,
        stopOnError: true,
        delayBetweenBatches: 0,
      });

      expect(result.sent).toBeLessThan(5);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should generate per-recipient unsubscribe links", async () => {
      mockSend.mockResolvedValue({
        data: { id: "msg_123" },
        error: null,
      });

      const recipients: EmailRecipient[] = [
        { id: "sub_1", email: "user1@example.com" },
        { id: "sub_2", email: "user2@example.com" },
      ];

      const unsubscribeFn = (recipient: EmailRecipient) => ({
        url: `https://example.com/unsubscribe/${recipient.id}`,
        text: "Unsubscribe",
      });

      await publisher.sendBatch(recipients, testTemplate, testOptions, unsubscribeFn, {
        delayBetweenBatches: 0,
      });

      // Check that each call has unique unsubscribe link
      const calls = mockSend.mock.calls;
      expect(calls[0][0].headers["List-Unsubscribe"]).toContain("sub_1");
      expect(calls[1][0].headers["List-Unsubscribe"]).toContain("sub_2");
    });

    it("should respect concurrency limit", async () => {
      let concurrentCalls = 0;
      let maxConcurrent = 0;

      mockSend.mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
        await new Promise((resolve) => setTimeout(resolve, 50));
        concurrentCalls--;
        return { data: { id: "msg_123" }, error: null };
      });

      const recipients: EmailRecipient[] = Array.from({ length: 10 }, (_, i) => ({
        id: `sub_${i}`,
        email: `user${i}@example.com`,
      }));

      await publisher.sendBatch(recipients, testTemplate, testOptions, undefined, {
        concurrency: 3,
        delayBetweenBatches: 0,
      });

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });
  });

  describe("Rate Limiter Integration", () => {
    it("should respect rate limits when enabled", async () => {
      const publisherWithLimits = new EmailPublisher({
        apiKey: "test_api_key",
        enableRateLimiting: true,
        rateLimitConfig: {
          maxRequestsPerSecond: 5,
          maxRequestsPerHour: 100,
          burstSize: 5,
        },
        enableRetry: false,
      });

      const send = (
        publisherWithLimits as unknown as { resend: { emails: { send: ReturnType<typeof vi.fn> } } }
      ).resend.emails.send;
      send.mockResolvedValue({
        data: { id: "msg_123" },
        error: null,
      });

      const startTime = Date.now();

      // Send 6 emails (5 burst + 1 rate limited)
      for (let i = 0; i < 6; i++) {
        await publisherWithLimits.sendToRecipient(
          { ...testRecipient, id: `sub_${i}` },
          testTemplate,
          testOptions,
        );
      }

      const duration = Date.now() - startTime;

      // Should take at least 200ms (1/5 second for 6th email)
      expect(duration).toBeGreaterThanOrEqual(150);
    });

    it("should provide rate limiter stats", () => {
      const publisherWithLimits = new EmailPublisher({
        apiKey: "test_api_key",
        enableRateLimiting: true,
        rateLimitConfig: {
          maxRequestsPerSecond: 10,
          maxRequestsPerHour: 1000,
          burstSize: 20,
        },
      });

      const stats = publisherWithLimits.getRateLimiterStats();
      expect(stats).toBeDefined();
      expect(stats?.maxTokens).toBe(20);
      expect(stats?.hourlyLimit).toBe(1000);
    });
  });

  describe("Factory Function", () => {
    it("should create publisher with minimal config", () => {
      const pub = createEmailPublisher("test_api_key");
      expect(pub).toBeInstanceOf(EmailPublisher);
    });

    it("should create publisher with custom config", () => {
      const pub = createEmailPublisher("test_api_key", {
        enableRateLimiting: false,
        enableRetry: false,
      });
      expect(pub).toBeInstanceOf(EmailPublisher);
    });
  });
});
