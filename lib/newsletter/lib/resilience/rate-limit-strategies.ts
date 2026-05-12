/**
 * Rate Limit Backoff Strategies
 *
 * Provides different backoff strategies for handling rate limit errors:
 * - Exponential backoff: Delay increases exponentially with each attempt
 * - Linear backoff: Delay increases linearly with each attempt
 * - Constant backoff: Fixed delay between attempts
 *
 * Use cases:
 * - API rate limit errors (429 responses)
 * - Transient failures requiring retry
 * - Load shedding and graceful degradation
 */

import { TokenBucketRateLimiter } from "./rate-limiter";
import { logger } from "../logger";

/**
 * Backoff strategy interface.
 * Implementations determine delay based on attempt number.
 */
export interface BackoffStrategy {
  /**
   * Calculate delay for a given attempt.
   *
   * @param attempt - Attempt number (1-indexed)
   * @returns Delay in milliseconds
   */
  getDelay(attempt: number): number;
}

/**
 * Exponential Backoff Strategy
 *
 * Delay increases exponentially: delay = initialDelay * multiplier^(attempt - 1)
 *
 * Example (initialDelay=1000, multiplier=2):
 * - Attempt 1: 1000ms
 * - Attempt 2: 2000ms
 * - Attempt 3: 4000ms
 * - Attempt 4: 8000ms
 * - Attempt 5: 16000ms (capped at maxDelay)
 */
export class ExponentialBackoff implements BackoffStrategy {
  constructor(
    private initialDelay: number = 1000, // Initial delay in ms
    private maxDelay: number = 30000, // Maximum delay in ms
    private multiplier: number = 2, // Exponential multiplier
  ) {
    if (initialDelay <= 0) {
      throw new Error("Initial delay must be positive");
    }
    if (maxDelay < initialDelay) {
      throw new Error("Max delay must be >= initial delay");
    }
    if (multiplier <= 1) {
      throw new Error("Multiplier must be > 1");
    }
  }

  getDelay(attempt: number): number {
    if (attempt < 1) {
      throw new Error("Attempt must be >= 1");
    }

    const delay = this.initialDelay * Math.pow(this.multiplier, attempt - 1);
    return Math.min(delay, this.maxDelay);
  }
}

/**
 * Linear Backoff Strategy
 *
 * Delay increases linearly: delay = increment * attempt
 *
 * Example (increment=1000):
 * - Attempt 1: 1000ms
 * - Attempt 2: 2000ms
 * - Attempt 3: 3000ms
 * - Attempt 4: 4000ms
 * - Attempt 5: 5000ms (capped at maxDelay)
 */
export class LinearBackoff implements BackoffStrategy {
  constructor(
    private increment: number = 1000, // Delay increment per attempt
    private maxDelay: number = 30000, // Maximum delay in ms
  ) {
    if (increment <= 0) {
      throw new Error("Increment must be positive");
    }
    if (maxDelay < increment) {
      throw new Error("Max delay must be >= increment");
    }
  }

  getDelay(attempt: number): number {
    if (attempt < 1) {
      throw new Error("Attempt must be >= 1");
    }

    const delay = this.increment * attempt;
    return Math.min(delay, this.maxDelay);
  }
}

/**
 * Constant Backoff Strategy
 *
 * Fixed delay between all attempts.
 *
 * Example (delay=5000):
 * - All attempts: 5000ms
 */
export class ConstantBackoff implements BackoffStrategy {
  constructor(private delay: number = 5000) {
    if (delay <= 0) {
      throw new Error("Delay must be positive");
    }
  }

  getDelay(_attempt: number): number {
    return this.delay;
  }
}

/**
 * Decorator to add rate limiting to any async function.
 *
 * Automatically throttles function calls based on rate limiter configuration.
 *
 * @param fn - Function to rate limit
 * @param rateLimiter - Token bucket rate limiter
 * @param tokens - Number of tokens to consume per call (default: 1)
 * @returns Rate-limited version of the function
 *
 * @example
 * ```typescript
 * const rateLimitedFetch = withRateLimit(
 *   async (url: string) => fetch(url),
 *   rateLimiters.reddit,
 *   1
 * );
 *
 * // Automatically rate limited
 * await rateLimitedFetch('https://reddit.com/r/Entrepreneur/hot.json');
 * ```
 */
export function withRateLimit<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  rateLimiter: TokenBucketRateLimiter,
  tokens: number = 1,
): T {
  return (async (...args: Parameters<T>) => {
    await rateLimiter.acquire(tokens);
    return fn(...args);
  }) as T;
}

/**
 * Retry with backoff strategy.
 *
 * Retries a function with configurable backoff on failure.
 *
 * @param fn - Function to retry
 * @param options - Retry options
 * @returns Result of successful function execution
 * @throws Error if all retries are exhausted
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   async () => fetchRedditPosts('Entrepreneur'),
 *   {
 *     maxAttempts: 3,
 *     backoffStrategy: new ExponentialBackoff(1000, 10000, 2),
 *     shouldRetry: (error) => error.message.includes('429'),
 *   }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    backoffStrategy?: BackoffStrategy;
    shouldRetry?: (error: Error) => boolean;
    onRetry?: (attempt: number, error: Error, delay: number) => void;
  } = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    backoffStrategy = new ExponentialBackoff(),
    shouldRetry = () => true,
    onRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if this is the last attempt
      if (attempt === maxAttempts) {
        break;
      }

      // Check if we should retry
      if (!shouldRetry(lastError)) {
        throw lastError;
      }

      // Calculate backoff delay
      const delay = backoffStrategy.getDelay(attempt);

      logger.warn(
        {
          attempt,
          maxAttempts,
          error: lastError.message,
          delay,
        },
        "Retrying with backoff",
      );

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt, lastError, delay);
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error("Unknown error during retry");
}

/**
 * Retry with rate limiting and backoff.
 *
 * Combines rate limiting with backoff retry logic.
 *
 * @param fn - Function to execute
 * @param rateLimiter - Token bucket rate limiter
 * @param options - Retry and rate limit options
 * @returns Result of successful function execution
 *
 * @example
 * ```typescript
 * const result = await retryWithRateLimit(
 *   async () => fetchRedditPosts('Entrepreneur'),
 *   rateLimiters.reddit,
 *   {
 *     tokens: 1,
 *     maxAttempts: 3,
 *     backoffStrategy: new ExponentialBackoff(1000, 10000, 2),
 *   }
 * );
 * ```
 */
export async function retryWithRateLimit<T>(
  fn: () => Promise<T>,
  rateLimiter: TokenBucketRateLimiter,
  options: {
    tokens?: number;
    maxAttempts?: number;
    backoffStrategy?: BackoffStrategy;
    shouldRetry?: (error: Error) => boolean;
    onRetry?: (attempt: number, error: Error, delay: number) => void;
  } = {},
): Promise<T> {
  const { tokens = 1, ...retryOptions } = options;

  return retryWithBackoff(async () => {
    await rateLimiter.acquire(tokens);
    return fn();
  }, retryOptions);
}
