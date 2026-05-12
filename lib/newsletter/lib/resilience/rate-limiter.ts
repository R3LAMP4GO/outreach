/**
 * Token Bucket Rate Limiter
 *
 * Standalone rate limiting utility using the token bucket algorithm.
 * Provides:
 * - Burst support (use accumulated tokens)
 * - Smooth rate limiting over time
 * - Simple refill logic
 * - Per-service configurations
 *
 * Token Bucket Algorithm:
 * 1. Bucket starts with N tokens (maxTokens)
 * 2. Tokens refill at rate R per interval
 * 3. Each request consumes K tokens (default: 1)
 * 4. If insufficient tokens, request waits for refill
 *
 * Prevents:
 * - API quota exhaustion (stay within limits)
 * - 429 Too Many Requests errors
 * - Service bans (Reddit, OpenAI)
 * - Cost overruns (Claude/OpenAI per-token charges)
 */

import { logger } from "../logger";

export interface RateLimiterConfig {
  maxTokens: number; // Bucket capacity (max tokens that can accumulate)
  refillRate: number; // Tokens added per interval
  refillInterval: number; // Interval in milliseconds
  name: string; // For logging and identification
}

export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number = Date.now();
  private readonly config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
    this.tokens = config.maxTokens;

    logger.debug(
      {
        name: config.name,
        maxTokens: config.maxTokens,
        refillRate: config.refillRate,
        refillInterval: config.refillInterval,
      },
      "Token bucket rate limiter initialized",
    );
  }

  /**
   * Acquire tokens from the bucket.
   * Waits if insufficient tokens are available.
   *
   * @param tokens - Number of tokens to acquire (default: 1)
   * @returns Promise that resolves when tokens are acquired
   */
  async acquire(tokens: number = 1): Promise<void> {
    if (tokens <= 0) {
      throw new Error("Token count must be positive");
    }

    if (tokens > this.config.maxTokens) {
      throw new Error(
        `Requested ${tokens} tokens exceeds bucket capacity of ${this.config.maxTokens}`,
      );
    }

    // Refill tokens based on elapsed time
    this.refill();

    // If insufficient tokens, wait for refill
    if (this.tokens < tokens) {
      const waitTime = this.calculateWaitTime(tokens);

      logger.debug(
        {
          name: this.config.name,
          tokensNeeded: tokens,
          tokensAvailable: this.tokens,
          waitTimeMs: waitTime,
        },
        "Rate limit: waiting for tokens",
      );

      await this.sleep(waitTime);

      // Refill after waiting
      this.refill();
    }

    // Consume tokens
    this.tokens -= tokens;

    logger.debug(
      {
        name: this.config.name,
        tokensConsumed: tokens,
        tokensRemaining: this.tokens,
      },
      "Tokens acquired",
    );
  }

  /**
   * Refill tokens based on elapsed time since last refill.
   * Tokens are capped at maxTokens (bucket capacity).
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    // Calculate how many refill intervals have passed
    const intervalsElapsed = elapsed / this.config.refillInterval;

    // Calculate tokens to add (fractional intervals are floored)
    const tokensToAdd = Math.floor(intervalsElapsed * this.config.refillRate);

    if (tokensToAdd > 0) {
      const oldTokens = this.tokens;

      // Add tokens but cap at maxTokens
      this.tokens = Math.min(this.config.maxTokens, this.tokens + tokensToAdd);

      // Update last refill time
      this.lastRefill = now;

      logger.debug(
        {
          name: this.config.name,
          tokensAdded: tokensToAdd,
          oldTokens,
          newTokens: this.tokens,
          elapsed,
        },
        "Tokens refilled",
      );
    }
  }

  /**
   * Calculate wait time needed to acquire the requested tokens.
   *
   * @param tokensNeeded - Number of tokens required
   * @returns Wait time in milliseconds
   */
  private calculateWaitTime(tokensNeeded: number): number {
    // Calculate token deficit
    const deficit = tokensNeeded - this.tokens;

    // Calculate how many refill intervals are needed
    const intervalsNeeded = Math.ceil(deficit / this.config.refillRate);

    // Calculate wait time
    const waitTime = intervalsNeeded * this.config.refillInterval;

    return waitTime;
  }

  /**
   * Sleep for a specified duration.
   *
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the current number of available tokens.
   * Refills tokens before returning.
   *
   * @returns Current token count
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Check if tokens are available without acquiring them.
   *
   * @param tokens - Number of tokens to check (default: 1)
   * @returns True if tokens are available
   */
  hasTokens(tokens: number = 1): boolean {
    this.refill();
    return this.tokens >= tokens;
  }

  /**
   * Reset the bucket to full capacity.
   * Useful for testing or manual intervention.
   */
  reset(): void {
    this.tokens = this.config.maxTokens;
    this.lastRefill = Date.now();

    logger.info(
      {
        name: this.config.name,
        tokens: this.tokens,
      },
      "Rate limiter reset",
    );
  }

  /**
   * Get rate limiter statistics.
   */
  getStats() {
    this.refill();

    return {
      name: this.config.name,
      maxTokens: this.config.maxTokens,
      availableTokens: this.tokens,
      utilizationPercent: Math.round((1 - this.tokens / this.config.maxTokens) * 100),
      refillRate: this.config.refillRate,
      refillInterval: this.config.refillInterval,
      lastRefill: this.lastRefill,
    };
  }
}

/**
 * Pre-configured rate limiters for common services.
 *
 * Service Limits:
 * - Reddit: 300 requests / 15 min (20/min, allows bursts)
 * - Claude API: 50K tokens/min (Tier 1)
 * - OpenAI: 3M tokens/min (Tier 2)
 * - Resend: 100 emails/hour (free tier)
 */
export const rateLimiters = {
  /**
   * Reddit API Rate Limiter
   * App-level: 300 requests per 15 minutes
   * Allows bursts up to 300 requests, then throttles
   */
  reddit: new TokenBucketRateLimiter({
    maxTokens: 300,
    refillRate: 300,
    refillInterval: 15 * 60 * 1000, // 15 minutes
    name: "reddit",
  }),

  /**
   * Claude API Rate Limiter
   * Token-based: 50,000 tokens per minute (Tier 1)
   * For requests: estimate ~500 tokens per request (can be adjusted)
   */
  claude: new TokenBucketRateLimiter({
    maxTokens: 50000,
    refillRate: 50000,
    refillInterval: 60 * 1000, // 1 minute
    name: "claude",
  }),

  /**
   * OpenAI API Rate Limiter
   * Token-based: 3,000,000 tokens per minute (Tier 2)
   * For requests: estimate ~1000 tokens per request (can be adjusted)
   */
  openai: new TokenBucketRateLimiter({
    maxTokens: 3000000,
    refillRate: 3000000,
    refillInterval: 60 * 1000, // 1 minute
    name: "openai",
  }),

  /**
   * Resend Email API Rate Limiter
   * Free tier: 100 emails per hour
   */
  resend: new TokenBucketRateLimiter({
    maxTokens: 100,
    refillRate: 100,
    refillInterval: 60 * 60 * 1000, // 1 hour
    name: "resend",
  }),
};

/**
 * Create a custom rate limiter with specific configuration.
 *
 * @param config - Rate limiter configuration
 * @returns New TokenBucketRateLimiter instance
 */
export function createRateLimiter(config: RateLimiterConfig): TokenBucketRateLimiter {
  return new TokenBucketRateLimiter(config);
}
