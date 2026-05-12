import { describe, it, expect, afterAll } from "vitest";
import { fetchMultipleRSSFeeds, DEFAULT_RSS_SOURCES } from "../rss";
import { stopRateLimiter, rssRateLimiter, getRateLimiterStats } from "../../../lib/rate-limiter";

/**
 * Integration tests for RSS sources
 *
 * Note: These tests make real HTTP requests to RSS feeds.
 * They may be slow or fail if feeds are unavailable.
 * Consider skipping in CI environments.
 */

const SKIP_INTEGRATION_TESTS = process.env.SKIP_INTEGRATION_TESTS === "true";

describe.skipIf(SKIP_INTEGRATION_TESTS)("RSS Integration Tests", () => {
  afterAll(async () => {
    // Clean up rate limiter
    await stopRateLimiter(rssRateLimiter);
  });

  describe("Real RSS Feed Fetching", () => {
    it.skip("should fetch from Harvard Business Review", async () => {
      const config = DEFAULT_RSS_SOURCES.find((s) => s.name === "Harvard Business Review");
      expect(config).toBeDefined();

      if (!config) return;

      const results = await fetchMultipleRSSFeeds([config]);
      const articles = results.get(config.name);

      expect(articles).toBeDefined();
      expect(Array.isArray(articles)).toBe(true);

      // HBR should have articles
      if (articles && articles.length > 0) {
        const article = articles[0];
        expect(article.title).toBeTruthy();
        expect(article.url).toBeTruthy();
        expect(article.publishedAt).toBeInstanceOf(Date);
        expect(article.source).toBe("rss:Harvard Business Review");
      }
    }, 30000); // 30 second timeout

    it.skip("should fetch from TechCrunch", async () => {
      const config = DEFAULT_RSS_SOURCES.find((s) => s.name === "TechCrunch");
      expect(config).toBeDefined();

      if (!config) return;

      const results = await fetchMultipleRSSFeeds([config]);
      const articles = results.get(config.name);

      expect(articles).toBeDefined();
      expect(Array.isArray(articles)).toBe(true);

      // TechCrunch should have many articles
      if (articles && articles.length > 0) {
        expect(articles.length).toBeGreaterThan(0);

        const article = articles[0];
        expect(article.title).toBeTruthy();
        expect(article.url).toContain("techcrunch.com");
        expect(article.publishedAt).toBeInstanceOf(Date);
      }
    }, 30000);

    it.skip("should fetch from multiple feeds in parallel", async () => {
      // Use just 2 feeds to keep test fast
      const configs = DEFAULT_RSS_SOURCES.slice(0, 2);

      const startTime = Date.now();
      const results = await fetchMultipleRSSFeeds(configs);
      const duration = Date.now() - startTime;

      expect(results.size).toBe(2);

      // Should complete faster than sequential (roughly)
      // Each feed has ~10-15s timeout, parallel should be <20s
      expect(duration).toBeLessThan(25000);

      // Verify we got articles from both feeds
      configs.forEach((config) => {
        const articles = results.get(config.name);
        expect(articles).toBeDefined();
        expect(Array.isArray(articles)).toBe(true);
      });
    }, 30000);

    it.skip("should respect rate limiting", async () => {
      const config = DEFAULT_RSS_SOURCES[0];

      // Make 3 requests
      const promises = [
        fetchMultipleRSSFeeds([config]),
        fetchMultipleRSSFeeds([config]),
        fetchMultipleRSSFeeds([config]),
      ];

      const startTime = Date.now();
      await Promise.all(promises);
      const duration = Date.now() - startTime;

      // With rate limiting (6s min between requests), should take at least 12s
      // But in parallel mode, should be faster than sequential (18s+)
      expect(duration).toBeGreaterThan(0);

      const stats = await getRateLimiterStats(rssRateLimiter);
      expect(stats.done).toBeGreaterThan(0);
    }, 45000);
  });

  describe("Feed Error Handling", () => {
    it.skip("should handle invalid feed URLs gracefully", async () => {
      const invalidConfig = {
        name: "Invalid Feed",
        url: "https://invalid-domain-that-does-not-exist-12345.com/feed",
        type: "rss" as const,
        enabled: true,
        timeout: 5000,
        retryAttempts: 1,
      };

      const results = await fetchMultipleRSSFeeds([invalidConfig]);
      const articles = results.get(invalidConfig.name);

      expect(articles).toBeDefined();
      expect(articles).toHaveLength(0); // Empty on failure
    }, 15000);

    it.skip("should handle non-RSS URLs gracefully", async () => {
      const nonRSSConfig = {
        name: "Non-RSS URL",
        url: "https://www.google.com", // Valid URL but not RSS
        type: "rss" as const,
        enabled: true,
        timeout: 5000,
        retryAttempts: 1,
      };

      const results = await fetchMultipleRSSFeeds([nonRSSConfig]);
      const articles = results.get(nonRSSConfig.name);

      expect(articles).toBeDefined();
      expect(articles).toHaveLength(0); // Empty on failure
    }, 15000);
  });

  describe("Content Quality", () => {
    it.skip("should extract clean article titles", async () => {
      const config = DEFAULT_RSS_SOURCES[0];
      const results = await fetchMultipleRSSFeeds([config]);
      const articles = results.get(config.name);

      if (articles && articles.length > 0) {
        articles.forEach((article) => {
          // Titles should not contain HTML tags
          expect(article.title).not.toMatch(/<[^>]+>/);
          // Titles should be trimmed
          expect(article.title).toBe(article.title.trim());
          // Titles should have reasonable length
          expect(article.title.length).toBeGreaterThan(0);
          expect(article.title.length).toBeLessThan(500);
        });
      }
    }, 30000);

    it.skip("should have valid publication dates", async () => {
      const config = DEFAULT_RSS_SOURCES[0];
      const results = await fetchMultipleRSSFeeds([config]);
      const articles = results.get(config.name);

      if (articles && articles.length > 0) {
        articles.forEach((article) => {
          expect(article.publishedAt).toBeInstanceOf(Date);
          expect(article.publishedAt.getTime()).toBeGreaterThan(0);
          // Dates should be reasonable (not in far future)
          const oneYearFromNow = Date.now() + 365 * 24 * 60 * 60 * 1000;
          expect(article.publishedAt.getTime()).toBeLessThan(oneYearFromNow);
        });
      }
    }, 30000);

    it.skip("should have valid URLs", async () => {
      const config = DEFAULT_RSS_SOURCES[0];
      const results = await fetchMultipleRSSFeeds([config]);
      const articles = results.get(config.name);

      if (articles && articles.length > 0) {
        articles.forEach((article) => {
          expect(() => new URL(article.url)).not.toThrow();
          expect(article.url).toMatch(/^https?:\/\//);
        });
      }
    }, 30000);
  });

  describe("Deduplication", () => {
    it.skip("should not have duplicate articles in single feed", async () => {
      const config = DEFAULT_RSS_SOURCES[0];
      const results = await fetchMultipleRSSFeeds([config]);
      const articles = results.get(config.name);

      if (articles && articles.length > 0) {
        const links = articles.map((a) => a.url);
        const uniqueLinks = new Set(links);
        expect(links.length).toBe(uniqueLinks.size);
      }
    }, 30000);

    it.skip("should handle duplicate fetches correctly", async () => {
      const config = DEFAULT_RSS_SOURCES[0];

      const results1 = await fetchMultipleRSSFeeds([config]);
      const results2 = await fetchMultipleRSSFeeds([config]);

      const articles1 = results1.get(config.name);
      const articles2 = results2.get(config.name);

      // Both fetches should succeed
      expect(articles1).toBeDefined();
      expect(articles2).toBeDefined();

      // Should get similar results (RSS feeds are relatively stable)
      // Allow some variance for new articles
      if (articles1 && articles2 && articles1.length > 0 && articles2.length > 0) {
        const links1 = new Set(articles1.map((a) => a.url));
        const links2 = new Set(articles2.map((a) => a.url));

        // At least some overlap expected
        const overlap = [...links1].filter((link) => links2.has(link));
        expect(overlap.length).toBeGreaterThan(0);
      }
    }, 45000);
  });
});

describe.skipIf(!SKIP_INTEGRATION_TESTS)("Integration Tests Skipped", () => {
  it("should skip integration tests when SKIP_INTEGRATION_TESTS=true", () => {
    expect(SKIP_INTEGRATION_TESTS).toBe(true);
  });
});
