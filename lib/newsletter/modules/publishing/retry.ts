/**
 * Retry Logic
 *
 * Exponential backoff retry mechanism for transient failures.
 * Handles rate limits, network errors, and temporary API issues.
 */

import pino from "pino";
import type { RetryConfig } from "./types";
import {
  RETRY_DEFAULT_MAX_ATTEMPTS,
  RETRY_DEFAULT_INITIAL_DELAY_MS,
  RETRY_DEFAULT_MAX_DELAY_MS,
  RETRY_DEFAULT_BACKOFF_MULTIPLIER,
  RETRYABLE_HTTP_STATUS_CODES,
  HTTP_STATUS_TOO_MANY_REQUESTS,
  RETRY_JITTER_PERCENTAGE,
} from "@/lib/constants";

const logger = pino({ name: "retry" });

/**
 * Error types that should be retried
 */
export enum RetryableErrorType {
  RATE_LIMIT = "RATE_LIMIT",
  NETWORK = "NETWORK",
  TIMEOUT = "TIMEOUT",
  SERVER_ERROR = "SERVER_ERROR",
  TEMPORARY = "TEMPORARY",
}

/**
 * Shape of errors we handle during retry
 */
interface RetryableError {
  message?: string;
  statusCode?: number;
  code?: string;
  name?: string;
}

/**
 * Convert unknown error to RetryableError shape
 */
function toRetryableError(error: unknown): RetryableError {
  if (error && typeof error === "object") {
    return error as RetryableError;
  }
  return { message: String(error) };
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: RetryableError, config: RetryConfig): boolean {
  // HTTP status code errors
  if (error.statusCode) {
    return config.retryableStatusCodes.includes(error.statusCode);
  }

  // Rate limit errors (case-insensitive)
  const errorMessage = error.message?.toLowerCase() || "";
  if (errorMessage.includes("rate limit") || errorMessage.includes("too many requests")) {
    return true;
  }

  // Network errors
  if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT" || error.code === "ENOTFOUND") {
    return true;
  }

  // Resend specific errors
  if (error.name === "ResendError" && error.statusCode) {
    return config.retryableStatusCodes.includes(error.statusCode);
  }

  return false;
}

/**
 * Get retry error type for logging/metrics
 */
export function getRetryErrorType(error: RetryableError): RetryableErrorType {
  const errorMessage = error.message?.toLowerCase() || "";

  if (
    error.statusCode === HTTP_STATUS_TOO_MANY_REQUESTS ||
    errorMessage.includes("rate limit") ||
    errorMessage.includes("too many requests")
  ) {
    return RetryableErrorType.RATE_LIMIT;
  }

  if (error.code === "ETIMEDOUT") {
    return RetryableErrorType.TIMEOUT;
  }

  if (error.code === "ECONNRESET" || error.code === "ENOTFOUND") {
    return RetryableErrorType.NETWORK;
  }

  if (error.statusCode && error.statusCode >= 500) {
    return RetryableErrorType.SERVER_ERROR;
  }

  return RetryableErrorType.TEMPORARY;
}

/**
 * Calculate backoff delay with exponential backoff and jitter
 */
export function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  // Exponential backoff: initialDelay * (backoffMultiplier ^ attempt)
  const exponentialDelay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay);

  // Add jitter (random 0-20%) to prevent thundering herd
  const jitter = cappedDelay * RETRY_JITTER_PERCENTAGE * Math.random();

  return Math.floor(cappedDelay + jitter);
}

/**
 * Retry a function with exponential backoff
 *
 * @param fn - Function to retry
 * @param config - Retry configuration
 * @param context - Context for logging
 * @returns Result of function
 * @throws Error if all retries exhausted
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  context?: Record<string, unknown>,
): Promise<T> {
  let lastError: unknown;
  let attempt = 0;

  while (attempt <= config.maxRetries) {
    try {
      if (attempt > 0) {
        logger.info({ attempt, maxRetries: config.maxRetries, ...context }, "Retrying operation");
      }

      return await fn();
    } catch (error: unknown) {
      lastError = error;
      const retryError = toRetryableError(error);

      // Check if error is retryable
      if (!isRetryableError(retryError, config)) {
        logger.error({ error: retryError.message, ...context }, "Non-retryable error encountered");
        throw error;
      }

      // Check if we've exhausted retries
      if (attempt >= config.maxRetries) {
        logger.error(
          {
            attempt,
            maxRetries: config.maxRetries,
            error: retryError.message,
            errorType: getRetryErrorType(retryError),
            ...context,
          },
          "Max retries exhausted",
        );
        break;
      }

      // Calculate backoff delay
      const delay = calculateBackoffDelay(attempt, config);
      const errorType = getRetryErrorType(retryError);

      logger.warn(
        {
          attempt,
          maxRetries: config.maxRetries,
          delay,
          error: retryError.message,
          errorType,
          statusCode: retryError.statusCode,
          ...context,
        },
        "Operation failed, will retry",
      );

      // Wait before retry
      await sleep(delay);
      attempt++;
    }
  }

  // All retries exhausted
  throw lastError;
}

/**
 * Retry an async operation with a predicate
 *
 * @param fn - Function to retry
 * @param shouldRetry - Predicate to determine if retry should happen
 * @param config - Retry configuration
 * @param context - Context for logging
 */
export async function retryWithPredicate<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: unknown, attempt: number) => boolean,
  config: RetryConfig,
  context?: Record<string, unknown>,
): Promise<T> {
  let lastError: unknown;
  let attempt = 0;

  while (attempt <= config.maxRetries) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      const retryError = toRetryableError(error);

      if (!shouldRetry(error, attempt) || attempt >= config.maxRetries) {
        throw error;
      }

      const delay = calculateBackoffDelay(attempt, config);
      logger.warn(
        { attempt, delay, error: retryError.message, ...context },
        "Retrying with predicate",
      );

      await sleep(delay);
      attempt++;
    }
  }

  throw lastError;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create default retry config
 */
export function createDefaultRetryConfig(): RetryConfig {
  return {
    maxRetries: RETRY_DEFAULT_MAX_ATTEMPTS,
    initialDelay: RETRY_DEFAULT_INITIAL_DELAY_MS,
    maxDelay: RETRY_DEFAULT_MAX_DELAY_MS,
    backoffMultiplier: RETRY_DEFAULT_BACKOFF_MULTIPLIER,
    retryableStatusCodes: RETRYABLE_HTTP_STATUS_CODES,
  };
}
