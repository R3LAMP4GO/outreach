/**
 * Rate Limiter Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { RateLimiter, createResendRateLimiter } from "../rate-limiter";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Token Bucket Algorithm", () => {
    it("should allow requests up to burst size", async () => {
      const limiter = new RateLimiter({
        maxRequestsPerSecond: 10,
        maxRequestsPerHour: 1000,
        burstSize: 5,
      });

      // Should acquire 5 tokens immediately (burst size)
      const startTime = Date.now();
      for (let i = 0; i < 5; i++) {
        await limiter.acquire();
      }
      const duration = Date.now() - startTime;

      // Should complete within 100ms (all burst tokens available)
      expect(duration).toBeLessThan(100);
    });

    it("should rate limit after burst exhausted", async () => {
      const limiter = new RateLimiter({
        maxRequestsPerSecond: 10,
        maxRequestsPerHour: 1000,
        burstSize: 2,
      });

      // Acquire burst tokens
      await limiter.acquire();
      await limiter.acquire();

      // Next acquisition should wait
      const startTime = Date.now();
      await limiter.acquire();
      const duration = Date.now() - startTime;

      // Should wait at least 100ms (1/10 second for 10 req/s)
      expect(duration).toBeGreaterThanOrEqual(90);
    });

    it("should refill tokens over time", async () => {
      const limiter = new RateLimiter({
        maxRequestsPerSecond: 100, // 100 tokens per second = 10ms per token
        maxRequestsPerHour: 10000,
        burstSize: 5,
      });

      // Exhaust burst
      for (let i = 0; i < 5; i++) {
        await limiter.acquire();
      }

      // Wait for refill (20ms = 2 tokens)
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Should be able to acquire 2 more tokens quickly
      const startTime = Date.now();
      await limiter.acquire();
      await limiter.acquire();
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(50);
    });
  });

  describe("Hourly Limit", () => {
    it("should enforce hourly rate limit", async () => {
      const limiter = new RateLimiter({
        maxRequestsPerSecond: 100,
        maxRequestsPerHour: 5,
        burstSize: 10,
      });

      // Acquire 5 tokens (hourly limit)
      for (let i = 0; i < 5; i++) {
        await limiter.acquire();
      }

      // Next acquisition should be blocked (but we'll timeout the test)
      const stats = limiter.getStats();
      expect(stats.hourlyCount).toBe(5);
      expect(stats.hourlyRemaining).toBe(0);

      // tryAcquire should fail
      const acquired = limiter.tryAcquire();
      expect(acquired).toBe(false);
    });

    it("should reset hourly counter after window", async () => {
      const limiter = new RateLimiter({
        maxRequestsPerSecond: 100,
        maxRequestsPerHour: 5,
        burstSize: 10,
      });

      // Acquire 5 tokens
      for (let i = 0; i < 5; i++) {
        await limiter.acquire();
      }

      // Reset should allow new requests
      limiter.reset();

      const acquired = limiter.tryAcquire();
      expect(acquired).toBe(true);
    });
  });

  describe("tryAcquire", () => {
    it("should return true when tokens available", () => {
      const limiter = new RateLimiter({
        maxRequestsPerSecond: 10,
        maxRequestsPerHour: 1000,
        burstSize: 5,
      });

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
    });

    it("should return false when no tokens available", () => {
      const limiter = new RateLimiter({
        maxRequestsPerSecond: 10,
        maxRequestsPerHour: 1000,
        burstSize: 1,
      });

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);
    });
  });

  describe("Stats", () => {
    it("should return accurate stats", () => {
      const limiter = new RateLimiter({
        maxRequestsPerSecond: 10,
        maxRequestsPerHour: 1000,
        burstSize: 20,
      });

      const initialStats = limiter.getStats();
      expect(initialStats.tokens).toBe(20);
      expect(initialStats.maxTokens).toBe(20);
      expect(initialStats.hourlyCount).toBe(0);
      expect(initialStats.hourlyLimit).toBe(1000);

      limiter.tryAcquire();
      limiter.tryAcquire();

      const afterStats = limiter.getStats();
      expect(afterStats.tokens).toBe(18);
      expect(afterStats.hourlyCount).toBe(2);
      expect(afterStats.hourlyRemaining).toBe(998);
    });
  });

  describe("Factory Function", () => {
    it("should create limiter with default config", () => {
      const limiter = createResendRateLimiter();
      const stats = limiter.getStats();

      expect(stats.maxTokens).toBe(20);
      expect(stats.hourlyLimit).toBe(1000);
    });

    it("should create limiter with custom config", () => {
      const limiter = createResendRateLimiter({
        maxRequestsPerSecond: 50,
        burstSize: 100,
      });

      const stats = limiter.getStats();
      expect(stats.maxTokens).toBe(100);
    });
  });

  describe("Reset", () => {
    it("should reset all state", () => {
      const limiter = new RateLimiter({
        maxRequestsPerSecond: 10,
        maxRequestsPerHour: 1000,
        burstSize: 5,
      });

      limiter.tryAcquire();
      limiter.tryAcquire();

      limiter.reset();

      const stats = limiter.getStats();
      expect(stats.tokens).toBe(5);
      expect(stats.hourlyCount).toBe(0);
    });
  });
});
