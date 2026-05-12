/**
 * Retry with Exponential Backoff
 *
 * Implements retry logic with configurable backoff strategies.
 * Prevents thundering herd with jitter.
 */

import { logger } from "../logger";
import {
  RETRY_DEFAULT_MAX_ATTEMPTS,
  RETRY_DEFAULT_INITIAL_DELAY_MS,
  RETRY_DEFAULT_MAX_DELAY_MS,
  RETRY_DEFAULT_BACKOFF_MULTIPLIER,
  RETRY_FAST_MAX_ATTEMPTS,
  RETRY_FAST_INITIAL_DELAY_MS,
  RETRY_FAST_MAX_DELAY_MS,
  RETRY_SLOW_MAX_ATTEMPTS,
  RETRY_SLOW_INITIAL_DELAY_MS,
  RETRY_SLOW_MAX_DELAY_MS,
  RETRY_AGGRESSIVE_MAX_ATTEMPTS,
  RETRY_AGGRESSIVE_INITIAL_DELAY_MS,
  RETRY_AGGRESSIVE_MAX_DELAY_MS,
  CIRCUIT_BREAKER_JITTER_PERCENTAGE,
} from "@/lib/constants";

export interface RetryConfig {
  /** Maximum number of retry attempts (excluding initial attempt) */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelay: number;
  /** Maximum delay in milliseconds */
  maxDelay: number;
  /** Backoff multiplier (2 = exponential backoff) */
  backoffMultiplier: number;
  /** Add random jitter to prevent thundering herd */
  jitter: boolean;
  /** Only retry specific error types/messages */
  retryableErrors?: string[];
  /** Custom function to determine if error is retryable */
  isRetryable?: (error: Error) => boolean;
  /** Name for logging */
  name?: string;
  /** Callback invoked on each retry attempt */
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

export interface RetryMetadata {
  attempt: number;
  maxAttempts: number;
  delay: number;
  error: Error;
  elapsedTime: number;
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error,
    public readonly metadata: RetryMetadata[],
  ) {
    super(message);
    this.name = "RetryError";
  }
}

/**
 * Retry a function with exponential backoff
 *
 * Usage:
 * ```typescript
 * const result = await retryWithBackoff(
 *   async () => await fetchFromAPI(),
 *   {
 *     maxAttempts: 3,
 *     initialDelay: 1000,
 *     maxDelay: 30000,
 *     backoffMultiplier: 2,
 *     jitter: true,
 *   }
 * );
 * ```
 *
 * @param fn Function to retry
 * @param config Retry configuration
 * @returns Result of the function
 * @throws RetryError if all attempts fail
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, config: RetryConfig): Promise<T> {
  const startTime = Date.now();
  const metadata: RetryMetadata[] = [];
  let lastError: Error | undefined;

  // Total attempts = initial attempt + retries
  const totalAttempts = config.maxAttempts + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      if (attempt > 1) {
        logger.debug(
          {
            name: config.name,
            attempt,
            totalAttempts,
          },
          "Retrying operation",
        );
      }

      const result = await fn();

      // Success!
      if (attempt > 1) {
        logger.info(
          {
            name: config.name,
            attempt,
            elapsedTime: Date.now() - startTime,
          },
          "Operation succeeded after retry",
        );
      }

      return result;
    } catch (error) {
      lastError = error as Error;
      const elapsedTime = Date.now() - startTime;

      // Check if error is retryable
      if (!isErrorRetryable(error as Error, config)) {
        logger.debug(
          {
            name: config.name,
            error: lastError.message,
            errorType: lastError.constructor.name,
          },
          "Error is not retryable, aborting",
        );
        throw error;
      }

      logger.warn(
        {
          name: config.name,
          attempt,
          totalAttempts,
          error: lastError.message,
          elapsedTime,
        },
        `Operation failed (attempt ${attempt}/${totalAttempts})`,
      );

      // Last attempt, don't wait
      if (attempt === totalAttempts) {
        break;
      }

      // Calculate delay with exponential backoff + jitter
      const delay = calculateDelay(attempt, config);

      // Store metadata
      metadata.push({
        attempt,
        maxAttempts: config.maxAttempts,
        delay,
        error: lastError,
        elapsedTime,
      });

      // Invoke retry callback if provided
      config.onRetry?.(attempt, lastError, delay);

      logger.debug(
        {
          name: config.name,
          attempt,
          delay,
          nextAttempt: attempt + 1,
        },
        `Waiting ${delay}ms before retry`,
      );

      // Wait before retrying
      await sleep(delay);
    }
  }

  // All attempts failed
  const totalElapsedTime = Date.now() - startTime;

  logger.error(
    {
      name: config.name,
      attempts: totalAttempts,
      totalElapsedTime,
      lastError: lastError?.message,
    },
    "All retry attempts exhausted",
  );

  throw new RetryError(
    `Operation failed after ${totalAttempts} attempts: ${lastError?.message}`,
    totalAttempts,
    lastError!,
    metadata,
  );
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  // Calculate exponential delay
  const exponentialDelay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);

  // Cap at max delay
  let delay = Math.min(exponentialDelay, config.maxDelay);

  // Add jitter if enabled (0-50% of delay)
  if (config.jitter) {
    const jitterAmount = Math.random() * delay * CIRCUIT_BREAKER_JITTER_PERCENTAGE;
    delay = delay + jitterAmount;
  }

  return Math.floor(delay);
}

/**
 * Check if an error is retryable
 */
function isErrorRetryable(error: Error, config: RetryConfig): boolean {
  // Use custom function if provided
  if (config.isRetryable) {
    return config.isRetryable(error);
  }

  // If specific error types are specified, check if error matches
  if (config.retryableErrors && config.retryableErrors.length > 0) {
    return config.retryableErrors.some((retryableError) => {
      // Check error name/type
      if (error.constructor.name === retryableError) {
        return true;
      }
      // Check error message contains the retryable error string
      if (error.message.includes(retryableError)) {
        return true;
      }
      return false;
    });
  }

  // Default: all errors are retryable
  return true;
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a retry function with preset configuration
 */
export function createRetryFunction(config: Partial<RetryConfig>) {
  const defaultConfig: RetryConfig = {
    maxAttempts: RETRY_DEFAULT_MAX_ATTEMPTS,
    initialDelay: RETRY_DEFAULT_INITIAL_DELAY_MS,
    maxDelay: RETRY_DEFAULT_MAX_DELAY_MS,
    backoffMultiplier: RETRY_DEFAULT_BACKOFF_MULTIPLIER,
    jitter: true,
    ...config,
  };

  return <T>(fn: () => Promise<T>) => retryWithBackoff(fn, defaultConfig);
}

/**
 * Predefined retry configurations
 */
export const RetryPresets = {
  /** Fast retry for quick operations (3 attempts, 500ms-5s) */
  FAST: {
    maxAttempts: RETRY_FAST_MAX_ATTEMPTS,
    initialDelay: RETRY_FAST_INITIAL_DELAY_MS,
    maxDelay: RETRY_FAST_MAX_DELAY_MS,
    backoffMultiplier: RETRY_DEFAULT_BACKOFF_MULTIPLIER,
    jitter: true,
  } as RetryConfig,

  /** Standard retry for normal operations (3 attempts, 1s-30s) */
  STANDARD: {
    maxAttempts: RETRY_DEFAULT_MAX_ATTEMPTS,
    initialDelay: RETRY_DEFAULT_INITIAL_DELAY_MS,
    maxDelay: RETRY_DEFAULT_MAX_DELAY_MS,
    backoffMultiplier: RETRY_DEFAULT_BACKOFF_MULTIPLIER,
    jitter: true,
  } as RetryConfig,

  /** Slow retry for slow operations (5 attempts, 2s-60s) */
  SLOW: {
    maxAttempts: RETRY_SLOW_MAX_ATTEMPTS,
    initialDelay: RETRY_SLOW_INITIAL_DELAY_MS,
    maxDelay: RETRY_SLOW_MAX_DELAY_MS,
    backoffMultiplier: RETRY_DEFAULT_BACKOFF_MULTIPLIER,
    jitter: true,
  } as RetryConfig,

  /** Aggressive retry for critical operations (7 attempts, 1s-120s) */
  AGGRESSIVE: {
    maxAttempts: RETRY_AGGRESSIVE_MAX_ATTEMPTS,
    initialDelay: RETRY_AGGRESSIVE_INITIAL_DELAY_MS,
    maxDelay: RETRY_AGGRESSIVE_MAX_DELAY_MS,
    backoffMultiplier: RETRY_DEFAULT_BACKOFF_MULTIPLIER,
    jitter: true,
  } as RetryConfig,
};

/**
 * Retry with timeout
 *
 * Combines retry logic with a timeout. If the total time exceeds
 * the timeout, the operation is cancelled.
 */
export async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  timeoutMs: number,
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([retryWithBackoff(fn, config), timeoutPromise]);
}

/**
 * Retry with circuit breaker integration
 *
 * Wraps a function with both retry and circuit breaker.
 * The circuit breaker sits outside the retry logic.
 */
export async function retryWithCircuitBreaker<T>(
  fn: () => Promise<T>,
  retryConfig: RetryConfig,
  circuitBreaker: { execute: <T>(fn: () => Promise<T>) => Promise<T> },
): Promise<T> {
  return circuitBreaker.execute(async () => {
    return retryWithBackoff(fn, retryConfig);
  });
}
