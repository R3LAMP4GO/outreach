// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — partial Supabase mocks cause type mismatches
/**
 * Rate Limiter Integration Examples
 *
 * Demonstrates real-world usage patterns for rate limiting:
 * - Reddit API integration
 * - Claude API token-based limiting
 * - OpenAI API integration
 * - Resend email limiting
 * - Combined with retry logic
 * - Combined with circuit breakers
 */

import { describe, it, expect } from "vitest";
import {
  rateLimiters,
  createRateLimiter,
  withRateLimit,
  retryWithRateLimit,
  ExponentialBackoff,
} from "../index";

describe("Integration Examples", () => {
  describe("Reddit API Rate Limiting", () => {
    it("should rate limit Reddit API calls", async () => {
      // Reset limiter for clean test
      rateLimiters.reddit.reset();

      const fetchRedditPosts = async (subreddit: string) => {
        await rateLimiters.reddit.acquire(1);
        return { subreddit, posts: ["post1", "post2"] };
      };

      // Make 5 requests
      const results = await Promise.all([
        fetchRedditPosts("Entrepreneur"),
        fetchRedditPosts("startups"),
        fetchRedditPosts("SaaS"),
        fetchRedditPosts("marketing"),
        fetchRedditPosts("sales"),
      ]);

      expect(results).toHaveLength(5);
      expect(rateLimiters.reddit.getAvailableTokens()).toBe(295);
    });

    it("should use decorator for Reddit API", async () => {
      rateLimiters.reddit.reset();

      const fetchSubreddit = async (subreddit: string) => {
        return { subreddit, hot: true };
      };

      const rateLimitedFetch = withRateLimit(fetchSubreddit, rateLimiters.reddit, 1);

      const result = await rateLimitedFetch("Entrepreneur");

      expect(result).toEqual({ subreddit: "Entrepreneur", hot: true });
      expect(rateLimiters.reddit.getAvailableTokens()).toBe(299);
    });

    it("should handle burst Reddit requests", async () => {
      rateLimiters.reddit.reset();

      // Burst: 50 requests at once
      const promises = Array.from({ length: 50 }, (_, i) =>
        rateLimiters.reddit.acquire(1).then(() => ({ id: i })),
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(50);
      expect(rateLimiters.reddit.getAvailableTokens()).toBe(250);
    });
  });

  describe("Claude API Token-Based Limiting", () => {
    it("should rate limit by estimated tokens", async () => {
      rateLimiters.claude.reset();

      const summarizeArticle = async (article: string) => {
        // Estimate tokens: ~4 chars per token
        const estimatedTokens = Math.ceil(article.length / 4);

        await rateLimiters.claude.acquire(estimatedTokens);

        return { summary: `Summary of ${article.substring(0, 20)}...` };
      };

      // Article with ~400 chars = ~100 tokens
      const article = "A".repeat(400);
      const result = await summarizeArticle(article);

      expect(result.summary).toContain("Summary of");
      expect(rateLimiters.claude.getAvailableTokens()).toBe(49900); // 50000 - 100
    });

    it("should handle multiple Claude API calls with varying tokens", async () => {
      rateLimiters.claude.reset();

      const calls = [
        { tokens: 500, name: "small" },
        { tokens: 1000, name: "medium" },
        { tokens: 2000, name: "large" },
      ];

      for (const call of calls) {
        await rateLimiters.claude.acquire(call.tokens);
      }

      // Total consumed: 3500 tokens
      expect(rateLimiters.claude.getAvailableTokens()).toBe(46500);
    });
  });

  describe("OpenAI API Token-Based Limiting", () => {
    it("should rate limit OpenAI API by tokens", async () => {
      rateLimiters.openai.reset();

      const generateCompletion = async (prompt: string) => {
        // Estimate tokens for prompt + completion
        const estimatedTokens = Math.ceil(prompt.length / 4) + 500;

        await rateLimiters.openai.acquire(estimatedTokens);

        return { completion: "Generated text..." };
      };

      const prompt = "Write a blog post about entrepreneurship";
      const result = await generateCompletion(prompt);

      expect(result.completion).toBeDefined();
      // Consumed ~510 tokens (10 from prompt + 500 estimated completion)
      expect(rateLimiters.openai.getAvailableTokens()).toBeLessThan(3000000);
      expect(rateLimiters.openai.getAvailableTokens()).toBeGreaterThan(2999000);
    });
  });

  describe("Resend Email Rate Limiting", () => {
    it("should rate limit email sending", async () => {
      rateLimiters.resend.reset();

      const sendEmail = async (to: string, subject: string) => {
        await rateLimiters.resend.acquire(1);
        return { to, subject, sent: true };
      };

      // Send 10 emails
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => sendEmail(`user${i}@example.com`, "Newsletter")),
      );

      expect(results).toHaveLength(10);
      expect(results.every((r) => r.sent)).toBe(true);
      expect(rateLimiters.resend.getAvailableTokens()).toBe(90);
    });

    it("should prevent exceeding email quota", async () => {
      // Create small quota for testing
      const emailLimiter = createRateLimiter({
        maxTokens: 5,
        refillRate: 5,
        refillInterval: 100,
        name: "test-email",
      });

      const sendEmail = async (to: string) => {
        await emailLimiter.acquire(1);
        return { to };
      };

      // Send 5 emails (exhausts quota)
      await Promise.all(Array.from({ length: 5 }, (_, i) => sendEmail(`user${i}@example.com`)));

      expect(emailLimiter.getAvailableTokens()).toBe(0);

      // Next email should wait for refill
      const startTime = Date.now();
      await sendEmail("user6@example.com");
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(90);
    });
  });

  describe("Retry with Rate Limiting", () => {
    it("should combine rate limiting with retry on 429 errors", async () => {
      const limiter = createRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 10000, // Long refill to avoid refills during test
        name: "retry-test",
      });

      let attempts = 0;
      const flakeyAPI = async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error("429 Rate Limit Exceeded");
          throw error;
        }
        return { success: true };
      };

      const result = await retryWithRateLimit(flakeyAPI, limiter, {
        tokens: 1,
        maxAttempts: 5,
        backoffStrategy: new ExponentialBackoff(10, 100, 2),
        shouldRetry: (error) => error.message.includes("429"),
      });

      expect(result).toEqual({ success: true });
      expect(attempts).toBe(3);
      // 3 attempts * 1 token = 3 tokens consumed
      expect(limiter.getAvailableTokens()).toBe(7);
    });
  });

  describe("Custom Service Rate Limiting", () => {
    it("should create custom rate limiter for specific API", async () => {
      // Example: Custom API with 1000 requests per minute
      const customLimiter = createRateLimiter({
        maxTokens: 1000,
        refillRate: 1000,
        refillInterval: 60 * 1000,
        name: "custom-api",
      });

      const callCustomAPI = withRateLimit(
        async (endpoint: string) => ({ endpoint, data: "response" }),
        customLimiter,
        1,
      );

      const result = await callCustomAPI("/users");

      expect(result).toEqual({ endpoint: "/users", data: "response" });
      expect(customLimiter.getAvailableTokens()).toBe(999);
    });

    it("should handle different rate limits per endpoint", async () => {
      // Read endpoint: 100 requests/min
      const readLimiter = createRateLimiter({
        maxTokens: 100,
        refillRate: 100,
        refillInterval: 60 * 1000,
        name: "read-api",
      });

      // Write endpoint: 10 requests/min
      const writeLimiter = createRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 60 * 1000,
        name: "write-api",
      });

      const readData = async () => {
        await readLimiter.acquire(1);
        return { data: "read" };
      };

      const writeData = async () => {
        await writeLimiter.acquire(1);
        return { data: "written" };
      };

      // Make 5 reads and 2 writes
      await Promise.all([
        ...Array.from({ length: 5 }, () => readData()),
        ...Array.from({ length: 2 }, () => writeData()),
      ]);

      expect(readLimiter.getAvailableTokens()).toBe(95);
      expect(writeLimiter.getAvailableTokens()).toBe(8);
    });
  });

  describe("Performance Scenarios", () => {
    it("should handle high-throughput API with rate limiting", async () => {
      const highThroughputLimiter = createRateLimiter({
        maxTokens: 1000,
        refillRate: 1000,
        refillInterval: 100, // Fast refill for testing
        name: "high-throughput",
      });

      const makeAPICall = async (id: number) => {
        await highThroughputLimiter.acquire(1);
        return { id, result: "success" };
      };

      const startTime = Date.now();

      // Make 500 requests
      const results = await Promise.all(Array.from({ length: 500 }, (_, i) => makeAPICall(i)));

      const elapsed = Date.now() - startTime;

      expect(results).toHaveLength(500);
      expect(elapsed).toBeLessThan(200); // Should be fast (tokens available)
      // Allow for refill during execution - with fast refills (100ms), multiple refills can occur
      // 500 consumed, but refills can add 1000 per 100ms, so available could be higher
      const available = highThroughputLimiter.getAvailableTokens();
      expect(available).toBeGreaterThanOrEqual(490);
      expect(available).toBeLessThanOrEqual(600); // Increased upper bound to account for refills
    });

    it("should gracefully throttle when quota exceeded", async () => {
      const limitedLimiter = createRateLimiter({
        maxTokens: 10,
        refillRate: 10,
        refillInterval: 50, // Faster refill for testing
        name: "limited",
      });

      const results: number[] = [];

      // Make 20 requests sequentially to avoid race conditions
      // This demonstrates throttling more reliably
      const startTime = Date.now();

      for (let i = 0; i < 20; i++) {
        const start = Date.now();
        await limitedLimiter.acquire(1);
        results.push(Date.now() - start);
      }

      const totalElapsed = Date.now() - startTime;

      // Should have throttled (with fast refill, should still take some time)
      // 20 requests with 10 capacity = 1 refill needed = ~50ms minimum
      expect(totalElapsed).toBeGreaterThanOrEqual(40);
      expect(totalElapsed).toBeLessThan(300);

      // After sequential execution, tokens should be valid (>= 0)
      const available = limitedLimiter.getAvailableTokens();
      expect(available).toBeGreaterThanOrEqual(0);
      expect(available).toBeLessThanOrEqual(10);
    });
  });

  describe("Real-World Patterns", () => {
    it("should implement graceful degradation on rate limit", async () => {
      const limiter = createRateLimiter({
        maxTokens: 2,
        refillRate: 2,
        refillInterval: 100,
        name: "graceful",
      });

      const fetchWithFallback = async (useCache: boolean = false) => {
        if (useCache) {
          return { data: "cached", source: "cache" };
        }

        if (!limiter.hasTokens(1)) {
          // Rate limit exceeded, use cache
          return { data: "cached", source: "cache" };
        }

        await limiter.acquire(1);
        return { data: "fresh", source: "api" };
      };

      // First 2 calls: use API
      const result1 = await fetchWithFallback();
      const result2 = await fetchWithFallback();

      // 3rd call: should fallback to cache
      const result3 = await fetchWithFallback();

      expect(result1.source).toBe("api");
      expect(result2.source).toBe("api");
      expect(result3.source).toBe("cache");
    });

    it("should implement priority-based rate limiting", async () => {
      const limiter = createRateLimiter({
        maxTokens: 5,
        refillRate: 5,
        refillInterval: 1000,
        name: "priority",
      });

      const makeRequest = async (priority: "high" | "low") => {
        const tokens = priority === "high" ? 2 : 1;
        await limiter.acquire(tokens);
        return { priority };
      };

      // High priority consumes more tokens but gets guaranteed execution
      await makeRequest("high");
      expect(limiter.getAvailableTokens()).toBe(3);

      await makeRequest("low");
      expect(limiter.getAvailableTokens()).toBe(2);
    });
  });
});
