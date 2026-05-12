/**
 * Rate Limiter
 *
 * Token bucket rate limiter for respecting Resend API limits.
 * Prevents rate limit errors by controlling request velocity.
 */

import pino from "pino";
import type { RateLimitConfig } from "./types";

const logger = pino({ name: "rate-limiter" });

/**
 * Token bucket rate limiter
 *
 * Implements the token bucket algorithm:
 * - Tokens refill at a steady rate
 * - Each request consumes one token
 * - Requests wait if no tokens available
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // Tokens per millisecond
  private readonly hourlyLimit: number;
  private hourlyCount: number = 0;
  private hourlyWindowStart: number;

  constructor(config: RateLimitConfig) {
    this.maxTokens = config.burstSize;
    this.tokens = this.maxTokens;
    this.refillRate = config.maxRequestsPerSecond / 1000; // Convert to per ms
    this.hourlyLimit = config.maxRequestsPerHour;
    this.lastRefill = Date.now();
    this.hourlyWindowStart = Date.now();
  }

  /**
   * Acquire a token (wait if necessary)
   * @returns Promise that resolves when token is acquired
   */
  async acquire(): Promise<void> {
    while (true) {
      const now = Date.now();

      // Reset hourly counter if window expired
      if (now - this.hourlyWindowStart >= 3600000) {
        // 1 hour
        this.hourlyCount = 0;
        this.hourlyWindowStart = now;
      }

      // Check hourly limit
      if (this.hourlyCount >= this.hourlyLimit) {
        const waitTime = 3600000 - (now - this.hourlyWindowStart);
        logger.warn(
          { hourlyCount: this.hourlyCount, waitTime },
          "Hourly rate limit reached, waiting",
        );
        await this.sleep(Math.min(waitTime, 60000)); // Wait max 1 minute at a time
        continue;
      }

      // Refill tokens based on time elapsed
      this.refillTokens(now);

      // If we have tokens, acquire one
      if (this.tokens >= 1) {
        this.tokens -= 1;
        this.hourlyCount += 1;
        logger.debug({ tokens: this.tokens, hourlyCount: this.hourlyCount }, "Token acquired");
        return;
      }

      // Calculate wait time for next token
      const waitTime = Math.ceil(1 / this.refillRate);
      logger.debug({ waitTime }, "No tokens available, waiting");
      await this.sleep(waitTime);
    }
  }

  /**
   * Try to acquire a token without waiting
   * @returns True if token acquired, false otherwise
   */
  tryAcquire(): boolean {
    const now = Date.now();

    // Reset hourly counter if window expired
    if (now - this.hourlyWindowStart >= 3600000) {
      this.hourlyCount = 0;
      this.hourlyWindowStart = now;
    }

    // Check hourly limit
    if (this.hourlyCount >= this.hourlyLimit) {
      return false;
    }

    // Refill tokens
    this.refillTokens(now);

    // Try to acquire
    if (this.tokens >= 1) {
      this.tokens -= 1;
      this.hourlyCount += 1;
      return true;
    }

    return false;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(now: number): void {
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Get current rate limiter stats
   */
  getStats() {
    return {
      tokens: Math.floor(this.tokens),
      maxTokens: this.maxTokens,
      hourlyCount: this.hourlyCount,
      hourlyLimit: this.hourlyLimit,
      hourlyRemaining: this.hourlyLimit - this.hourlyCount,
    };
  }

  /**
   * Reset rate limiter state
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.hourlyCount = 0;
    this.lastRefill = Date.now();
    this.hourlyWindowStart = Date.now();
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a rate limiter with default Resend limits
 *
 * Resend free tier limits:
 * - 100 emails/day
 * - 10 emails/second (burst)
 *
 * Resend paid tier limits:
 * - Based on plan
 * - Typically 10-50 emails/second
 */
export function createResendRateLimiter(config?: Partial<RateLimitConfig>): RateLimiter {
  const defaultConfig: RateLimitConfig = {
    maxRequestsPerSecond: 10,
    maxRequestsPerHour: 1000,
    burstSize: 20,
  };

  return new RateLimiter({ ...defaultConfig, ...config });
}
