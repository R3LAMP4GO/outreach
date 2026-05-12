// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — partial Supabase mocks cause type mismatches
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SourceErrorCode } from "../../../types/article";
import type { RedditSourceConfig, RedditResponse } from "../reddit";

// Mock the rate limiter module to remove all delays in tests.
// The real redditRateLimiter has minTime: 4000 which causes test timeouts.
vi.mock("../../../lib/rate-limiter", () => {
  const Bottleneck = require("bottleneck");
  const noopLimiter = new Bottleneck({ maxConcurrent: null, minTime: 0 });
  return {
    createRateLimiter: () => noopLimiter,
    rssRateLimiter: noopLimiter,
    withRateLimit: (fn: unknown) => fn,
  };
});

import { RedditSource, fetchMultipleRedditSources, DEFAULT_REDDIT_SOURCES } from "../reddit";

// Mock fetch API
vi.stubGlobal("fetch", vi.fn());

// Helper to create mock Reddit response
const createMockRedditResponse = (posts: Record<string, unknown>[]): RedditResponse => ({
  kind: "Listing",
  data: {
    children: posts.map((post) => {
      const id = post.id || "test123";
      const subreddit = post.subreddit || "Entrepreneur";
      return {
        data: {
          id,
          title: post.title || "Test Post",
          url: post.url || "https://example.com",
          selftext: post.selftext || "",
          selftext_html: post.selftext_html || null,
          author: post.author || "testuser",
          created_utc: post.created_utc || Math.floor(Date.now() / 1000),
          subreddit,
          permalink: post.permalink || `/r/${subreddit}/comments/${id}/test_post/`,
          score: post.score || 100,
          ups: post.ups || 100,
          num_comments: post.num_comments || 10,
          total_awards_received: post.total_awards_received || 2,
          is_self: post.is_self !== undefined ? post.is_self : true,
          domain: post.domain || `self.${subreddit}`,
          over_18: post.over_18 || false,
          stickied: post.stickied || false,
          distinguished: post.distinguished || null,
          link_flair_text: post.link_flair_text || null,
          thumbnail: post.thumbnail || "",
          preview: post.preview,
        },
      };
    }),
    after: null,
    before: null,
  },
});

describe("RedditSource", () => {
  let validConfig: RedditSourceConfig;

  beforeEach(() => {
    validConfig = {
      name: "Test Reddit Source",
      url: "https://www.reddit.com/r/Entrepreneur",
      type: "reddit",
      enabled: true,
      timeout: 10000,
      retryAttempts: 0, // No retries in tests for speed
      subreddits: ["Entrepreneur"],
      timeframe: "week",
      maxArticles: 25,
      minUpvotes: 10,
      minComments: 3,
    };

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchArticles", () => {
    it("should successfully fetch and parse Reddit posts", async () => {
      const mockResponse = createMockRedditResponse([
        {
          id: "post1",
          title: "Best startup advice",
          selftext: "This is some great advice about startups",
          ups: 250,
          num_comments: 45,
          total_awards_received: 5,
        },
        {
          id: "post2",
          title: "How I built my SaaS",
          selftext: "Here is my story about building a SaaS product",
          ups: 180,
          num_comments: 32,
          total_awards_received: 3,
        },
      ]);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      const source = new RedditSource(validConfig);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(2);
      expect(result.articles[0]).toMatchObject({
        id: "reddit:post1",
        title: "Best startup advice",
        source: "reddit:Entrepreneur",
        engagement: {
          upvotes: 250,
          comments: 45,
          shares: 5,
        },
      });
      expect(result.metadata.articleCount).toBe(2);
      expect(result.metadata.duration).toBeGreaterThan(0);
    });

    it("should fetch from multiple subreddits", async () => {
      const config: RedditSourceConfig = {
        ...validConfig,
        subreddits: ["Entrepreneur", "startups"],
      };

      const mockResponse1 = createMockRedditResponse([
        {
          id: "post1",
          title: "Post from Entrepreneur",
          subreddit: "Entrepreneur",
          ups: 100,
          num_comments: 10,
        },
      ]);

      const mockResponse2 = createMockRedditResponse([
        {
          id: "post2",
          title: "Post from startups",
          subreddit: "startups",
          ups: 150,
          num_comments: 20,
        },
      ]);

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse1,
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse2,
          headers: new Headers(),
        });

      const source = new RedditSource(config);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(2);
      expect(result.articles[0].source).toBe("reddit:Entrepreneur");
      expect(result.articles[1].source).toBe("reddit:startups");
    });

    it("should filter posts below minimum upvotes", async () => {
      const mockResponse = createMockRedditResponse([
        { id: "post1", title: "Popular post", ups: 100, num_comments: 10 },
        { id: "post2", title: "Unpopular post", ups: 5, num_comments: 10 }, // Below minUpvotes (10)
      ]);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      const source = new RedditSource(validConfig);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].id).toBe("reddit:post1");
    });

    it("should filter posts below minimum comments", async () => {
      const mockResponse = createMockRedditResponse([
        { id: "post1", title: "Post with comments", ups: 100, num_comments: 10 },
        { id: "post2", title: "Post without comments", ups: 100, num_comments: 1 }, // Below minComments (3)
      ]);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      const source = new RedditSource(validConfig);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].id).toBe("reddit:post1");
    });

    it("should filter out stickied posts", async () => {
      const mockResponse = createMockRedditResponse([
        { id: "post1", title: "Normal post", ups: 100, num_comments: 10, stickied: false },
        { id: "post2", title: "Stickied announcement", ups: 100, num_comments: 10, stickied: true },
      ]);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      const source = new RedditSource(validConfig);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].id).toBe("reddit:post1");
    });

    it("should filter out distinguished posts", async () => {
      const mockResponse = createMockRedditResponse([
        { id: "post1", title: "User post", ups: 100, num_comments: 10, distinguished: null },
        { id: "post2", title: "Mod post", ups: 100, num_comments: 10, distinguished: "moderator" },
      ]);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      const source = new RedditSource(validConfig);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].id).toBe("reddit:post1");
    });

    it("should filter out NSFW content", async () => {
      const mockResponse = createMockRedditResponse([
        { id: "post1", title: "Safe post", ups: 100, num_comments: 10, over_18: false },
        { id: "post2", title: "NSFW post", ups: 100, num_comments: 10, over_18: true },
      ]);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      const source = new RedditSource(validConfig);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].id).toBe("reddit:post1");
    });

    it("should filter out spam domains", async () => {
      const mockResponse = createMockRedditResponse([
        {
          id: "post1",
          title: "Article post",
          ups: 100,
          num_comments: 10,
          domain: "techcrunch.com",
          is_self: false,
        },
        {
          id: "post2",
          title: "YouTube spam",
          ups: 100,
          num_comments: 10,
          domain: "youtube.com",
          is_self: false,
        },
      ]);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      const source = new RedditSource(validConfig);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].id).toBe("reddit:post1");
    });

    it("should handle link posts vs self posts", async () => {
      const mockResponse = createMockRedditResponse([
        {
          id: "post1",
          title: "Self post",
          selftext: "This is a text post",
          is_self: true,
          permalink: "/r/Entrepreneur/comments/post1/self_post/",
          ups: 100,
          num_comments: 10,
        },
        {
          id: "post2",
          title: "Link post",
          url: "https://example.com/article",
          is_self: false,
          permalink: "/r/Entrepreneur/comments/post2/link_post/",
          ups: 100,
          num_comments: 10,
        },
      ]);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      const source = new RedditSource(validConfig);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(2);

      // Self post should have Reddit URL
      expect(result.articles[0].url).toBe(
        "https://www.reddit.com/r/Entrepreneur/comments/post1/self_post/",
      );
      expect(result.articles[0].content).toBe("This is a text post");

      // Link post should have external URL
      expect(result.articles[1].url).toBe("https://example.com/article");
      expect(result.articles[1].content).toBe("Link post"); // Title as content for link posts
    });

    it("should extract image URLs from preview", async () => {
      const mockResponse = createMockRedditResponse([
        {
          id: "post1",
          title: "Post with image",
          ups: 100,
          num_comments: 10,
          preview: {
            images: [
              {
                source: {
                  url: "https://preview.redd.it/image.jpg?width=640&amp;height=480",
                  width: 640,
                  height: 480,
                },
              },
            ],
          },
        },
      ]);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      const source = new RedditSource(validConfig);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].metadata?.imageUrl).toBe(
        "https://preview.redd.it/image.jpg?width=640&height=480",
      );
    });

    it("should handle rate limit errors (429)", async () => {
      const headers = new Headers();
      headers.set("retry-after", "60");

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers,
      });

      const source = new RedditSource(validConfig);
      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.RATE_LIMIT);
      expect(result.error?.message).toContain("Rate limited");
    });

    it("should handle 404 errors", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: new Headers(),
      });

      const source = new RedditSource(validConfig);
      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.INVALID_URL);
    });

    it("should handle network errors", async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));

      const source = new RedditSource(validConfig);
      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.NETWORK_ERROR);
    });

    it("should handle timeout errors", async () => {
      const timeoutError = new Error("The operation was aborted");
      timeoutError.name = "TimeoutError";

      vi.mocked(global.fetch).mockRejectedValueOnce(timeoutError);

      const source = new RedditSource(validConfig);
      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.TIMEOUT);
    });

    it("should handle empty subreddit responses", async () => {
      const mockResponse = createMockRedditResponse([]);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      const source = new RedditSource(validConfig);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(0);
    });

    it("should sanitize text content", async () => {
      const mockResponse = createMockRedditResponse([
        {
          id: "post1",
          title: "Test   with   spaces",
          selftext: "Text with &gt; quotes &amp; entities &lt;",
          ups: 100,
          num_comments: 10,
        },
      ]);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      const source = new RedditSource(validConfig);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles[0].title).toBe("Test with spaces");
      expect(result.articles[0].content).toBe("Text with > quotes & entities <");
    });

    it("should include engagement metrics", async () => {
      const mockResponse = createMockRedditResponse([
        {
          id: "post1",
          title: "Popular post",
          ups: 500,
          num_comments: 150,
          total_awards_received: 25,
        },
      ]);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      const source = new RedditSource(validConfig);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles[0].engagement).toEqual({
        upvotes: 500,
        comments: 150,
        shares: 25,
      });
    });

    it("should include metadata", async () => {
      const mockResponse = createMockRedditResponse([
        {
          id: "post1",
          title: "Test post",
          subreddit: "Entrepreneur",
          permalink: "/r/Entrepreneur/comments/test/test_post/",
          domain: "self.Entrepreneur",
          is_self: true,
          link_flair_text: "Discussion",
          score: 100,
          ups: 100,
          num_comments: 10,
        },
      ]);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      const source = new RedditSource(validConfig);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles[0].metadata).toMatchObject({
        subreddit: "Entrepreneur",
        permalink: "/r/Entrepreneur/comments/test/test_post/",
        domain: "self.Entrepreneur",
        isTextPost: true,
        flair: "Discussion",
        score: 100,
      });
    });

    it("should continue with other subreddits if one fails", async () => {
      const config: RedditSourceConfig = {
        ...validConfig,
        subreddits: ["Entrepreneur", "InvalidSub", "startups"],
      };

      const mockResponse1 = createMockRedditResponse([
        { id: "post1", title: "Post 1", subreddit: "Entrepreneur", ups: 100, num_comments: 10 },
      ]);

      const mockResponse3 = createMockRedditResponse([
        { id: "post3", title: "Post 3", subreddit: "startups", ups: 100, num_comments: 10 },
      ]);

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse1,
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: "Not Found",
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse3,
          headers: new Headers(),
        });

      const source = new RedditSource(config);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(2);
      expect(result.articles[0].source).toBe("reddit:Entrepreneur");
      expect(result.articles[1].source).toBe("reddit:startups");
    });
  });

  describe("BaseSource functionality", () => {
    it("should return source name", () => {
      const source = new RedditSource(validConfig);
      expect(source.getName()).toBe("Test Reddit Source");
    });

    it("should return enabled status", () => {
      const source = new RedditSource(validConfig);
      expect(source.isEnabled()).toBe(true);

      const disabledConfig = { ...validConfig, enabled: false };
      const disabledSource = new RedditSource(disabledConfig);
      expect(disabledSource.isEnabled()).toBe(false);
    });
  });

  describe("default configuration", () => {
    it("should use default subreddits if not provided", () => {
      const config: RedditSourceConfig = {
        name: "Test",
        url: "https://www.reddit.com/r/Entrepreneur",
        type: "reddit",
        enabled: true,
        timeout: 10000,
        retryAttempts: 2,
      };

      const mockResponse = createMockRedditResponse([{ id: "post1", ups: 100, num_comments: 10 }]);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Map(),
      });

      const source = new RedditSource(config);

      // Should use default subreddits
      expect((source as unknown as Record<string, unknown>).subreddits).toEqual([
        "Entrepreneur",
        "startups",
        "SaaS",
        "smallbusiness",
      ]);
    });

    it("should use default filters if not provided", () => {
      const config: RedditSourceConfig = {
        name: "Test",
        url: "https://www.reddit.com/r/Entrepreneur",
        type: "reddit",
        enabled: true,
        timeout: 10000,
        retryAttempts: 2,
      };

      const source = new RedditSource(config);

      expect((source as unknown as Record<string, unknown>).minUpvotes).toBe(10);
      expect((source as unknown as Record<string, unknown>).minComments).toBe(3);
      expect((source as unknown as Record<string, unknown>).timeframe).toBe("week");
    });
  });
});

describe("fetchMultipleRedditSources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch multiple Reddit sources in parallel", async () => {
    const configs: RedditSourceConfig[] = [
      {
        name: "Source 1",
        url: "https://www.reddit.com/r/Entrepreneur",
        type: "reddit",
        enabled: true,
        timeout: 10000,
        retryAttempts: 2,
        subreddits: ["Entrepreneur"],
      },
      {
        name: "Source 2",
        url: "https://www.reddit.com/r/startups",
        type: "reddit",
        enabled: true,
        timeout: 10000,
        retryAttempts: 2,
        subreddits: ["startups"],
      },
    ];

    const mockResponse = createMockRedditResponse([{ id: "post1", ups: 100, num_comments: 10 }]);

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
      headers: new Map(),
    });

    const results = await fetchMultipleRedditSources(configs);

    expect(results.size).toBe(2);
    expect(results.get("Source 1")).toHaveLength(1);
    expect(results.get("Source 2")).toHaveLength(1);
  });

  it("should handle partial failures gracefully", async () => {
    const configs: RedditSourceConfig[] = [
      {
        name: "Valid Source",
        url: "https://www.reddit.com/r/Entrepreneur",
        type: "reddit",
        enabled: true,
        timeout: 10000,
        retryAttempts: 0,
        subreddits: ["Entrepreneur"],
      },
      {
        name: "Invalid Source",
        url: "https://www.reddit.com/r/InvalidSub",
        type: "reddit",
        enabled: true,
        timeout: 10000,
        retryAttempts: 0,
        subreddits: ["InvalidSub"],
      },
    ];

    const mockResponse = createMockRedditResponse([{ id: "post1", ups: 100, num_comments: 10 }]);

    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: new Headers(),
      });

    const results = await fetchMultipleRedditSources(configs);

    expect(results.size).toBe(2);
    expect(results.get("Valid Source")).toHaveLength(1);
    expect(results.get("Invalid Source")).toHaveLength(0); // Empty array on failure
  });

  it("should skip disabled sources", async () => {
    const configs: RedditSourceConfig[] = [
      {
        name: "Enabled Source",
        url: "https://www.reddit.com/r/Entrepreneur",
        type: "reddit",
        enabled: true,
        timeout: 10000,
        retryAttempts: 2,
        subreddits: ["Entrepreneur"],
      },
      {
        name: "Disabled Source",
        url: "https://www.reddit.com/r/startups",
        type: "reddit",
        enabled: false,
        timeout: 10000,
        retryAttempts: 2,
        subreddits: ["startups"],
      },
    ];

    const mockResponse = createMockRedditResponse([{ id: "post1", ups: 100, num_comments: 10 }]);

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
      headers: new Map(),
    });

    const results = await fetchMultipleRedditSources(configs);

    expect(results.size).toBe(1);
    expect(results.has("Enabled Source")).toBe(true);
    expect(results.has("Disabled Source")).toBe(false);
  });
});

describe("DEFAULT_REDDIT_SOURCES", () => {
  it("should have 5 pre-configured sources", () => {
    expect(DEFAULT_REDDIT_SOURCES).toHaveLength(5);
  });

  it("should have all required fields", () => {
    DEFAULT_REDDIT_SOURCES.forEach((source) => {
      expect(source.name).toBeTruthy();
      expect(source.url).toBeTruthy();
      expect(source.type).toBe("reddit");
      expect(source.enabled).toBe(true);
      expect(source.timeout).toBeGreaterThan(0);
      expect(source.retryAttempts).toBeGreaterThanOrEqual(0);
      expect(source.subreddits).toBeDefined();
      expect(source.subreddits!.length).toBeGreaterThan(0);
    });
  });

  it("should have valid URLs", () => {
    DEFAULT_REDDIT_SOURCES.forEach((source) => {
      expect(() => new URL(source.url)).not.toThrow();
      expect(source.url).toContain("reddit.com");
    });
  });

  it("should include all specified sources", () => {
    const sourceNames = DEFAULT_REDDIT_SOURCES.map((s) => s.name);

    expect(sourceNames).toContain("Reddit Entrepreneur");
    expect(sourceNames).toContain("Reddit Startups");
    expect(sourceNames).toContain("Reddit SaaS");
    expect(sourceNames).toContain("Reddit Small Business");
  });

  it("should have appropriate filtering thresholds", () => {
    DEFAULT_REDDIT_SOURCES.forEach((source) => {
      expect(source.minUpvotes).toBeGreaterThan(0);
      expect(source.minComments).toBeGreaterThan(0);
      expect(["hour", "day", "week", "month", "year", "all"]).toContain(source.timeframe!);
    });
  });
});
