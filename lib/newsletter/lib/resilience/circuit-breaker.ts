/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by failing fast when a service is down.
 * Implements three states: CLOSED, OPEN, HALF_OPEN
 *
 * State Transitions:
 * - CLOSED: Normal operation, all requests pass through
 *   → Failures >= threshold → OPEN
 *
 * - OPEN: Circuit tripped, all requests fail immediately
 *   → After timeout → HALF_OPEN
 *
 * - HALF_OPEN: Testing recovery with limited requests
 *   → Success >= threshold → CLOSED
 *   → Any failure → OPEN
 */

import { logger } from "../logger";
import {
  CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  CIRCUIT_BREAKER_SUCCESS_THRESHOLD,
  CIRCUIT_BREAKER_TIMEOUT_MS,
} from "@/lib/constants";

export enum CircuitState {
  CLOSED = "closed",
  OPEN = "open",
  HALF_OPEN = "half_open",
}

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit */
  failureThreshold: number;
  /** Number of consecutive successes in half-open to close circuit */
  successThreshold: number;
  /** Timeout in milliseconds before attempting half-open */
  timeout: number;
  /** Name for logging and identification */
  name: string;
  /** Optional callback when state changes */
  onStateChange?: (state: CircuitState, metadata?: CircuitMetadata) => void;
  /** Optional error filter - only count matching errors as failures */
  isErrorRetryable?: (error: Error) => boolean;
}

export interface CircuitMetadata {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  nextAttemptTime?: number;
  totalFailures: number;
  totalSuccesses: number;
  totalRejections: number;
}

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly circuitName: string,
    public readonly state: CircuitState,
    public readonly nextAttemptTime?: number,
  ) {
    super(message);
    this.name = "CircuitBreakerError";
  }
}

/**
 * Circuit Breaker Implementation
 *
 * Usage:
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 3,
 *   successThreshold: 2,
 *   timeout: 30000,
 *   name: 'reddit-api',
 *   onStateChange: (state) => console.log(`Circuit ${state}`)
 * });
 *
 * const result = await breaker.execute(async () => {
 *   return await fetchFromAPI();
 * });
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttempt: number = Date.now();
  private lastFailureTime?: number;
  private lastSuccessTime?: number;

  // Lifetime statistics
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;
  private totalRejections: number = 0;

  constructor(private config: CircuitBreakerConfig) {
    // Validate configuration
    if (config.failureThreshold < 1) {
      throw new Error("failureThreshold must be >= 1");
    }
    if (config.successThreshold < 1) {
      throw new Error("successThreshold must be >= 1");
    }
    if (config.timeout < 0) {
      throw new Error("timeout must be >= 0");
    }

    logger.info(
      {
        name: config.name,
        failureThreshold: config.failureThreshold,
        successThreshold: config.successThreshold,
        timeout: config.timeout,
      },
      "Circuit breaker initialized",
    );
  }

  /**
   * Execute a function with circuit breaker protection
   *
   * @param fn Function to execute
   * @returns Result of the function
   * @throws CircuitBreakerError if circuit is open
   * @throws Original error if function fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      const now = Date.now();

      if (now < this.nextAttempt) {
        // Circuit is still open, fail fast
        this.totalRejections++;
        const waitTime = Math.ceil((this.nextAttempt - now) / 1000);

        logger.debug(
          {
            circuit: this.config.name,
            state: this.state,
            waitTime,
          },
          "Circuit breaker rejecting request (OPEN)",
        );

        throw new CircuitBreakerError(
          `Circuit breaker '${this.config.name}' is OPEN. Retry in ${waitTime}s`,
          this.config.name,
          this.state,
          this.nextAttempt,
        );
      }

      // Timeout has elapsed, transition to half-open
      this.transitionTo(CircuitState.HALF_OPEN);
    }

    // Execute the function
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0;
    this.lastSuccessTime = Date.now();
    this.totalSuccesses++;

    logger.debug(
      {
        circuit: this.config.name,
        state: this.state,
        successCount: this.successCount + 1,
      },
      "Circuit breaker request succeeded",
    );

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      // Check if we have enough successes to close the circuit
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.successCount = 0;
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset success count in closed state
      this.successCount = 0;
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: Error): void {
    // Check if error should be counted as a failure
    if (this.config.isErrorRetryable && !this.config.isErrorRetryable(error)) {
      logger.debug(
        {
          circuit: this.config.name,
          error: error.message,
        },
        "Error not counted as failure (non-retryable)",
      );
      return;
    }

    this.failureCount++;
    this.successCount = 0;
    this.lastFailureTime = Date.now();
    this.totalFailures++;

    logger.debug(
      {
        circuit: this.config.name,
        state: this.state,
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold,
        error: error.message,
      },
      "Circuit breaker request failed",
    );

    // Check if we should open the circuit
    if (this.state === CircuitState.CLOSED && this.failureCount >= this.config.failureThreshold) {
      this.openCircuit();
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state reopens the circuit
      this.openCircuit();
    }
  }

  /**
   * Open the circuit
   */
  private openCircuit(): void {
    this.nextAttempt = Date.now() + this.config.timeout;
    this.transitionTo(CircuitState.OPEN);
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;

    if (oldState === newState) {
      return;
    }

    this.state = newState;

    const metadata = this.getMetadata();

    logger.info(
      {
        circuit: this.config.name,
        oldState,
        newState,
        failureCount: this.failureCount,
        successCount: this.successCount,
        nextAttempt: newState === CircuitState.OPEN ? this.nextAttempt : undefined,
      },
      `Circuit breaker state transition: ${oldState} → ${newState}`,
    );

    // Invoke state change callback if provided
    this.config.onStateChange?.(newState, metadata);
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit metadata for monitoring
   */
  getMetadata(): CircuitMetadata {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime: this.state === CircuitState.OPEN ? this.nextAttempt : undefined,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      totalRejections: this.totalRejections,
    };
  }

  /**
   * Check if circuit is available for requests
   */
  isAvailable(): boolean {
    if (this.state === CircuitState.CLOSED || this.state === CircuitState.HALF_OPEN) {
      return true;
    }

    // Check if timeout has elapsed
    return Date.now() >= this.nextAttempt;
  }

  /**
   * Reset circuit to initial state
   * Useful for testing or manual recovery
   */
  reset(): void {
    const oldState = this.state;

    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();

    logger.info(
      {
        circuit: this.config.name,
        oldState,
      },
      "Circuit breaker manually reset",
    );
  }

  /**
   * Force circuit to open state
   * Useful for maintenance or manual intervention
   */
  forceOpen(timeoutMs?: number): void {
    this.nextAttempt = Date.now() + (timeoutMs ?? this.config.timeout);
    this.transitionTo(CircuitState.OPEN);

    logger.warn(
      {
        circuit: this.config.name,
        timeout: timeoutMs ?? this.config.timeout,
      },
      "Circuit breaker forced open",
    );
  }

  /**
   * Force circuit to closed state
   * Use with caution - only when you're sure the service is healthy
   */
  forceClose(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.transitionTo(CircuitState.CLOSED);

    logger.warn(
      {
        circuit: this.config.name,
      },
      "Circuit breaker forced closed",
    );
  }
}

/**
 * Create a circuit breaker with default configuration
 */
export function createCircuitBreaker(
  name: string,
  options?: Partial<CircuitBreakerConfig>,
): CircuitBreaker {
  return new CircuitBreaker({
    name,
    failureThreshold: options?.failureThreshold ?? CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    successThreshold: options?.successThreshold ?? CIRCUIT_BREAKER_SUCCESS_THRESHOLD,
    timeout: options?.timeout ?? CIRCUIT_BREAKER_TIMEOUT_MS,
    onStateChange: options?.onStateChange,
    isErrorRetryable: options?.isErrorRetryable,
  });
}
