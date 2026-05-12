// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — partial Supabase mocks cause type mismatches
/**
 * Rate Limit Strategies Tests
 *
 * Comprehensive test suite covering:
 * - Exponential backoff calculation
 * - Linear backoff calculation
 * - Constant backoff calculation
 * - Max delay enforcement
 * - withRateLimit decorator
 * - retryWithBackoff function
 * - retryWithRateLimit function
 * - Edge cases and error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ExponentialBackoff,
  LinearBackoff,
  ConstantBackoff,
  withRateLimit,
  retryWithBackoff,
  retryWithRateLimit,
} from "../rate-limit-strategies";
import { TokenBucketRateLimiter } from "../rate-limiter";

describe("ExponentialBackoff", () => {
  describe("Delay Calculation", () => {
    it("should calculate exponential delays correctly", () => {
      const backoff = new ExponentialBackoff(1000, 30000, 2);

      expect(backoff.getDelay(1)).toBe(1000); // 1000 * 2^0
      expect(backoff.getDelay(2)).toBe(2000); // 1000 * 2^1
      expect(backoff.getDelay(3)).toBe(4000); // 1000 * 2^2
      expect(backoff.getDelay(4)).toBe(8000); // 1000 * 2^3
      expect(backoff.getDelay(5)).toBe(16000); // 1000 * 2^4
    });

    it("should cap delay at maxDelay", () => {
      const backoff = new ExponentialBackoff(1000, 10000, 2);

      expect(backoff.getDelay(10)).toBe(10000); // Would be 512000, capped at 10000
      expect(backoff.getDelay(20)).toBe(10000); // Would be huge, capped at 10000
    });

    it("should work with different multipliers", () => {
      const backoff = new ExponentialBackoff(100, 10000, 3);

      expect(backoff.getDelay(1)).toBe(100); // 100 * 3^0
      expect(backoff.getDelay(2)).toBe(300); // 100 * 3^1
      expect(backoff.getDelay(3)).toBe(900); // 100 * 3^2
      expect(backoff.getDelay(4)).toBe(2700); // 100 * 3^3
      expect(backoff.getDelay(5)).toBe(8100); // 100 * 3^4
    });

    it("should throw error for invalid attempt number", () => {
      const backoff = new ExponentialBackoff();

      expect(() => backoff.getDelay(0)).toThrow("Attempt must be >= 1");
      expect(() => backoff.getDelay(-1)).toThrow("Attempt must be >= 1");
    });
  });

  describe("Configuration Validation", () => {
    it("should throw error for non-positive initial delay", () => {
      expect(() => new ExponentialBackoff(0, 10000, 2)).toThrow("Initial delay must be positive");
      expect(() => new ExponentialBackoff(-100, 10000, 2)).toThrow(
        "Initial delay must be positive",
      );
    });

    it("should throw error for maxDelay less than initialDelay", () => {
      expect(() => new ExponentialBackoff(1000, 500, 2)).toThrow(
        "Max delay must be >= initial delay",
      );
    });

    it("should throw error for multiplier <= 1", () => {
      expect(() => new ExponentialBackoff(1000, 10000, 1)).toThrow("Multiplier must be > 1");
      expect(() => new ExponentialBackoff(1000, 10000, 0.5)).toThrow("Multiplier must be > 1");
    });

    it("should accept default parameters", () => {
      const backoff = new ExponentialBackoff();

      expect(backoff.getDelay(1)).toBe(1000);
      expect(backoff.getDelay(2)).toBe(2000);
    });
  });
});

describe("LinearBackoff", () => {
  describe("Delay Calculation", () => {
    it("should calculate linear delays correctly", () => {
      const backoff = new LinearBackoff(1000, 30000);

      expect(backoff.getDelay(1)).toBe(1000); // 1000 * 1
      expect(backoff.getDelay(2)).toBe(2000); // 1000 * 2
      expect(backoff.getDelay(3)).toBe(3000); // 1000 * 3
      expect(backoff.getDelay(4)).toBe(4000); // 1000 * 4
      expect(backoff.getDelay(5)).toBe(5000); // 1000 * 5
    });

    it("should cap delay at maxDelay", () => {
      const backoff = new LinearBackoff(1000, 5000);

      expect(backoff.getDelay(3)).toBe(3000);
      expect(backoff.getDelay(5)).toBe(5000);
      expect(backoff.getDelay(10)).toBe(5000); // Capped at 5000
      expect(backoff.getDelay(100)).toBe(5000); // Capped at 5000
    });

    it("should work with different increments", () => {
      const backoff = new LinearBackoff(500, 10000);

      expect(backoff.getDelay(1)).toBe(500);
      expect(backoff.getDelay(2)).toBe(1000);
      expect(backoff.getDelay(5)).toBe(2500);
      expect(backoff.getDelay(10)).toBe(5000);
    });

    it("should throw error for invalid attempt number", () => {
      const backoff = new LinearBackoff();

      expect(() => backoff.getDelay(0)).toThrow("Attempt must be >= 1");
      expect(() => backoff.getDelay(-1)).toThrow("Attempt must be >= 1");
    });
  });

  describe("Configuration Validation", () => {
    it("should throw error for non-positive increment", () => {
      expect(() => new LinearBackoff(0, 10000)).toThrow("Increment must be positive");
      expect(() => new LinearBackoff(-100, 10000)).toThrow("Increment must be positive");
    });

    it("should throw error for maxDelay less than increment", () => {
      expect(() => new LinearBackoff(1000, 500)).toThrow("Max delay must be >= increment");
    });

    it("should accept default parameters", () => {
      const backoff = new LinearBackoff();

      expect(backoff.getDelay(1)).toBe(1000);
      expect(backoff.getDelay(2)).toBe(2000);
    });
  });
});

describe("ConstantBackoff", () => {
  describe("Delay Calculation", () => {
    it("should return constant delay for all attempts", () => {
      const backoff = new ConstantBackoff(5000);

      expect(backoff.getDelay(1)).toBe(5000);
      expect(backoff.getDelay(2)).toBe(5000);
      expect(backoff.getDelay(10)).toBe(5000);
      expect(backoff.getDelay(100)).toBe(5000);
    });

    it("should work with different delay values", () => {
      const backoff = new ConstantBackoff(2000);

      expect(backoff.getDelay(1)).toBe(2000);
      expect(backoff.getDelay(5)).toBe(2000);
    });
  });

  describe("Configuration Validation", () => {
    it("should throw error for non-positive delay", () => {
      expect(() => new ConstantBackoff(0)).toThrow("Delay must be positive");
      expect(() => new ConstantBackoff(-100)).toThrow("Delay must be positive");
    });

    it("should accept default parameters", () => {
      const backoff = new ConstantBackoff();

      expect(backoff.getDelay(1)).toBe(5000);
    });
  });
});

describe("withRateLimit", () => {
  let limiter: TokenBucketRateLimiter;

  beforeEach(() => {
    limiter = new TokenBucketRateLimiter({
      maxTokens: 10,
      refillRate: 10,
      refillInterval: 1000,
      name: "test",
    });
  });

  it("should rate limit function calls", async () => {
    const mockFn = vi.fn(async (x: number) => x * 2);
    const rateLimitedFn = withRateLimit(mockFn, limiter, 1);

    const result = await rateLimitedFn(5);

    expect(result).toBe(10);
    expect(mockFn).toHaveBeenCalledWith(5);
    expect(limiter.getAvailableTokens()).toBe(9);
  });

  it("should consume specified tokens", async () => {
    const mockFn = vi.fn(async () => "result");
    const rateLimitedFn = withRateLimit(mockFn, limiter, 5);

    await rateLimitedFn();

    expect(limiter.getAvailableTokens()).toBe(5);
  });

  it("should preserve function arguments and return type", async () => {
    const mockFn = vi.fn(async (a: string, b: number) => `${a}-${b}`);
    const rateLimitedFn = withRateLimit(mockFn, limiter);

    const result = await rateLimitedFn("test", 42);

    expect(result).toBe("test-42");
    expect(mockFn).toHaveBeenCalledWith("test", 42);
  });

  it("should throttle when tokens exhausted", async () => {
    const mockFn = vi.fn(async () => "result");
    const rateLimitedFn = withRateLimit(mockFn, limiter, 10);

    // Exhaust tokens
    await rateLimitedFn();

    // This should wait for refill
    const limiter2 = new TokenBucketRateLimiter({
      maxTokens: 10,
      refillRate: 10,
      refillInterval: 100,
      name: "fast-test",
    });

    const rateLimitedFn2 = withRateLimit(mockFn, limiter2, 10);

    await rateLimitedFn2();
    const startTime = Date.now();
    await rateLimitedFn2();
    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  it("should handle errors from wrapped function", async () => {
    const mockFn = vi.fn(async () => {
      throw new Error("Test error");
    });
    const rateLimitedFn = withRateLimit(mockFn, limiter);

    await expect(rateLimitedFn()).rejects.toThrow("Test error");

    // Tokens should still be consumed
    expect(limiter.getAvailableTokens()).toBe(9);
  });
});

describe("retryWithBackoff", () => {
  it("should succeed on first attempt", async () => {
    const mockFn = vi.fn(async () => "success");

    const result = await retryWithBackoff(mockFn, {
      maxAttempts: 3,
      backoffStrategy: new ExponentialBackoff(100, 1000, 2),
    });

    expect(result).toBe("success");
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it("should retry on failure", async () => {
    let attempts = 0;
    const mockFn = vi.fn(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("Temporary failure");
      }
      return "success";
    });

    const result = await retryWithBackoff(mockFn, {
      maxAttempts: 3,
      backoffStrategy: new ConstantBackoff(50),
    });

    expect(result).toBe("success");
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it("should respect maxAttempts", async () => {
    const mockFn = vi.fn(async () => {
      throw new Error("Persistent failure");
    });

    await expect(
      retryWithBackoff(mockFn, {
        maxAttempts: 3,
        backoffStrategy: new ConstantBackoff(10),
      }),
    ).rejects.toThrow("Persistent failure");

    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it("should use backoff strategy for delays", async () => {
    const mockFn = vi.fn(async () => {
      throw new Error("Fail");
    });

    const startTime = Date.now();

    await expect(
      retryWithBackoff(mockFn, {
        maxAttempts: 3,
        backoffStrategy: new ConstantBackoff(100),
      }),
    ).rejects.toThrow();

    const elapsed = Date.now() - startTime;

    // Should have waited 2 times (between 3 attempts): 200ms total
    expect(elapsed).toBeGreaterThanOrEqual(190);
    expect(elapsed).toBeLessThan(300);
  });

  it("should use shouldRetry predicate", async () => {
    let attempts = 0;
    const mockFn = vi.fn(async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error("429 Rate Limit");
      }
      throw new Error("500 Server Error");
    });

    await expect(
      retryWithBackoff(mockFn, {
        maxAttempts: 5,
        backoffStrategy: new ConstantBackoff(10),
        shouldRetry: (error) => error.message.includes("429"),
      }),
    ).rejects.toThrow("500 Server Error");

    // Should only retry once (first 429), then fail on 500
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it("should call onRetry callback", async () => {
    const mockFn = vi.fn(async () => {
      throw new Error("Fail");
    });

    const onRetry = vi.fn();

    await expect(
      retryWithBackoff(mockFn, {
        maxAttempts: 3,
        backoffStrategy: new ConstantBackoff(10),
        onRetry,
      }),
    ).rejects.toThrow();

    // Should be called 2 times (between 3 attempts)
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), 10);
    expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error), 10);
  });

  it("should use exponential backoff correctly", async () => {
    const mockFn = vi.fn(async () => {
      throw new Error("Fail");
    });

    const startTime = Date.now();

    await expect(
      retryWithBackoff(mockFn, {
        maxAttempts: 4,
        backoffStrategy: new ExponentialBackoff(50, 1000, 2),
      }),
    ).rejects.toThrow();

    const elapsed = Date.now() - startTime;

    // Delays: 50ms, 100ms, 200ms = 350ms total
    expect(elapsed).toBeGreaterThanOrEqual(330);
    expect(elapsed).toBeLessThan(450);
  });

  it("should handle default options", async () => {
    const mockFn = vi.fn(async () => "success");

    const result = await retryWithBackoff(mockFn);

    expect(result).toBe("success");
  });
});

describe("retryWithRateLimit", () => {
  let limiter: TokenBucketRateLimiter;

  beforeEach(() => {
    limiter = new TokenBucketRateLimiter({
      maxTokens: 10,
      refillRate: 10,
      refillInterval: 1000,
      name: "test",
    });
  });

  it("should combine rate limiting with retry", async () => {
    const mockFn = vi.fn(async () => "success");

    const result = await retryWithRateLimit(mockFn, limiter, {
      tokens: 2,
      maxAttempts: 3,
    });

    expect(result).toBe("success");
    expect(limiter.getAvailableTokens()).toBe(8);
  });

  it("should consume tokens on each retry attempt", async () => {
    let attempts = 0;
    const mockFn = vi.fn(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("Temporary failure");
      }
      return "success";
    });

    const result = await retryWithRateLimit(mockFn, limiter, {
      tokens: 2,
      maxAttempts: 3,
      backoffStrategy: new ConstantBackoff(10),
    });

    expect(result).toBe("success");
    expect(mockFn).toHaveBeenCalledTimes(3);
    // 3 attempts * 2 tokens = 6 tokens consumed
    expect(limiter.getAvailableTokens()).toBe(4);
  });

  it("should rate limit and retry together", async () => {
    const fastLimiter = new TokenBucketRateLimiter({
      maxTokens: 2,
      refillRate: 2,
      refillInterval: 100,
      name: "fast-test",
    });

    let attempts = 0;
    const mockFn = vi.fn(async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error("Fail");
      }
      return "success";
    });

    const startTime = Date.now();

    const result = await retryWithRateLimit(mockFn, fastLimiter, {
      tokens: 1,
      maxAttempts: 3,
      backoffStrategy: new ConstantBackoff(50),
    });

    const elapsed = Date.now() - startTime;

    expect(result).toBe("success");
    // Should have backoff delay (50ms)
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it("should respect shouldRetry with rate limiting", async () => {
    let attempts = 0;
    const mockFn = vi.fn(async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error("429 Rate Limit");
      }
      throw new Error("500 Server Error");
    });

    await expect(
      retryWithRateLimit(mockFn, limiter, {
        tokens: 1,
        maxAttempts: 5,
        backoffStrategy: new ConstantBackoff(10),
        shouldRetry: (error) => error.message.includes("429"),
      }),
    ).rejects.toThrow("500 Server Error");

    expect(mockFn).toHaveBeenCalledTimes(2);
    // 2 attempts * 1 token = 2 tokens consumed
    expect(limiter.getAvailableTokens()).toBe(8);
  });

  it("should use default token value of 1", async () => {
    const mockFn = vi.fn(async () => "success");

    await retryWithRateLimit(mockFn, limiter);

    expect(limiter.getAvailableTokens()).toBe(9);
  });
});
