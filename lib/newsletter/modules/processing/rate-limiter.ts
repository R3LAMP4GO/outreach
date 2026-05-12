/**
 * Token-bucket rate limiter for Claude API
 * Implements dual limits: requests per minute AND tokens per minute
 */

import type { RateLimiterState } from "../../types/summarizer";
import { SummarizerError, SummarizerErrorType } from "../../types/summarizer";
import {
  NEWSLETTER_RATE_LIMIT_REQUESTS_PER_MINUTE,
  NEWSLETTER_RATE_LIMIT_TOKENS_PER_MINUTE,
  NEWSLETTER_RATE_LIMIT_DEFAULT_TOKENS,
  NEWSLETTER_RATE_LIMIT_WINDOW_MS,
} from "@/lib/constants";

export class RateLimiter {
  private requestsPerMinute: number;
  private tokensPerMinute: number;
  private state: RateLimiterState;

  constructor(
    requestsPerMinute: number = NEWSLETTER_RATE_LIMIT_REQUESTS_PER_MINUTE,
    tokensPerMinute: number = NEWSLETTER_RATE_LIMIT_TOKENS_PER_MINUTE,
  ) {
    this.requestsPerMinute = requestsPerMinute;
    this.tokensPerMinute = tokensPerMinute;
    this.state = {
      requestCount: 0,
      tokenCount: 0,
      windowStart: Date.now(),
    };
  }

  /**
   * Reset the rate limit window if 60 seconds have passed
   */
  private resetWindowIfNeeded(): void {
    const now = Date.now();
    const windowDuration = NEWSLETTER_RATE_LIMIT_WINDOW_MS;

    if (now - this.state.windowStart >= windowDuration) {
      this.state = {
        requestCount: 0,
        tokenCount: 0,
        windowStart: now,
      };
    }
  }

  /**
   * Check if a request with estimated tokens can proceed
   * @param estimatedTokens Estimated tokens for the request (default: 2000)
   * @throws SummarizerError if rate limit would be exceeded
   */
  async checkLimit(estimatedTokens: number = NEWSLETTER_RATE_LIMIT_DEFAULT_TOKENS): Promise<void> {
    this.resetWindowIfNeeded();

    // Check request limit
    if (this.state.requestCount >= this.requestsPerMinute) {
      const waitTime = this.getWaitTime();
      throw new SummarizerError(
        `Rate limit exceeded: ${this.requestsPerMinute} requests per minute. Wait ${Math.ceil(
          waitTime / 1000,
        )} seconds.`,
        SummarizerErrorType.RATE_LIMIT_EXCEEDED,
        undefined,
        true, // retryable
      );
    }

    // Check token limit
    if (this.state.tokenCount + estimatedTokens > this.tokensPerMinute) {
      const waitTime = this.getWaitTime();
      throw new SummarizerError(
        `Token rate limit exceeded: ${this.tokensPerMinute} tokens per minute. Wait ${Math.ceil(
          waitTime / 1000,
        )} seconds.`,
        SummarizerErrorType.RATE_LIMIT_EXCEEDED,
        undefined,
        true, // retryable
      );
    }
  }

  /**
   * Record a completed request with actual token usage
   */
  recordRequest(tokensUsed: number): void {
    this.resetWindowIfNeeded();
    this.state.requestCount++;
    this.state.tokenCount += tokensUsed;
  }

  /**
   * Get remaining capacity in current window
   */
  getRemainingCapacity(): {
    requests: number;
    tokens: number;
    resetsIn: number;
  } {
    this.resetWindowIfNeeded();

    const windowDuration = NEWSLETTER_RATE_LIMIT_WINDOW_MS;
    const resetsIn = windowDuration - (Date.now() - this.state.windowStart);

    return {
      requests: Math.max(0, this.requestsPerMinute - this.state.requestCount),
      tokens: Math.max(0, this.tokensPerMinute - this.state.tokenCount),
      resetsIn: Math.max(0, resetsIn),
    };
  }

  /**
   * Calculate wait time until rate limit resets
   */
  private getWaitTime(): number {
    const windowDuration = NEWSLETTER_RATE_LIMIT_WINDOW_MS;
    const elapsed = Date.now() - this.state.windowStart;
    return Math.max(0, windowDuration - elapsed);
  }

  /**
   * Wait until rate limit resets (for retry logic)
   */
  async waitForReset(): Promise<void> {
    const waitTime = this.getWaitTime();
    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Reset rate limiter state (for testing)
   */
  reset(): void {
    this.state = {
      requestCount: 0,
      tokenCount: 0,
      windowStart: Date.now(),
    };
  }
}
