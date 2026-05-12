// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — partial Supabase mocks cause type mismatches
/**
 * Retry Tests
 *
 * Tests for exponential backoff, jitter, error filtering,
 * and retry logic edge cases.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  retryWithBackoff,
  RetryError,
  RetryPresets,
  createRetryFunction,
  retryWithTimeout,
  sleep,
} from "../retry";

describe("retryWithBackoff", () => {
  beforeEach(() => {
    // Mock sleep to avoid actual delays in tests
    vi.spyOn(global, "setTimeout").mockImplementation(((callback: () => void) => {
      // Execute immediately
      callback();
      return {} as NodeJS.Timeout;
    }) as unknown);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Basic Retry Logic", () => {
    it("should succeed on first attempt", async () => {
      const mockFn = vi.fn().mockResolvedValue("success");

      const result = await retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitter: false,
      });

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("should retry on failure", async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error("Fail 1"))
        .mockRejectedValueOnce(new Error("Fail 2"))
        .mockResolvedValue("success");

      const result = await retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitter: false,
      });

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it("should throw RetryError after all attempts fail", async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error("Always fails"));

      await expect(
        retryWithBackoff(mockFn, {
          maxAttempts: 2, // 3 total attempts
          initialDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2,
          jitter: false,
        }),
      ).rejects.toThrow(RetryError);

      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it("should include metadata in RetryError", async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error("Failed"));

      try {
        await retryWithBackoff(mockFn, {
          maxAttempts: 2,
          initialDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2,
          jitter: false,
        });
        throw new Error("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(RetryError);
        const retryError = error as RetryError;
        expect(retryError.attempts).toBe(3);
        expect(retryError.lastError.message).toBe("Failed");
        expect(retryError.metadata).toHaveLength(2); // 2 retries (not counting initial)
      }
    });
  });

  describe("Exponential Backoff", () => {
    it("should use exponential backoff delays", async () => {
      const delays: number[] = [];
      vi.spyOn(global, "setTimeout").mockImplementation(((callback: () => void, delay: number) => {
        delays.push(delay);
        callback();
        return {} as NodeJS.Timeout;
      }) as unknown);

      const mockFn = vi.fn().mockRejectedValue(new Error("Failed"));

      try {
        await retryWithBackoff(mockFn, {
          maxAttempts: 3,
          initialDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2,
          jitter: false,
        });
      } catch {
        // Expected to fail
      }

      expect(mockFn).toHaveBeenCalledTimes(4);
      // Check exponential delays: 1000, 2000, 4000
      expect(delays).toEqual([1000, 2000, 4000]);
    });

    it("should cap delay at maxDelay", async () => {
      const delays: number[] = [];
      vi.spyOn(global, "setTimeout").mockImplementation(((callback: () => void, delay: number) => {
        delays.push(delay);
        callback();
        return {} as NodeJS.Timeout;
      }) as unknown);

      const mockFn = vi.fn().mockRejectedValue(new Error("Failed"));

      try {
        await retryWithBackoff(mockFn, {
          maxAttempts: 5,
          initialDelay: 1000,
          maxDelay: 5000, // Cap at 5 seconds
          backoffMultiplier: 2,
          jitter: false,
        });
      } catch {
        // Expected to fail
      }

      expect(mockFn).toHaveBeenCalledTimes(6);
      // Delays: 1000, 2000, 4000, 5000 (capped), 5000 (capped)
      expect(delays).toEqual([1000, 2000, 4000, 5000, 5000]);
    });

    it("should use custom backoff multiplier", async () => {
      const delays: number[] = [];
      vi.spyOn(global, "setTimeout").mockImplementation(((callback: () => void, delay: number) => {
        delays.push(delay);
        callback();
        return {} as NodeJS.Timeout;
      }) as unknown);

      const mockFn = vi.fn().mockRejectedValue(new Error("Failed"));

      try {
        await retryWithBackoff(mockFn, {
          maxAttempts: 3,
          initialDelay: 100,
          maxDelay: 10000,
          backoffMultiplier: 3, // Triple each time
          jitter: false,
        });
      } catch {
        // Expected to fail
      }

      expect(mockFn).toHaveBeenCalledTimes(4);
      // Delays: 100, 300, 900
      expect(delays).toEqual([100, 300, 900]);
    });
  });

  describe("Jitter", () => {
    it("should add jitter when enabled", async () => {
      const delays: number[] = [];
      vi.spyOn(global, "setTimeout").mockImplementation(((callback: () => void, delay: number) => {
        delays.push(delay);
        callback();
        return {} as NodeJS.Timeout;
      }) as unknown);

      const mockFn = vi.fn().mockRejectedValue(new Error("Failed"));

      try {
        await retryWithBackoff(mockFn, {
          maxAttempts: 2,
          initialDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2,
          jitter: true,
        });
      } catch {
        // Expected to fail
      }

      // With jitter, delays should vary (0-50% added)
      expect(delays.length).toBe(2);
      // Check that delays are not exactly the base values
      const hasJitter = delays.some((delay, index) => {
        const baseDelay = 1000 * Math.pow(2, index);
        return delay > baseDelay && delay <= baseDelay * 1.5;
      });
      expect(hasJitter).toBe(true);
    });

    it("should not add jitter when disabled", async () => {
      const delays: number[] = [];
      vi.spyOn(global, "setTimeout").mockImplementation(((callback: () => void, delay: number) => {
        delays.push(delay);
        callback();
        return {} as NodeJS.Timeout;
      }) as unknown);

      const mockFn = vi.fn().mockRejectedValue(new Error("Failed"));

      try {
        await retryWithBackoff(mockFn, {
          maxAttempts: 2,
          initialDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2,
          jitter: false,
        });
      } catch {
        // Expected to fail
      }

      // Without jitter, delays should be exact
      expect(delays).toEqual([1000, 2000]);
    });
  });

  describe("Error Filtering", () => {
    it("should only retry specific error types", async () => {
      class FatalError extends Error {}

      const mockFn = vi.fn().mockRejectedValue(new FatalError("Fatal"));

      await expect(
        retryWithBackoff(mockFn, {
          maxAttempts: 3,
          initialDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2,
          jitter: false,
          retryableErrors: ["RetryableError"],
        }),
      ).rejects.toThrow("Fatal");

      // Should not retry non-retryable errors
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("should retry matching error types", async () => {
      class NetworkError extends Error {}

      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new NetworkError("Network issue"))
        .mockResolvedValue("success");

      const result = await retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitter: false,
        retryableErrors: ["NetworkError"],
      });

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it("should use custom isRetryable function", async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error("500 Server Error"))
        .mockRejectedValueOnce(new Error("404 Not Found"))
        .mockResolvedValue("success");

      const isRetryable = (error: Error) => {
        // Only retry 5xx errors
        return error.message.includes("500");
      };

      await expect(
        retryWithBackoff(mockFn, {
          maxAttempts: 3,
          initialDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2,
          jitter: false,
          isRetryable,
        }),
      ).rejects.toThrow("404 Not Found");

      // Should fail on 404 (not retryable)
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it("should retry all errors when no filter specified", async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error("Error 1"))
        .mockResolvedValue("success");

      const result = await retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitter: false,
      });

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe("Callbacks", () => {
    it("should invoke onRetry callback", async () => {
      const onRetry = vi.fn();
      const mockFn = vi.fn().mockRejectedValue(new Error("Failed"));

      try {
        await retryWithBackoff(mockFn, {
          maxAttempts: 2,
          initialDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2,
          jitter: false,
          onRetry,
        });
      } catch {
        // Expected to fail
      }

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), 1000);
      expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error), 2000);
    });
  });

  describe("Presets", () => {
    it("should use FAST preset", () => {
      expect(RetryPresets.FAST).toEqual({
        maxAttempts: 3,
        initialDelay: 500,
        maxDelay: 5000,
        backoffMultiplier: 2,
        jitter: true,
      });
    });

    it("should use STANDARD preset", () => {
      expect(RetryPresets.STANDARD).toEqual({
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitter: true,
      });
    });

    it("should use SLOW preset", () => {
      expect(RetryPresets.SLOW).toEqual({
        maxAttempts: 5,
        initialDelay: 2000,
        maxDelay: 60000,
        backoffMultiplier: 2,
        jitter: true,
      });
    });

    it("should use AGGRESSIVE preset", () => {
      expect(RetryPresets.AGGRESSIVE).toEqual({
        maxAttempts: 7,
        initialDelay: 1000,
        maxDelay: 120000,
        backoffMultiplier: 2,
        jitter: true,
      });
    });
  });

  describe("Helpers", () => {
    it("should create retry function with preset config", async () => {
      const retryFn = createRetryFunction({
        maxAttempts: 2,
        initialDelay: 500,
        maxDelay: 10000,
        backoffMultiplier: 2,
        jitter: false,
      });

      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error("Failed"))
        .mockResolvedValue("success");

      const result = await retryFn(mockFn);
      expect(result).toBe("success");
    });

    it("should sleep for specified duration", async () => {
      vi.restoreAllMocks(); // Use real timers for this test

      const startTime = Date.now();
      await sleep(50); // Short delay for test
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some margin
      expect(elapsed).toBeLessThan(200); // Should not take too long

      // Restore mock
      vi.spyOn(global, "setTimeout").mockImplementation(((callback: () => void) => {
        callback();
        return {} as NodeJS.Timeout;
      }) as unknown);
    });
  });

  describe("retryWithTimeout", () => {
    it("should succeed before timeout", async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error("Failed"))
        .mockResolvedValue("success");

      // Mock setTimeout to track both delay and timeout calls
      const timeouts: { callback: () => void; delay: number }[] = [];
      vi.spyOn(global, "setTimeout").mockImplementation(((callback: () => void, delay: number) => {
        timeouts.push({ callback, delay });
        // Execute delay callbacks immediately (for retry logic)
        // But don't execute timeout callback (for timeout logic)
        if (delay < 10000) {
          callback();
        }
        return {} as NodeJS.Timeout;
      }) as unknown);

      const result = await retryWithTimeout(
        mockFn,
        {
          maxAttempts: 3,
          initialDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2,
          jitter: false,
        },
        10000, // 10 second timeout
      );

      expect(result).toBe("success");
    });

    it("should timeout before all retries complete", async () => {
      vi.restoreAllMocks(); // Use real timers for timeout test

      const mockFn = vi.fn().mockRejectedValue(new Error("Failed"));

      // Use very short timeouts for testing
      await expect(
        retryWithTimeout(
          mockFn,
          {
            maxAttempts: 10,
            initialDelay: 100,
            maxDelay: 200,
            backoffMultiplier: 2,
            jitter: false,
          },
          50, // Very short timeout (50ms)
        ),
      ).rejects.toThrow("Operation timeout after 50ms");

      // Restore mock
      vi.spyOn(global, "setTimeout").mockImplementation(((callback: () => void) => {
        callback();
        return {} as NodeJS.Timeout;
      }) as unknown);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero attempts", async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error("Failed"));

      await expect(
        retryWithBackoff(mockFn, {
          maxAttempts: 0, // Only initial attempt
          initialDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2,
          jitter: false,
        }),
      ).rejects.toThrow(RetryError);

      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("should handle single attempt", async () => {
      const mockFn = vi.fn().mockResolvedValue("success");

      const result = await retryWithBackoff(mockFn, {
        maxAttempts: 0,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitter: false,
      });

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("should handle very long delays", async () => {
      const delays: number[] = [];
      vi.spyOn(global, "setTimeout").mockImplementation(((callback: () => void, delay: number) => {
        delays.push(delay);
        callback();
        return {} as NodeJS.Timeout;
      }) as unknown);

      const mockFn = vi.fn().mockRejectedValue(new Error("Failed"));

      try {
        await retryWithBackoff(mockFn, {
          maxAttempts: 2,
          initialDelay: 100000,
          maxDelay: 1000000,
          backoffMultiplier: 2,
          jitter: false,
        });
      } catch {
        // Expected to fail
      }

      expect(delays).toEqual([100000, 200000]);
    });

    it("should handle rapid success", async () => {
      const mockFn = vi.fn().mockResolvedValue("instant success");

      const result = await retryWithBackoff(mockFn, {
        maxAttempts: 10,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitter: false,
      });

      expect(result).toBe("instant success");
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });
});
