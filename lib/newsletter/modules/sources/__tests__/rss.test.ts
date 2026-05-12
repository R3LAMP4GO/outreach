import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RSSSource, fetchMultipleRSSFeeds, DEFAULT_RSS_SOURCES } from "../rss";
import { SourceErrorCode } from "../../../types/article";
import type { RSSSourceConfig } from "../rss";
import Bottleneck from "bottleneck";

// Mock rss-parser
vi.mock("rss-parser", () => {
  return {
    default: class MockParser {
      async parseURL(url: string) {
        // Simulate different feed responses
        if (url.includes("valid-feed")) {
          return {
            title: "Test Feed",
            items: [
              {
                title: "Test Article 1",
                link: "https://example.com/article-1",
                pubDate: "2024-01-15T10:00:00Z",
                content: "<p>Test content 1</p>",
                contentSnippet: "Test content 1",
                author: "John Doe",
                categories: ["Technology", "News"],
                guid: "article-1",
              },
              {
                title: "Test Article 2",
                link: "https://example.com/article-2",
                pubDate: "2024-01-14T10:00:00Z",
                content: "<p>Test content 2</p>",
                contentSnippet: "Test content 2",
                author: "Jane Smith",
                categories: ["Business"],
                guid: "article-2",
              },
            ],
          };
        }

        if (url.includes("empty-feed")) {
          return {
            title: "Empty Feed",
            items: [],
          };
        }

        if (url.includes("invalid-date")) {
          return {
            title: "Invalid Date Feed",
            items: [
              {
                title: "Article with Invalid Date",
                link: "https://example.com/invalid-date",
                pubDate: "invalid-date",
                content: "Test content",
              },
            ],
          };
        }

        if (url.includes("missing-fields")) {
          return {
            title: "Missing Fields Feed",
            items: [
              {
                // Missing title and link
                pubDate: "2024-01-15T10:00:00Z",
              },
            ],
          };
        }

        if (url.includes("timeout")) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return { items: [] };
        }

        if (url.includes("invalid-url")) {
          throw new Error("Invalid URL: ENOTFOUND");
        }

        if (url.includes("parse-error")) {
          throw new Error("Parse Error: Invalid XML");
        }

        if (url.includes("rate-limit")) {
          throw new Error("429 Too Many Requests: rate limit exceeded");
        }

        if (url.includes("auth-error")) {
          throw new Error("401 Unauthorized");
        }

        throw new Error("Network error");
      }
    },
  };
});

describe("RSSSource", () => {
  let validConfig: RSSSourceConfig;
  let testRateLimiter: Bottleneck;

  beforeEach(() => {
    // Create a test rate limiter with no delays
    testRateLimiter = new Bottleneck({
      maxConcurrent: 10,
      minTime: 0,
      id: "test-rate-limiter",
    });

    validConfig = {
      name: "Test RSS Source",
      url: "https://example.com/valid-feed",
      type: "rss",
      enabled: true,
      maxArticles: 10,
      timeout: 10000,
      retryAttempts: 2,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    testRateLimiter.stop({ dropWaitingJobs: true });
  });

  describe("fetchArticles", () => {
    it("should successfully fetch and parse RSS feed", async () => {
      const source = new RSSSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(2);
      expect(result.articles[0]).toMatchObject({
        title: "Test Article 1",
        url: "https://example.com/article-1",
        source: "rss:Test RSS Source",
      });
      expect(result.metadata.articleCount).toBe(2);
      expect(result.metadata.duration).toBeGreaterThan(0);
    });

    it("should handle empty RSS feed", async () => {
      const config = { ...validConfig, url: "https://example.com/empty-feed" };
      const source = new RSSSource(config, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(0);
      expect(result.metadata.articleCount).toBe(0);
    });

    it("should handle invalid dates gracefully", async () => {
      const config = { ...validConfig, url: "https://example.com/invalid-date" };
      const source = new RSSSource(config, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].publishedAt).toBeInstanceOf(Date);
      expect(result.articles[0].publishedAt.getTime()).toBeGreaterThan(0);
    });

    it("should filter out items with missing required fields", async () => {
      const config = { ...validConfig, url: "https://example.com/missing-fields" };
      const source = new RSSSource(config, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(0);
    });

    it("should handle timeout errors", async () => {
      const config = {
        ...validConfig,
        url: "https://example.com/timeout",
        timeout: 1000,
      };
      const source = new RSSSource(config, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.TIMEOUT);
      expect(result.articles).toHaveLength(0);
    }, 30000);

    it("should handle invalid URL errors", async () => {
      const config = { ...validConfig, url: "https://example.com/invalid-url" };
      const source = new RSSSource(config, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.INVALID_URL);
      expect(result.error?.message).toContain("Invalid RSS feed URL");
    });

    it("should handle parse errors", async () => {
      const config = { ...validConfig, url: "https://example.com/parse-error" };
      const source = new RSSSource(config, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.PARSE_ERROR);
      expect(result.error?.message).toContain("Invalid RSS feed format");
    });

    it("should handle rate limit errors", async () => {
      const config = { ...validConfig, url: "https://example.com/rate-limit" };
      const source = new RSSSource(config, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.RATE_LIMIT);
      expect(result.error?.message).toContain("Rate limited");
    });

    it("should handle authentication errors", async () => {
      const config = { ...validConfig, url: "https://example.com/auth-error" };
      const source = new RSSSource(config, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.AUTH_ERROR);
      expect(result.error?.message).toContain("Authentication failed");
    });

    it("should sanitize HTML from content", async () => {
      const source = new RSSSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles[0].content).not.toContain("<p>");
      expect(result.articles[0].content).not.toContain("</p>");
      expect(result.articles[0].content).toBe("Test content 1");
    });

    it("should include source information in articles", async () => {
      const source = new RSSSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      result.articles.forEach((article) => {
        expect(article.source).toBe("rss:Test RSS Source");
      });
    });

    it("should respect maxArticles limit", async () => {
      const config = { ...validConfig, maxArticles: 1 };
      const source = new RSSSource(config, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(1);
    });
  });

  describe("retry logic", () => {
    it("should retry on network errors", async () => {
      const config = {
        ...validConfig,
        url: "https://example.com/network-error",
        retryAttempts: 2,
      };

      // This will fail all attempts
      const source = new RSSSource(config, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.NETWORK_ERROR);
    });

    it("should not retry on invalid URL errors", async () => {
      const config = {
        ...validConfig,
        url: "https://example.com/invalid-url",
        retryAttempts: 2,
      };

      const source = new RSSSource(config, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.INVALID_URL);
      // Should fail fast without retries
    });
  });

  describe("BaseSource functionality", () => {
    it("should return source name", () => {
      const source = new RSSSource(validConfig, testRateLimiter);
      expect(source.getName()).toBe("Test RSS Source");
    });

    it("should return enabled status", () => {
      const source = new RSSSource(validConfig, testRateLimiter);
      expect(source.isEnabled()).toBe(true);

      const disabledConfig = { ...validConfig, enabled: false };
      const disabledSource = new RSSSource(disabledConfig, testRateLimiter);
      expect(disabledSource.isEnabled()).toBe(false);
    });
  });
});

describe("fetchMultipleRSSFeeds", () => {
  let testRateLimiter: Bottleneck;

  beforeEach(() => {
    testRateLimiter = new Bottleneck({
      maxConcurrent: 10,
      minTime: 0,
      id: "test-rate-limiter-multi",
    });
  });

  afterEach(() => {
    testRateLimiter.stop({ dropWaitingJobs: true });
  });

  it("should fetch multiple feeds in parallel", async () => {
    const configs: RSSSourceConfig[] = [
      {
        name: "Feed 1",
        url: "https://example.com/valid-feed",
        type: "rss",
        enabled: true,
        timeout: 10000,
        retryAttempts: 2,
      },
      {
        name: "Feed 2",
        url: "https://example.com/valid-feed",
        type: "rss",
        enabled: true,
        timeout: 10000,
        retryAttempts: 2,
      },
    ];

    const results = await fetchMultipleRSSFeeds(configs, testRateLimiter);

    expect(results.size).toBe(2);
    expect(results.get("Feed 1")).toHaveLength(2);
    expect(results.get("Feed 2")).toHaveLength(2);
  });

  it("should handle partial failures gracefully", async () => {
    const configs: RSSSourceConfig[] = [
      {
        name: "Valid Feed",
        url: "https://example.com/valid-feed",
        type: "rss",
        enabled: true,
        timeout: 10000,
        retryAttempts: 2,
      },
      {
        name: "Invalid Feed",
        url: "https://example.com/invalid-url",
        type: "rss",
        enabled: true,
        timeout: 10000,
        retryAttempts: 2,
      },
    ];

    const results = await fetchMultipleRSSFeeds(configs, testRateLimiter);

    expect(results.size).toBe(2);
    expect(results.get("Valid Feed")).toHaveLength(2);
    expect(results.get("Invalid Feed")).toHaveLength(0); // Empty array on failure
  });

  it("should skip disabled feeds", async () => {
    const configs: RSSSourceConfig[] = [
      {
        name: "Enabled Feed",
        url: "https://example.com/valid-feed",
        type: "rss",
        enabled: true,
        timeout: 10000,
        retryAttempts: 2,
      },
      {
        name: "Disabled Feed",
        url: "https://example.com/valid-feed",
        type: "rss",
        enabled: false,
        timeout: 10000,
        retryAttempts: 2,
      },
    ];

    const results = await fetchMultipleRSSFeeds(configs, testRateLimiter);

    expect(results.size).toBe(1);
    expect(results.has("Enabled Feed")).toBe(true);
    expect(results.has("Disabled Feed")).toBe(false);
  });
});

describe("DEFAULT_RSS_SOURCES", () => {
  it("should have 5 pre-configured sources", () => {
    expect(DEFAULT_RSS_SOURCES).toHaveLength(5);
  });

  it("should have all required fields", () => {
    DEFAULT_RSS_SOURCES.forEach((source) => {
      expect(source.name).toBeTruthy();
      expect(source.url).toBeTruthy();
      expect(source.type).toBe("rss");
      expect(source.enabled).toBe(true);
      expect(source.timeout).toBeGreaterThan(0);
      expect(source.retryAttempts).toBeGreaterThanOrEqual(0);
    });
  });

  it("should have valid URLs", () => {
    DEFAULT_RSS_SOURCES.forEach((source) => {
      expect(() => new URL(source.url)).not.toThrow();
    });
  });

  it("should include all specified sources", () => {
    const sourceNames = DEFAULT_RSS_SOURCES.map((s) => s.name);

    expect(sourceNames).toContain("Harvard Business Review");
    expect(sourceNames).toContain("MIT Sloan Management Review");
    expect(sourceNames).toContain("Entrepreneur");
    expect(sourceNames).toContain("Behavioral Economics");
    expect(sourceNames).toContain("TechCrunch");
  });
});
