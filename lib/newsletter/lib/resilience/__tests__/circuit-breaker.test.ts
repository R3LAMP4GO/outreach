/**
 * Circuit Breaker Tests
 *
 * Tests for circuit breaker state transitions, failure thresholds,
 * recovery timeouts, and edge cases.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  CircuitBreaker,
  CircuitState,
  CircuitBreakerError,
  createCircuitBreaker,
} from "../circuit-breaker";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("Initialization", () => {
    it("should initialize in CLOSED state", () => {
      const breaker = createCircuitBreaker("test");
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it("should throw on invalid configuration", () => {
      expect(() => {
        new CircuitBreaker({
          name: "test",
          failureThreshold: 0,
          successThreshold: 2,
          timeout: 30000,
        });
      }).toThrow("failureThreshold must be >= 1");

      expect(() => {
        new CircuitBreaker({
          name: "test",
          failureThreshold: 3,
          successThreshold: 0,
          timeout: 30000,
        });
      }).toThrow("successThreshold must be >= 1");

      expect(() => {
        new CircuitBreaker({
          name: "test",
          failureThreshold: 3,
          successThreshold: 2,
          timeout: -1,
        });
      }).toThrow("timeout must be >= 0");
    });

    it("should accept valid configuration", () => {
      const breaker = new CircuitBreaker({
        name: "test",
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 60000,
      });

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.isAvailable()).toBe(true);
    });
  });

  describe("CLOSED State", () => {
    it("should execute function successfully", async () => {
      const breaker = createCircuitBreaker("test");
      const mockFn = vi.fn().mockResolvedValue("success");

      const result = await breaker.execute(mockFn);

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it("should stay CLOSED on single failure", async () => {
      const breaker = createCircuitBreaker("test", { failureThreshold: 3 });
      const mockFn = vi.fn().mockRejectedValue(new Error("Failed"));

      await expect(breaker.execute(mockFn)).rejects.toThrow("Failed");
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it("should transition to OPEN after failure threshold", async () => {
      const breaker = createCircuitBreaker("test", { failureThreshold: 3 });
      const mockFn = vi.fn().mockRejectedValue(new Error("Failed"));

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow("Failed");
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it("should reset failure count on success", async () => {
      const breaker = createCircuitBreaker("test", { failureThreshold: 3 });

      // Fail twice
      const failFn = vi.fn().mockRejectedValue(new Error("Failed"));
      await expect(breaker.execute(failFn)).rejects.toThrow("Failed");
      await expect(breaker.execute(failFn)).rejects.toThrow("Failed");

      // Succeed
      const successFn = vi.fn().mockResolvedValue("success");
      await breaker.execute(successFn);

      // Should still be closed
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // Fail 2 more times (should not open, count was reset)
      await expect(breaker.execute(failFn)).rejects.toThrow("Failed");
      await expect(breaker.execute(failFn)).rejects.toThrow("Failed");

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe("OPEN State", () => {
    it("should reject requests immediately when OPEN", async () => {
      const breaker = createCircuitBreaker("test", {
        failureThreshold: 2,
        timeout: 30000,
      });
      const mockFn = vi.fn().mockRejectedValue(new Error("Failed"));

      // Trigger circuit to open
      await expect(breaker.execute(mockFn)).rejects.toThrow("Failed");
      await expect(breaker.execute(mockFn)).rejects.toThrow("Failed");

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Next request should fail fast
      const fastFn = vi.fn().mockResolvedValue("success");
      await expect(breaker.execute(fastFn)).rejects.toThrow(CircuitBreakerError);

      // Function should not have been called
      expect(fastFn).not.toHaveBeenCalled();
    });

    it("should include circuit name and state in error", async () => {
      const breaker = createCircuitBreaker("my-api", {
        failureThreshold: 1,
        timeout: 30000,
      });
      const mockFn = vi.fn().mockRejectedValue(new Error("Failed"));

      // Open the circuit
      await expect(breaker.execute(mockFn)).rejects.toThrow("Failed");

      // Next request should throw CircuitBreakerError
      try {
        await breaker.execute(vi.fn());
        throw new Error("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerError);
        const cbError = error as CircuitBreakerError;
        expect(cbError.circuitName).toBe("my-api");
        expect(cbError.state).toBe(CircuitState.OPEN);
        expect(cbError.message).toContain("my-api");
        expect(cbError.message).toContain("OPEN");
      }
    });

    it("should transition to HALF_OPEN after timeout", async () => {
      const breaker = createCircuitBreaker("test", {
        failureThreshold: 1,
        timeout: 30000,
      });
      const mockFn = vi.fn().mockRejectedValue(new Error("Failed"));

      // Open the circuit
      await expect(breaker.execute(mockFn)).rejects.toThrow("Failed");
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Advance time past timeout
      vi.advanceTimersByTime(30000);

      // Next request should transition to HALF_OPEN
      const successFn = vi.fn().mockResolvedValue("success");
      await breaker.execute(successFn);

      expect(successFn).toHaveBeenCalled();
    });

    it("should track rejection count", async () => {
      const breaker = createCircuitBreaker("test", {
        failureThreshold: 1,
        timeout: 30000,
      });

      // Open the circuit
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new Error("Failed"))),
      ).rejects.toThrow();

      // Try multiple requests
      for (let i = 0; i < 5; i++) {
        await expect(breaker.execute(vi.fn())).rejects.toThrow(CircuitBreakerError);
      }

      const metadata = breaker.getMetadata();
      expect(metadata.totalRejections).toBe(5);
    });
  });

  describe("HALF_OPEN State", () => {
    it("should allow test request in HALF_OPEN", async () => {
      const breaker = createCircuitBreaker("test", {
        failureThreshold: 1,
        successThreshold: 2,
        timeout: 30000,
      });

      // Open the circuit
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new Error("Failed"))),
      ).rejects.toThrow();

      // Wait for timeout
      vi.advanceTimersByTime(30000);

      // Execute a request (should transition to HALF_OPEN)
      const mockFn = vi.fn().mockResolvedValue("success");
      await breaker.execute(mockFn);

      expect(mockFn).toHaveBeenCalled();
    });

    it("should transition to CLOSED after success threshold", async () => {
      const breaker = createCircuitBreaker("test", {
        failureThreshold: 1,
        successThreshold: 2,
        timeout: 30000,
      });

      // Open the circuit
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new Error("Failed"))),
      ).rejects.toThrow();

      // Wait for timeout
      vi.advanceTimersByTime(30000);

      // Execute 2 successful requests (success threshold)
      const successFn = vi.fn().mockResolvedValue("success");
      await breaker.execute(successFn);
      await breaker.execute(successFn);

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it("should transition back to OPEN on failure", async () => {
      const breaker = createCircuitBreaker("test", {
        failureThreshold: 1,
        successThreshold: 2,
        timeout: 30000,
      });

      // Open the circuit
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new Error("Failed"))),
      ).rejects.toThrow();

      // Wait for timeout
      vi.advanceTimersByTime(30000);

      // Execute a successful request
      await breaker.execute(vi.fn().mockResolvedValue("success"));

      // Now fail
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new Error("Failed again"))),
      ).rejects.toThrow("Failed again");

      // Should be back to OPEN
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe("State Change Callbacks", () => {
    it("should invoke callback on state change", async () => {
      const onStateChange = vi.fn();
      const breaker = createCircuitBreaker("test", {
        failureThreshold: 2,
        timeout: 30000,
        onStateChange,
      });

      // Trigger CLOSED -> OPEN
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new Error("Failed"))),
      ).rejects.toThrow();
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new Error("Failed"))),
      ).rejects.toThrow();

      expect(onStateChange).toHaveBeenCalledWith(CircuitState.OPEN, expect.any(Object));
    });

    it("should not invoke callback when state does not change", async () => {
      const onStateChange = vi.fn();
      const breaker = createCircuitBreaker("test", {
        failureThreshold: 3,
        onStateChange,
      });

      // Fail once (stay in CLOSED)
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new Error("Failed"))),
      ).rejects.toThrow();

      expect(onStateChange).not.toHaveBeenCalled();
    });
  });

  describe("Error Filtering", () => {
    it("should only count retryable errors as failures", async () => {
      class RetryableError extends Error {}
      class NonRetryableError extends Error {}

      const breaker = createCircuitBreaker("test", {
        failureThreshold: 2,
        isErrorRetryable: (error) => error instanceof RetryableError,
      });

      // Non-retryable errors should not count
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new NonRetryableError("Skip"))),
      ).rejects.toThrow();
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new NonRetryableError("Skip"))),
      ).rejects.toThrow();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // Retryable errors should count
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new RetryableError("Count"))),
      ).rejects.toThrow();
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new RetryableError("Count"))),
      ).rejects.toThrow();

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe("Metadata", () => {
    it("should track metadata correctly", async () => {
      const breaker = createCircuitBreaker("test", {
        failureThreshold: 2,
        successThreshold: 1,
        timeout: 30000,
      });

      // Execute some operations
      await breaker.execute(vi.fn().mockResolvedValue("success"));
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new Error("Failed"))),
      ).rejects.toThrow();

      const metadata = breaker.getMetadata();

      expect(metadata.state).toBe(CircuitState.CLOSED);
      expect(metadata.totalSuccesses).toBe(1);
      expect(metadata.totalFailures).toBe(1);
      expect(metadata.failureCount).toBe(1);
      expect(metadata.lastSuccessTime).toBeDefined();
      expect(metadata.lastFailureTime).toBeDefined();
    });

    it("should include next attempt time when OPEN", async () => {
      const breaker = createCircuitBreaker("test", {
        failureThreshold: 1,
        timeout: 30000,
      });

      // Open the circuit
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new Error("Failed"))),
      ).rejects.toThrow();

      const metadata = breaker.getMetadata();

      expect(metadata.state).toBe(CircuitState.OPEN);
      expect(metadata.nextAttemptTime).toBeDefined();
      expect(metadata.nextAttemptTime).toBeGreaterThan(Date.now());
    });
  });

  describe("Manual Control", () => {
    it("should reset circuit to initial state", async () => {
      const breaker = createCircuitBreaker("test", { failureThreshold: 1 });

      // Open the circuit
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new Error("Failed"))),
      ).rejects.toThrow();

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Reset
      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.isAvailable()).toBe(true);

      const metadata = breaker.getMetadata();
      expect(metadata.failureCount).toBe(0);
      expect(metadata.successCount).toBe(0);
    });

    it("should force open", async () => {
      const breaker = createCircuitBreaker("test");

      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      breaker.forceOpen(60000);

      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(breaker.isAvailable()).toBe(false);
    });

    it("should force close", async () => {
      const breaker = createCircuitBreaker("test", { failureThreshold: 1 });

      // Open the circuit
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new Error("Failed"))),
      ).rejects.toThrow();

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Force close
      breaker.forceClose();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.isAvailable()).toBe(true);
    });
  });

  describe("Availability Check", () => {
    it("should be available in CLOSED state", () => {
      const breaker = createCircuitBreaker("test");
      expect(breaker.isAvailable()).toBe(true);
    });

    it("should be available in HALF_OPEN state", async () => {
      const breaker = createCircuitBreaker("test", {
        failureThreshold: 1,
        timeout: 30000,
      });

      // Open the circuit
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new Error("Failed"))),
      ).rejects.toThrow();

      // Wait for timeout
      vi.advanceTimersByTime(30000);

      // Should be available (will transition to HALF_OPEN on next request)
      expect(breaker.isAvailable()).toBe(true);
    });

    it("should not be available when OPEN and timeout not elapsed", async () => {
      const breaker = createCircuitBreaker("test", {
        failureThreshold: 1,
        timeout: 30000,
      });

      // Open the circuit
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new Error("Failed"))),
      ).rejects.toThrow();

      expect(breaker.isAvailable()).toBe(false);

      // Advance time partially
      vi.advanceTimersByTime(15000);

      expect(breaker.isAvailable()).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle synchronous errors", async () => {
      const breaker = createCircuitBreaker("test", { failureThreshold: 1 });

      await expect(
        breaker.execute(() => {
          throw new Error("Sync error");
        }),
      ).rejects.toThrow("Sync error");

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it("should handle rapid concurrent requests", async () => {
      const breaker = createCircuitBreaker("test", {
        failureThreshold: 3,
        timeout: 30000,
      });

      // Execute multiple requests concurrently
      const promises = Array.from({ length: 5 }, () =>
        breaker.execute(vi.fn().mockResolvedValue("success")),
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(results.every((r) => r === "success")).toBe(true);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it("should handle zero timeout", async () => {
      const breaker = createCircuitBreaker("test", {
        failureThreshold: 1,
        timeout: 0, // Immediate recovery
      });

      // Open the circuit
      await expect(
        breaker.execute(vi.fn().mockRejectedValue(new Error("Failed"))),
      ).rejects.toThrow();

      // Should immediately be available
      expect(breaker.isAvailable()).toBe(true);
    });
  });
});
