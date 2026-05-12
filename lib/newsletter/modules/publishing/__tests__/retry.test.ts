/**
 * Retry Logic Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  retryWithBackoff,
  isRetryableError,
  getRetryErrorType,
  calculateBackoffDelay,
  createDefaultRetryConfig,
  RetryableErrorType,
} from "../retry";

describe("Retry Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isRetryableError", () => {
    const config = createDefaultRetryConfig();

    it("should identify retryable status codes", () => {
      expect(isRetryableError({ statusCode: 429 }, config)).toBe(true);
      expect(isRetryableError({ statusCode: 500 }, config)).toBe(true);
      expect(isRetryableError({ statusCode: 502 }, config)).toBe(true);
      expect(isRetryableError({ statusCode: 503 }, config)).toBe(true);
      expect(isRetryableError({ statusCode: 504 }, config)).toBe(true);
    });

    it("should identify non-retryable status codes", () => {
      expect(isRetryableError({ statusCode: 400 }, config)).toBe(false);
      expect(isRetryableError({ statusCode: 401 }, config)).toBe(false);
      expect(isRetryableError({ statusCode: 404 }, config)).toBe(false);
    });

    it("should identify rate limit errors by message", () => {
      expect(isRetryableError({ message: "Rate limit exceeded" }, config)).toBe(true);
      expect(isRetryableError({ message: "Too many requests" }, config)).toBe(true);
    });

    it("should identify network errors", () => {
      expect(isRetryableError({ code: "ECONNRESET" }, config)).toBe(true);
      expect(isRetryableError({ code: "ETIMEDOUT" }, config)).toBe(true);
      expect(isRetryableError({ code: "ENOTFOUND" }, config)).toBe(true);
    });

    it("should identify Resend errors", () => {
      expect(isRetryableError({ name: "ResendError", statusCode: 429 }, config)).toBe(true);
    });
  });

  describe("getRetryErrorType", () => {
    it("should classify rate limit errors", () => {
      expect(getRetryErrorType({ statusCode: 429 })).toBe(RetryableErrorType.RATE_LIMIT);
      expect(getRetryErrorType({ message: "Rate limit exceeded" })).toBe(
        RetryableErrorType.RATE_LIMIT,
      );
    });

    it("should classify timeout errors", () => {
      expect(getRetryErrorType({ code: "ETIMEDOUT" })).toBe(RetryableErrorType.TIMEOUT);
    });

    it("should classify network errors", () => {
      expect(getRetryErrorType({ code: "ECONNRESET" })).toBe(RetryableErrorType.NETWORK);
      expect(getRetryErrorType({ code: "ENOTFOUND" })).toBe(RetryableErrorType.NETWORK);
    });

    it("should classify server errors", () => {
      expect(getRetryErrorType({ statusCode: 500 })).toBe(RetryableErrorType.SERVER_ERROR);
      expect(getRetryErrorType({ statusCode: 503 })).toBe(RetryableErrorType.SERVER_ERROR);
    });

    it("should default to temporary error", () => {
      expect(getRetryErrorType({ message: "Unknown error" })).toBe(RetryableErrorType.TEMPORARY);
    });
  });

  describe("calculateBackoffDelay", () => {
    const config = createDefaultRetryConfig();

    it("should calculate exponential backoff", () => {
      // Attempt 0: 1000ms
      expect(calculateBackoffDelay(0, config)).toBeGreaterThanOrEqual(1000);
      expect(calculateBackoffDelay(0, config)).toBeLessThanOrEqual(1200);

      // Attempt 1: 2000ms
      expect(calculateBackoffDelay(1, config)).toBeGreaterThanOrEqual(2000);
      expect(calculateBackoffDelay(1, config)).toBeLessThanOrEqual(2400);

      // Attempt 2: 4000ms
      expect(calculateBackoffDelay(2, config)).toBeGreaterThanOrEqual(4000);
      expect(calculateBackoffDelay(2, config)).toBeLessThanOrEqual(4800);
    });

    it("should cap at maxDelay", () => {
      const delay = calculateBackoffDelay(10, config);
      expect(delay).toBeLessThanOrEqual(config.maxDelay * 1.2); // Max + jitter
    });

    it("should add jitter to prevent thundering herd", () => {
      const delays = Array.from({ length: 10 }, () => calculateBackoffDelay(0, config));

      // All delays should be different due to jitter
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe("retryWithBackoff", () => {
    it("should succeed on first attempt", async () => {
      const fn = vi.fn().mockResolvedValue("success");
      const config = createDefaultRetryConfig();

      const result = await retryWithBackoff(fn, config);

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry on retryable error", async () => {
      const fn = vi.fn().mockRejectedValueOnce({ statusCode: 500 }).mockResolvedValue("success");

      const config = {
        ...createDefaultRetryConfig(),
        initialDelay: 10, // Speed up test
      };

      const result = await retryWithBackoff(fn, config);

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should retry multiple times", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce({ statusCode: 500 })
        .mockRejectedValueOnce({ statusCode: 502 })
        .mockResolvedValue("success");

      const config = {
        ...createDefaultRetryConfig(),
        initialDelay: 10,
      };

      const result = await retryWithBackoff(fn, config);

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("should throw after max retries", async () => {
      const error = { statusCode: 500, message: "Server error" };
      const fn = vi.fn().mockRejectedValue(error);

      const config = {
        ...createDefaultRetryConfig(),
        maxRetries: 2,
        initialDelay: 10,
      };

      await expect(retryWithBackoff(fn, config)).rejects.toEqual(error);
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it("should not retry non-retryable errors", async () => {
      const error = { statusCode: 400, message: "Bad request" };
      const fn = vi.fn().mockRejectedValue(error);

      const config = createDefaultRetryConfig();

      await expect(retryWithBackoff(fn, config)).rejects.toEqual(error);
      expect(fn).toHaveBeenCalledTimes(1); // No retries
    });

    it("should respect exponential backoff timing", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce({ statusCode: 500 })
        .mockRejectedValueOnce({ statusCode: 500 })
        .mockResolvedValue("success");

      const config = {
        maxRetries: 3,
        initialDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        retryableStatusCodes: [500],
      };

      const startTime = Date.now();
      await retryWithBackoff(fn, config);
      const duration = Date.now() - startTime;

      // Should wait at least: 100ms + 200ms = 300ms
      expect(duration).toBeGreaterThanOrEqual(250);
    });
  });

  describe("createDefaultRetryConfig", () => {
    it("should return default configuration", () => {
      const config = createDefaultRetryConfig();

      expect(config).toEqual({
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        retryableStatusCodes: [429, 500, 502, 503, 504],
      });
    });
  });
});
