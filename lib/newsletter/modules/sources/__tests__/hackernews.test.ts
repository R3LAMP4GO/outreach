// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — partial Supabase mocks cause type mismatches
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HackerNewsSource, DEFAULT_HN_SOURCE } from "../hackernews";
import { SourceErrorCode } from "../../../types/article";
import type { HackerNewsSourceConfig } from "../hackernews";
import Bottleneck from "bottleneck";

// Mock fetch globally
vi.stubGlobal("fetch", vi.fn());

// Create a minimal rate limiter for tests (no delays)
const testRateLimiter = new Bottleneck({
  maxConcurrent: 100,
  minTime: 0,
});

// Helper to create mock HN story
const createMockStory = (overrides: Record<string, unknown> = {}) => ({
  id: 123456,
  type: "story",
  by: "testuser",
  time: 1705320000, // 2024-01-15 10:00:00 UTC
  title: "Test Article Title",
  url: "https://example.com/article",
  score: 100,
  descendants: 50,
  ...overrides,
});

describe("HackerNewsSource", () => {
  let validConfig: HackerNewsSourceConfig;

  beforeEach(() => {
    validConfig = {
      name: "Test HN Source",
      url: "https://hacker-news.firebaseio.com/v0/topstories.json",
      type: "hackernews",
      enabled: true,
      maxArticles: 10,
      timeout: 30000,
      retryAttempts: 0, // No retries in tests to avoid mock exhaustion
      minScore: 50,
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchArticles", () => {
    it("should successfully fetch and parse HN stories", async () => {
      // Mock top stories endpoint
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [123456, 123457, 123458],
      });

      // Mock individual story endpoints - IMPORTANT: Each story needs unique URL to avoid deduplication
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({ id: 123456, score: 100, url: "https://example.com/article1" }),
      });
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({
            id: 123457,
            score: 75,
            title: "Second Article",
            url: "https://example.com/article2",
          }),
      });
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({
            id: 123458,
            score: 60,
            title: "Third Article",
            url: "https://example.com/article3",
          }),
      });

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(3);
      expect(result.articles[0]).toMatchObject({
        title: "Test Article Title",
        author: "testuser",
      });
      expect(result.articles[0].source).toMatch(/^hackernews:\d+$/);
      expect(result.articles[0].engagement).toMatchObject({
        upvotes: 100,
        comments: 50,
      });
      expect(result.metadata.articleCount).toBe(3);
    });

    it("should filter out stories below minimum score", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [123456, 123457],
      });

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({ id: 123456, score: 100, url: "https://example.com/high" }),
      });
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({ id: 123457, score: 30, url: "https://example.com/low" }),
      });

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].engagement?.upvotes).toBe(100);
    });

    it("should filter out dead stories", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [123456, 123457],
      });

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({ id: 123456, score: 100, url: "https://example.com/alive" }),
      });
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({ id: 123457, score: 100, dead: true, url: "https://example.com/dead" }),
      });

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].metadata?.hnId).toBe("123456");
    });

    it("should filter out deleted stories", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [123456, 123457],
      });

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({ id: 123456, score: 100, url: "https://example.com/exists" }),
      });
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({
            id: 123457,
            score: 100,
            deleted: true,
            url: "https://example.com/deleted",
          }),
      });

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(1);
    });

    it("should filter out Ask HN posts without URLs by default", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [123456, 123457, 123458],
      });

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({ id: 123456, score: 100, url: "https://example.com/normal" }),
      });
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({
            id: 123457,
            score: 100,
            title: "Ask HN: How to test?",
            url: undefined,
          }),
      });
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({
            id: 123458,
            score: 100,
            title: "Ask HN: Check this out",
            url: "https://example.com/askhn",
          }),
      });

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(2);
      expect(result.articles.find((a) => a.metadata?.hnId === "123457")).toBeUndefined();
    });

    it("should include Ask HN posts when configured", async () => {
      const config = { ...validConfig, includeAskHN: true };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [123456, 123457],
      });

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({ id: 123456, score: 100, url: "https://example.com/normal2" }),
      });
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({
            id: 123457,
            score: 100,
            title: "Ask HN: How to test?",
            url: undefined,
          }),
      });

      const source = new HackerNewsSource(config, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(2);
    });

    it("should filter out Show HN posts without URLs by default", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [123456, 123457, 123458],
      });

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({ id: 123456, score: 100, url: "https://example.com/normal3" }),
      });
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({ id: 123457, score: 100, title: "Show HN: My Project", url: undefined }),
      });
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({
            id: 123458,
            score: 100,
            title: "Show HN: Cool App",
            url: "https://example.com/showhn",
          }),
      });

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(2);
      expect(result.articles.find((a) => a.metadata?.hnId === "123457")).toBeUndefined();
    });

    it("should include Show HN posts when configured", async () => {
      const config = { ...validConfig, includeShowHN: true };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [123456, 123457],
      });

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({ id: 123456, score: 100, url: "https://example.com/normal4" }),
      });
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({ id: 123457, score: 100, title: "Show HN: My Project", url: undefined }),
      });

      const source = new HackerNewsSource(config, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(2);
    });

    it("should filter out job posts by default", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [123456, 123457],
      });

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({
            id: 123456,
            score: 100,
            type: "story",
            url: "https://example.com/story",
          }),
      });
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({ id: 123457, score: 100, type: "job", url: "https://example.com/job" }),
      });

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(1);
    });

    it("should use HN comment URL for stories without external URL", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [123456],
      });

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({
            id: 123456,
            score: 100,
            url: undefined,
          }),
      });

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].url).toBe("https://news.ycombinator.com/item?id=123456");
    });

    it("should handle stories with text content", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [123456],
      });

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({
            id: 123456,
            score: 100,
            text: "This is the story text content",
            url: undefined,
          }),
      });

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles[0].content).toBe("This is the story text content");
    });

    it("should handle empty story list", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(0);
    });

    it("should handle null story responses gracefully", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [123456, 123457],
      });

      // First story returns null (deleted/dead)
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => null,
      });

      // Second story is valid
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({ id: 123457, score: 100, url: "https://example.com/valid" }),
      });

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].metadata?.hnId).toBe("123457");
    });

    it("should respect maxArticles limit for story IDs", async () => {
      const config = { ...validConfig, maxArticles: 2 };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [1, 2, 3, 4, 5],
      });

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => createMockStory({ id: 1, score: 100, url: "https://example.com/1" }),
      });
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => createMockStory({ id: 2, score: 90, url: "https://example.com/2" }),
      });

      const source = new HackerNewsSource(config, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      // Should only fetch first 2 story IDs
      expect(global.fetch).toHaveBeenCalledTimes(3); // 1 for IDs + 2 for stories
    });
  });

  describe("error handling", () => {
    it("should handle network errors when fetching story IDs", async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network error"));

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.NETWORK_ERROR);
    });

    it("should handle non-200 status from API", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.NETWORK_ERROR);
    });

    it("should handle JSON parse errors", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error("Unexpected token in JSON");
        },
      });

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.PARSE_ERROR);
    });

    it("should handle individual story fetch failures gracefully", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [123456, 123457, 123458],
      });

      // First story succeeds
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({ id: 123456, score: 100, url: "https://example.com/first" }),
      });

      // Second story fails
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      // Third story succeeds
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({ id: 123458, score: 100, url: "https://example.com/third" }),
      });

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(2);
      expect(result.articles.find((a) => a.metadata?.hnId === "123456")).toBeDefined();
      expect(result.articles.find((a) => a.metadata?.hnId === "123458")).toBeDefined();
    });

    it("should handle rate limit errors", async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("429 rate limit exceeded"));

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.RATE_LIMIT);
    });

    it("should handle timeout errors", async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Request timeout ETIMEDOUT"));

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.TIMEOUT);
    });
  });

  describe("data validation", () => {
    it("should skip stories without title", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [123456, 123457],
      });

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({ id: 123456, score: 100, url: "https://example.com/titled" }),
      });
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({
            id: 123457,
            score: 100,
            title: undefined,
            url: "https://example.com/notitled",
          }),
      });

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(1);
    });

    it("should validate timestamp and convert to Date", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [123456],
      });

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({
            id: 123456,
            score: 100,
            time: 1705320000, // 2024-01-15 10:00:00 UTC
          }),
      });

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles[0].publishedAt).toBeInstanceOf(Date);
      expect(result.articles[0].publishedAt.getTime()).toBe(1705320000 * 1000);
    });

    it("should handle invalid timestamps", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [123456],
      });

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createMockStory({
            id: 123456,
            score: 100,
            time: NaN,
          }),
      });

      const source = new HackerNewsSource(validConfig, testRateLimiter);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(0); // Should be filtered out
    });
  });

  describe("BaseSource functionality", () => {
    it("should return source name", () => {
      const source = new HackerNewsSource(validConfig, testRateLimiter);
      expect(source.getName()).toBe("Test HN Source");
    });

    it("should return enabled status", () => {
      const source = new HackerNewsSource(validConfig, testRateLimiter);
      expect(source.isEnabled()).toBe(true);

      const disabledConfig = { ...validConfig, enabled: false };
      const disabledSource = new HackerNewsSource(disabledConfig, testRateLimiter);
      expect(disabledSource.isEnabled()).toBe(false);
    });
  });
});

describe("DEFAULT_HN_SOURCE", () => {
  it("should have correct configuration", () => {
    expect(DEFAULT_HN_SOURCE.name).toBe("Hacker News");
    expect(DEFAULT_HN_SOURCE.type).toBe("hackernews");
    expect(DEFAULT_HN_SOURCE.enabled).toBe(true);
    expect(DEFAULT_HN_SOURCE.maxArticles).toBe(30);
    expect(DEFAULT_HN_SOURCE.minScore).toBe(50);
    expect(DEFAULT_HN_SOURCE.includeAskHN).toBe(false);
    expect(DEFAULT_HN_SOURCE.includeShowHN).toBe(true);
    expect(DEFAULT_HN_SOURCE.includeJobs).toBe(false);
  });

  it("should have valid URL", () => {
    expect(() => new URL(DEFAULT_HN_SOURCE.url)).not.toThrow();
    expect(DEFAULT_HN_SOURCE.url).toContain("hacker-news.firebaseio.com");
  });

  it("should have reasonable timeout", () => {
    expect(DEFAULT_HN_SOURCE.timeout).toBeGreaterThan(0);
    expect(DEFAULT_HN_SOURCE.timeout).toBeLessThanOrEqual(60000);
  });

  it("should have retry attempts configured", () => {
    expect(DEFAULT_HN_SOURCE.retryAttempts).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_HN_SOURCE.retryAttempts).toBeLessThanOrEqual(5);
  });
});
