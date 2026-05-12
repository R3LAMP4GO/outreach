import Bottleneck from "bottleneck";
import { logger, logRateLimitEvent } from "./logger";
import {
  RSS_RATE_LIMIT_CONCURRENT,
  RSS_RATE_LIMIT_MIN_TIME_MS,
  RSS_RATE_LIMIT_RESERVOIR,
  RSS_RATE_LIMIT_WINDOW_MS,
  RSS_RATE_LIMIT_RETRY_DELAY_MS,
} from "@/lib/constants";

/**
 * Advanced Rate Limiting with Bottleneck
 *
 * Prevents API/RSS rate limit violations by:
 * - Queueing requests when limit reached
 * - Automatic retries after cooldown
 * - Fair distribution across concurrent requests
 */

export interface RateLimiterConfig {
  maxConcurrent?: number; // Max concurrent requests (default: 1)
  minTime?: number; // Min time between requests in ms (default: 0)
  reservoir?: number; // Max requests in time window
  reservoirRefreshAmount?: number; // How many tokens to add on refresh
  reservoirRefreshInterval?: number; // Refresh interval in ms
  id?: string; // Unique ID for the limiter
}

/**
 * Create a rate limiter with custom configuration
 */
export function createRateLimiter(config: RateLimiterConfig): Bottleneck {
  const {
    maxConcurrent = 1,
    minTime = 0,
    reservoir,
    reservoirRefreshAmount,
    reservoirRefreshInterval,
    id = "default",
  } = config;

  const limiterConfig: Bottleneck.ConstructorOptions = {
    maxConcurrent,
    minTime,
    reservoir,
    reservoirRefreshAmount,
    reservoirRefreshInterval,
    id,
  };

  const limiter = new Bottleneck(limiterConfig);

  // Event listeners for monitoring
  limiter.on("failed", async (error: Error, jobInfo: { retryCount: number }) => {
    logRateLimitEvent("job_failed", {
      limiterId: id,
      error: error.message,
      retryCount: jobInfo.retryCount,
    });

    // Retry after 5 seconds on rate limit errors
    if (error.message.includes("rate limit") || error.message.includes("429")) {
      return RSS_RATE_LIMIT_RETRY_DELAY_MS;
    }
  });

  limiter.on("depleted", () => {
    logRateLimitEvent("reservoir_depleted", { limiterId: id });
  });

  limiter.on("debug", (message: string, data: unknown) => {
    logger.debug({ limiterId: id, message, data }, "Rate limiter debug");
  });

  return limiter;
}

/**
 * RSS Feed Rate Limiter
 * Conservative: 10 requests per minute (max)
 */
export const rssRateLimiter = createRateLimiter({
  maxConcurrent: RSS_RATE_LIMIT_CONCURRENT,
  minTime: RSS_RATE_LIMIT_MIN_TIME_MS,
  reservoir: RSS_RATE_LIMIT_RESERVOIR,
  reservoirRefreshAmount: RSS_RATE_LIMIT_RESERVOIR,
  reservoirRefreshInterval: RSS_RATE_LIMIT_WINDOW_MS,
  id: "rss-feeds",
});

/**
 * Wrap a function with rate limiting
 */
export function withRateLimit<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  limiter: Bottleneck,
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return limiter.schedule(() => fn(...args)) as Promise<ReturnType<T>>;
  };
}

/**
 * Get rate limiter statistics
 */
export async function getRateLimiterStats(limiter: Bottleneck) {
  const counts = limiter.counts();

  return {
    running: counts.RUNNING || 0, // Currently executing
    queued: counts.QUEUED || 0, // Waiting in queue
    executing: counts.EXECUTING || 0, // Being executed
    done: counts.DONE || 0, // Completed
  };
}

/**
 * Stop rate limiter gracefully
 */
export async function stopRateLimiter(limiter: Bottleneck) {
  logger.info("Stopping rate limiter");
  await limiter.stop({ dropWaitingJobs: false }); // Complete queued jobs
  logger.info("Rate limiter stopped");
}
