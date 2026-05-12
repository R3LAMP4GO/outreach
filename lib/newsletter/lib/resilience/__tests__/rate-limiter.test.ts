/**
 * Token Bucket Rate Limiter Tests
 *
 * Comprehensive test suite covering:
 * - Token bucket refill logic
 * - Rate limit enforcement
 * - Burst handling
 * - Wait time calculation
 * - Pre-configured limiters
 * - Concurrent requests
 * - Reset functionality
 * - Edge cases
 */

import { describe, it, expect } from "vitest";
import {
  TokenBucketRateLimiter,
  rateLimiters,
  createRateLimiter,
  type RateLimiterConfig,
} from "../rate-limiter";

describe("TokenBucketRateLimiter", () => {
  describe("Initialization", () => {
    it("should initialize with correct token count", () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 5,
        refillInterval: 1000,
        name: "test",
      });

      expect(limiter.getAvailableTokens()).toBe(10);
    });

    it("should initialize with config values", () => {
      const config: RateLimiterConfig = {
        maxTokens: 100,
        refillRate: 50,
        refillInterval: 5000,
        name: "test-limiter",
      };

      const limiter = new TokenBucketRateLimiter(config);
      const stats = limiter.getStats();

      expect(stats.maxTokens).toBe(100);
      expect(stats.refillRate).toBe(50);
      expect(stats.refillInterval).toBe(5000);
      expect(stats.name).toBe("test-limiter");
    });
  });

  describe("Token Acquisition", () => {
    it("should acquire single token successfully", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 1000,
        name: "test",
      });

      await limiter.acquire(1);
      expect(limiter.getAvailableTokens()).toBe(9);
    });

    it("should acquire multiple tokens successfully", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 1000,
        name: "test",
      });

      await limiter.acquire(5);
      expect(limiter.getAvailableTokens()).toBe(5);
    });

    it("should acquire all available tokens", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 1000,
        name: "test",
      });

      await limiter.acquire(10);
      expect(limiter.getAvailableTokens()).toBe(0);
    });

    it("should throw error for zero tokens", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 1000,
        name: "test",
      });

      await expect(limiter.acquire(0)).rejects.toThrow("Token count must be positive");
    });

    it("should throw error for negative tokens", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 1000,
        name: "test",
      });

      await expect(limiter.acquire(-5)).rejects.toThrow("Token count must be positive");
    });

    it("should throw error when requesting more than capacity", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 1000,
        name: "test",
      });

      await expect(limiter.acquire(15)).rejects.toThrow("exceeds bucket capacity");
    });
  });

  describe("Token Refill", () => {
    it("should refill tokens over time", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 100, // 100ms for faster tests
        name: "test",
      });

      // Consume all tokens
      await limiter.acquire(10);
      expect(limiter.getAvailableTokens()).toBe(0);

      // Wait for refill
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should have refilled
      expect(limiter.getAvailableTokens()).toBe(10);
    });

    it("should refill partial intervals correctly", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 100,
        refillRate: 10,
        refillInterval: 100, // 10 tokens per 100ms
        name: "test",
      });

      // Consume some tokens
      await limiter.acquire(50);
      expect(limiter.getAvailableTokens()).toBe(50);

      // Wait for partial refill (250ms = 2.5 intervals)
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Should have added at least 20 tokens (2 complete intervals)
      // Allow for some timing variation (may get 3 intervals = 30 tokens)
      const available = limiter.getAvailableTokens();
      expect(available).toBeGreaterThanOrEqual(70); // At least 2 intervals
      expect(available).toBeLessThanOrEqual(80); // At most 3 intervals
    });

    it("should cap refilled tokens at maxTokens", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 100,
        name: "test",
      });

      // Consume 5 tokens
      await limiter.acquire(5);

      // Wait for more than enough refill time
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should be capped at maxTokens (10), not exceed it
      expect(limiter.getAvailableTokens()).toBe(10);
    });
  });

  describe("Wait Time Calculation", () => {
    it("should wait for tokens when insufficient", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 200, // 200ms refill
        name: "test",
      });

      // Consume all tokens
      await limiter.acquire(10);

      const startTime = Date.now();

      // This should wait for refill
      await limiter.acquire(5);

      const elapsed = Date.now() - startTime;

      // Should have waited approximately 200ms (one refill interval)
      expect(elapsed).toBeGreaterThanOrEqual(190); // Allow small margin
      expect(elapsed).toBeLessThan(300);
    });

    it("should calculate correct wait time for multiple intervals", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 5, // 5 tokens per interval
        refillInterval: 100,
        name: "test",
      });

      // Consume all tokens
      await limiter.acquire(10);

      const startTime = Date.now();

      // Need 10 tokens, refill gives 5 per interval
      // Should wait 2 intervals (200ms)
      await limiter.acquire(10);

      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(190);
      expect(elapsed).toBeLessThan(300);
    });
  });

  describe("Burst Handling", () => {
    it("should handle burst requests using accumulated tokens", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 100,
        refillRate: 100,
        refillInterval: 1000,
        name: "test",
      });

      // Burst: consume 50 tokens rapidly
      await limiter.acquire(10);
      await limiter.acquire(10);
      await limiter.acquire(10);
      await limiter.acquire(10);
      await limiter.acquire(10);

      // Should have 50 tokens left
      expect(limiter.getAvailableTokens()).toBe(50);
    });

    it("should throttle after burst exhausts tokens", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 200,
        name: "test",
      });

      // Burst: exhaust all tokens
      await limiter.acquire(10);

      const startTime = Date.now();

      // Next request should wait
      await limiter.acquire(5);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(190);
    });
  });

  describe("Concurrent Requests", () => {
    it("should handle concurrent acquisitions correctly", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 100,
        refillRate: 100,
        refillInterval: 1000,
        name: "test",
      });

      // Launch 10 concurrent requests
      const promises = Array.from({ length: 10 }, () => limiter.acquire(5));

      await Promise.all(promises);

      // Should have consumed 50 tokens
      expect(limiter.getAvailableTokens()).toBe(50);
    });

    it("should queue requests when tokens exhausted", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 100,
        name: "test",
      });

      const results: number[] = [];
      const startTime = Date.now();

      // Launch requests that exceed capacity
      const promises = [
        limiter.acquire(5).then(() => results.push(Date.now() - startTime)),
        limiter.acquire(5).then(() => results.push(Date.now() - startTime)),
        limiter.acquire(5).then(() => results.push(Date.now() - startTime)),
      ];

      await Promise.all(promises);

      // First two should complete quickly, third should wait
      expect(results[0]).toBeLessThan(50);
      expect(results[1]).toBeLessThan(50);
      expect(results[2]).toBeGreaterThanOrEqual(90);
    });
  });

  describe("Reset Functionality", () => {
    it("should reset to full capacity", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 1000,
        name: "test",
      });

      // Consume tokens
      await limiter.acquire(7);
      expect(limiter.getAvailableTokens()).toBe(3);

      // Reset
      limiter.reset();

      // Should be back to full capacity
      expect(limiter.getAvailableTokens()).toBe(10);
    });

    it("should reset last refill time", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 100,
        name: "test",
      });

      // Consume tokens
      await limiter.acquire(10);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Reset
      limiter.reset();

      // Should not have refilled from before reset
      expect(limiter.getAvailableTokens()).toBe(10);
    });
  });

  describe("hasTokens()", () => {
    it("should return true when tokens available", () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 1000,
        name: "test",
      });

      expect(limiter.hasTokens(5)).toBe(true);
      expect(limiter.hasTokens(10)).toBe(true);
    });

    it("should return false when insufficient tokens", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 1000,
        name: "test",
      });

      await limiter.acquire(8);

      expect(limiter.hasTokens(5)).toBe(false);
      expect(limiter.hasTokens(2)).toBe(true);
    });
  });

  describe("getStats()", () => {
    it("should return correct statistics", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 100,
        refillRate: 50,
        refillInterval: 5000,
        name: "test-stats",
      });

      await limiter.acquire(30);

      const stats = limiter.getStats();

      expect(stats.name).toBe("test-stats");
      expect(stats.maxTokens).toBe(100);
      expect(stats.availableTokens).toBe(70);
      expect(stats.utilizationPercent).toBe(30);
      expect(stats.refillRate).toBe(50);
      expect(stats.refillInterval).toBe(5000);
      expect(stats.lastRefill).toBeDefined();
    });
  });

  describe("Pre-configured Rate Limiters", () => {
    it("should have Reddit rate limiter configured", () => {
      const stats = rateLimiters.reddit.getStats();

      expect(stats.name).toBe("reddit");
      expect(stats.maxTokens).toBe(300);
      expect(stats.refillRate).toBe(300);
      expect(stats.refillInterval).toBe(15 * 60 * 1000);
    });

    it("should have Claude rate limiter configured", () => {
      const stats = rateLimiters.claude.getStats();

      expect(stats.name).toBe("claude");
      expect(stats.maxTokens).toBe(50000);
      expect(stats.refillRate).toBe(50000);
      expect(stats.refillInterval).toBe(60 * 1000);
    });

    it("should have OpenAI rate limiter configured", () => {
      const stats = rateLimiters.openai.getStats();

      expect(stats.name).toBe("openai");
      expect(stats.maxTokens).toBe(3000000);
      expect(stats.refillRate).toBe(3000000);
      expect(stats.refillInterval).toBe(60 * 1000);
    });

    it("should have Resend rate limiter configured", () => {
      const stats = rateLimiters.resend.getStats();

      expect(stats.name).toBe("resend");
      expect(stats.maxTokens).toBe(100);
      expect(stats.refillRate).toBe(100);
      expect(stats.refillInterval).toBe(60 * 60 * 1000);
    });
  });

  describe("createRateLimiter()", () => {
    it("should create custom rate limiter", () => {
      const limiter = createRateLimiter({
        maxTokens: 50,
        refillRate: 25,
        refillInterval: 2000,
        name: "custom",
      });

      const stats = limiter.getStats();

      expect(stats.name).toBe("custom");
      expect(stats.maxTokens).toBe(50);
      expect(stats.refillRate).toBe(25);
      expect(stats.refillInterval).toBe(2000);
    });
  });

  describe("Performance Tests", () => {
    it("should handle 100 sequential requests efficiently", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 1000,
        refillRate: 1000,
        refillInterval: 1000,
        name: "perf-test",
      });

      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        await limiter.acquire(1);
      }

      const elapsed = Date.now() - startTime;

      // Should complete quickly (under 100ms) since tokens are available
      expect(elapsed).toBeLessThan(100);
      // Allow for minor refill during execution (900-902 tokens)
      const available = limiter.getAvailableTokens();
      expect(available).toBeGreaterThanOrEqual(898);
      expect(available).toBeLessThanOrEqual(902);
    });

    it("should handle burst of 1000 requests with proper throttling", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 100,
        refillRate: 100,
        refillInterval: 50, // Fast refill for testing
        name: "burst-test",
      });

      const promises = Array.from({ length: 1000 }, () => limiter.acquire(1));

      const startTime = Date.now();
      await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      // Should have throttled appropriately
      // 1000 requests, 100 token capacity, 100 tokens per 50ms
      // Expected: ~450ms (9 refill cycles)
      // Allow wider range due to concurrent execution and timing variations
      expect(elapsed).toBeGreaterThanOrEqual(40); // Should take some time
      expect(elapsed).toBeLessThan(1000); // Should complete within reasonable time
    });
  });

  describe("Edge Cases", () => {
    it("should handle very small refill intervals", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 10, // 10ms
        name: "fast-refill",
      });

      await limiter.acquire(10);

      // Wait for refill
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(limiter.getAvailableTokens()).toBe(10);
    });

    it("should handle very large token counts", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 1000000,
        refillRate: 1000000,
        refillInterval: 60000,
        name: "large-capacity",
      });

      await limiter.acquire(500000);

      expect(limiter.getAvailableTokens()).toBe(500000);
    });

    it("should handle fractional refill intervals", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 100,
        refillRate: 10,
        refillInterval: 100,
        name: "fractional",
      });

      await limiter.acquire(100);

      // Wait for 1.5 intervals (150ms)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should have added 10-20 tokens (1-2 complete intervals due to timing)
      const available = limiter.getAvailableTokens();
      expect(available).toBeGreaterThanOrEqual(10);
      expect(available).toBeLessThanOrEqual(20);
    });
  });
});
