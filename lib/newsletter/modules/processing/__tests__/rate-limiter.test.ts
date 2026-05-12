/**
 * Tests for RateLimiter
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { RateLimiter } from "../rate-limiter";
import { SummarizerErrorType } from "../../../types/summarizer";

describe("RateLimiter", () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter(10, 10000); // 10 requests/min, 10K tokens/min
  });

  describe("checkLimit()", () => {
    it("should allow requests within limits", async () => {
      await expect(rateLimiter.checkLimit(1000)).resolves.toBeUndefined();
      await expect(rateLimiter.checkLimit(1000)).resolves.toBeUndefined();
      await expect(rateLimiter.checkLimit(1000)).resolves.toBeUndefined();
    });

    it("should throw error when request limit exceeded", async () => {
      // Make 10 requests (at the limit)
      for (let i = 0; i < 10; i++) {
        rateLimiter.recordRequest(100);
      }

      // 11th request should fail
      await expect(rateLimiter.checkLimit(100)).rejects.toThrow();

      try {
        await rateLimiter.checkLimit(100);
      } catch (error: unknown) {
        const err = error as { type: string; message: string; retryable: boolean };
        expect(err.type).toBe(SummarizerErrorType.RATE_LIMIT_EXCEEDED);
        expect(err.message).toContain("requests per minute");
        expect(err.retryable).toBe(true);
      }
    });

    it("should throw error when token limit exceeded", async () => {
      // Use up token budget with large request
      rateLimiter.recordRequest(9000);

      // Request that would exceed token limit
      await expect(rateLimiter.checkLimit(2000)).rejects.toThrow();

      try {
        await rateLimiter.checkLimit(2000);
      } catch (error: unknown) {
        const err = error as { type: string; message: string; retryable: boolean };
        expect(err.type).toBe(SummarizerErrorType.RATE_LIMIT_EXCEEDED);
        expect(err.message).toContain("Token rate limit");
        expect(err.retryable).toBe(true);
      }
    });
  });

  describe("recordRequest()", () => {
    it("should track request count", () => {
      rateLimiter.recordRequest(100);
      rateLimiter.recordRequest(200);
      rateLimiter.recordRequest(300);

      const capacity = rateLimiter.getRemainingCapacity();

      expect(capacity.requests).toBe(7); // 10 - 3 = 7
      expect(capacity.tokens).toBe(9400); // 10000 - 600 = 9400
    });

    it("should track token usage", () => {
      rateLimiter.recordRequest(1000);
      rateLimiter.recordRequest(2000);

      const capacity = rateLimiter.getRemainingCapacity();

      expect(capacity.tokens).toBe(7000); // 10000 - 3000 = 7000
    });
  });

  describe("getRemainingCapacity()", () => {
    it("should return full capacity initially", () => {
      const capacity = rateLimiter.getRemainingCapacity();

      expect(capacity.requests).toBe(10);
      expect(capacity.tokens).toBe(10000);
      expect(capacity.resetsIn).toBeGreaterThan(0);
      expect(capacity.resetsIn).toBeLessThanOrEqual(60000);
    });

    it("should return decreased capacity after usage", () => {
      rateLimiter.recordRequest(1000);
      rateLimiter.recordRequest(2000);

      const capacity = rateLimiter.getRemainingCapacity();

      expect(capacity.requests).toBe(8);
      expect(capacity.tokens).toBe(7000);
    });

    it("should never return negative capacity", () => {
      // Use up all requests
      for (let i = 0; i < 15; i++) {
        rateLimiter.recordRequest(100);
      }

      const capacity = rateLimiter.getRemainingCapacity();

      expect(capacity.requests).toBe(0);
      expect(capacity.tokens).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Window reset", () => {
    it("should reset window after 60 seconds", async () => {
      // Use some capacity
      rateLimiter.recordRequest(1000);
      rateLimiter.recordRequest(2000);

      let capacity = rateLimiter.getRemainingCapacity();
      expect(capacity.requests).toBe(8);
      expect(capacity.tokens).toBe(7000);

      // Mock time passing (fast-forward 61 seconds)
      vi.useFakeTimers();
      vi.advanceTimersByTime(61000);

      // Check capacity - should be reset
      capacity = rateLimiter.getRemainingCapacity();
      expect(capacity.requests).toBe(10);
      expect(capacity.tokens).toBe(10000);

      vi.useRealTimers();
    });

    it("should reset window on next check after time passes", async () => {
      rateLimiter.recordRequest(5000);

      vi.useFakeTimers();
      vi.advanceTimersByTime(61000);

      // Recording a new request should trigger reset
      rateLimiter.recordRequest(1000);

      const capacity = rateLimiter.getRemainingCapacity();
      expect(capacity.requests).toBe(9); // Only 1 request in new window
      expect(capacity.tokens).toBe(9000); // Only 1000 tokens used in new window

      vi.useRealTimers();
    });
  });

  describe("waitForReset()", () => {
    it("should wait for rate limit reset", async () => {
      vi.useFakeTimers();

      const waitPromise = rateLimiter.waitForReset();

      // Should wait close to 60 seconds
      const capacity = rateLimiter.getRemainingCapacity();
      expect(capacity.resetsIn).toBeGreaterThan(55000);

      // Fast-forward time
      vi.advanceTimersByTime(60000);

      await waitPromise;

      vi.useRealTimers();
    });

    it("should resolve immediately if window already reset", async () => {
      vi.useFakeTimers();

      // Fast-forward past the window
      vi.advanceTimersByTime(65000);

      const startTime = Date.now();
      await rateLimiter.waitForReset();
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(100); // Should be immediate

      vi.useRealTimers();
    });
  });

  describe("reset()", () => {
    it("should reset rate limiter state", () => {
      // Use some capacity
      rateLimiter.recordRequest(1000);
      rateLimiter.recordRequest(2000);

      let capacity = rateLimiter.getRemainingCapacity();
      expect(capacity.requests).toBe(8);
      expect(capacity.tokens).toBe(7000);

      // Reset
      rateLimiter.reset();

      capacity = rateLimiter.getRemainingCapacity();
      expect(capacity.requests).toBe(10);
      expect(capacity.tokens).toBe(10000);
    });
  });

  describe("Edge cases", () => {
    it("should handle zero token requests", async () => {
      await expect(rateLimiter.checkLimit(0)).resolves.toBeUndefined();
      rateLimiter.recordRequest(0);

      const capacity = rateLimiter.getRemainingCapacity();
      expect(capacity.tokens).toBe(10000);
    });

    it("should handle very large token requests", async () => {
      await expect(rateLimiter.checkLimit(15000)).rejects.toThrow();
    });

    it("should handle rapid sequential requests", async () => {
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkLimit(500);
        rateLimiter.recordRequest(500);
      }

      // 11th should fail
      await expect(rateLimiter.checkLimit(500)).rejects.toThrow();
    });
  });

  describe("Different rate limit configurations", () => {
    it("should work with different request limits", async () => {
      const customLimiter = new RateLimiter(5, 50000); // 5 requests/min

      for (let i = 0; i < 5; i++) {
        await customLimiter.checkLimit(1000);
        customLimiter.recordRequest(1000);
      }

      // 6th should fail
      await expect(customLimiter.checkLimit(1000)).rejects.toThrow();
    });

    it("should work with different token limits", async () => {
      const customLimiter = new RateLimiter(50, 5000); // 5K tokens/min

      await customLimiter.checkLimit(4000);
      customLimiter.recordRequest(4000);

      // Request that would exceed token limit
      await expect(customLimiter.checkLimit(2000)).rejects.toThrow();
    });

    it("should work with very restrictive limits", async () => {
      const strictLimiter = new RateLimiter(1, 1000);

      await strictLimiter.checkLimit(500);
      strictLimiter.recordRequest(500);

      // Second request should fail
      await expect(strictLimiter.checkLimit(500)).rejects.toThrow();
    });
  });
});
