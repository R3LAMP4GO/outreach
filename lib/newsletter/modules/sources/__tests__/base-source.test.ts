import { describe, it, expect, beforeEach } from "vitest";
import { BaseSource } from "../base-source";
import { Article, SourceConfig, SourceError, SourceErrorCode } from "../../../types/article";

// Create a concrete implementation for testing
class TestSource extends BaseSource {
  public fetchCount = 0;
  public shouldFail = false;
  public failureType: SourceErrorCode = SourceErrorCode.NETWORK_ERROR;
  public delay = 0;
  public mockImplementation?: () => Promise<Article[]>;

  protected async fetchArticlesImpl(): Promise<Article[]> {
    this.fetchCount++;

    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }

    if (this.mockImplementation) {
      return this.mockImplementation();
    }

    if (this.shouldFail) {
      throw new SourceError("Test error", this.failureType, this.config.name);
    }

    return [
      {
        id: "test-article-1",
        title: "Test Article",
        url: "https://example.com/article",
        publishedAt: new Date("2024-01-15T10:00:00Z"),
        content: "Test content",
        source: `${this.config.type}:${this.config.name}`,
        status: "pending" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  }
}

describe("BaseSource", () => {
  let config: SourceConfig;

  beforeEach(() => {
    config = {
      name: "Test Source",
      url: "https://example.com/feed",
      type: "rss",
      enabled: true,
      maxArticles: 10,
      timeout: 5000,
      retryAttempts: 2,
    };
  });

  describe("fetchArticles", () => {
    it("should successfully fetch articles", async () => {
      const source = new TestSource(config);
      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.source).toBe("Test Source");
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].title).toBe("Test Article");
      expect(result.metadata.articleCount).toBe(1);
      expect(result.metadata.duration).toBeGreaterThan(0);
      expect(result.metadata.fetchedAt).toBeInstanceOf(Date);
    });

    it("should handle errors and return failed result", async () => {
      const source = new TestSource(config);
      source.shouldFail = true;

      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.source).toBe("Test Source");
      expect(result.articles).toHaveLength(0);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe("Test error");
      expect(result.error?.code).toBe(SourceErrorCode.NETWORK_ERROR);
      expect(result.metadata.articleCount).toBe(0);
    }, 15000);

    it("should include error details in failed result", async () => {
      const source = new TestSource(config);
      source.shouldFail = true;
      source.failureType = SourceErrorCode.TIMEOUT;

      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.TIMEOUT);
      expect(result.error?.stack).toBeDefined();
    }, 15000);
  });

  describe("retry logic", () => {
    it("should retry on transient failures", async () => {
      const source = new TestSource(config);
      let callCount = 0;

      source.mockImplementation = async () => {
        callCount++;
        if (callCount < 3) {
          throw new SourceError("Transient error", SourceErrorCode.NETWORK_ERROR, config.name);
        }
        return [
          {
            id: "success-article-1",
            title: "Success Article",
            url: "https://example.com/success",
            publishedAt: new Date(),
            content: "Success content",
            source: `${config.type}:${config.name}`,
            status: "pending" as const,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];
      };

      const result = await source.fetchArticles();

      expect(callCount).toBe(3); // Initial + 2 retries
      expect(result.success).toBe(true);
      expect(result.articles[0].title).toBe("Success Article");
    }, 15000);

    it("should not retry on invalid URL errors", async () => {
      const source = new TestSource(config);
      source.shouldFail = true;
      source.failureType = SourceErrorCode.INVALID_URL;

      const result = await source.fetchArticles();

      expect(source.fetchCount).toBe(1); // No retries
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.INVALID_URL);
    });

    it("should not retry on auth errors", async () => {
      const source = new TestSource(config);
      source.shouldFail = true;
      source.failureType = SourceErrorCode.AUTH_ERROR;

      const result = await source.fetchArticles();

      expect(source.fetchCount).toBe(1); // No retries
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.AUTH_ERROR);
    }, 15000);

    it("should not retry on invalid feed errors", async () => {
      const source = new TestSource(config);
      source.shouldFail = true;
      source.failureType = SourceErrorCode.INVALID_FEED;

      const result = await source.fetchArticles();

      expect(source.fetchCount).toBe(1); // No retries
      expect(result.success).toBe(false);
    }, 15000);

    it("should fail after max retries", async () => {
      const source = new TestSource(config);
      source.shouldFail = true;
      source.failureType = SourceErrorCode.NETWORK_ERROR;

      const result = await source.fetchArticles();

      expect(source.fetchCount).toBe(3); // Initial + 2 retries
      expect(result.success).toBe(false);
    }, 15000);
  });

  describe("timeout handling", () => {
    it("should timeout long-running fetches", async () => {
      const source = new TestSource({
        ...config,
        timeout: 100,
      });
      source.delay = 5000; // 5 seconds

      const result = await source.fetchArticles();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SourceErrorCode.TIMEOUT);
      expect(result.error?.message).toContain("timeout");
    }, 10000);

    it("should complete before timeout", async () => {
      const source = new TestSource({
        ...config,
        timeout: 5000,
      });
      source.delay = 10; // 10ms

      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
    });
  });

  describe("article filtering", () => {
    it("should remove duplicate articles by url", async () => {
      const source = new TestSource(config);
      source.mockImplementation = async () => [
        {
          id: "article-1",
          title: "Article 1",
          url: "https://example.com/same",
          publishedAt: new Date(),
          content: "Content 1",
          source: `${config.type}:${config.name}`,
          status: "pending" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "article-2",
          title: "Article 2",
          url: "https://example.com/same", // Duplicate URL
          publishedAt: new Date(),
          content: "Content 2",
          source: `${config.type}:${config.name}`,
          status: "pending" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "article-3",
          title: "Article 3",
          url: "https://example.com/different",
          publishedAt: new Date(),
          content: "Content 3",
          source: `${config.type}:${config.name}`,
          status: "pending" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(2); // Duplicates removed
    }, 15000);

    it("should limit articles to maxArticles", async () => {
      const source = new TestSource({
        ...config,
        maxArticles: 2,
      });

      source.mockImplementation = async () => [
        {
          id: "article-1",
          title: "Article 1",
          url: "https://example.com/1",
          publishedAt: new Date(),
          content: "Content 1",
          source: `${config.type}:${config.name}`,
          status: "pending" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "article-2",
          title: "Article 2",
          url: "https://example.com/2",
          publishedAt: new Date(),
          content: "Content 2",
          source: `${config.type}:${config.name}`,
          status: "pending" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "article-3",
          title: "Article 3",
          url: "https://example.com/3",
          publishedAt: new Date(),
          content: "Content 3",
          source: `${config.type}:${config.name}`,
          status: "pending" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(2);
    }, 15000);

    it("should not limit when maxArticles is not set", async () => {
      const source = new TestSource({
        ...config,
        maxArticles: undefined,
      });

      source.mockImplementation = async () =>
        Array.from({ length: 20 }, (_, i) => ({
          id: `article-${i}`,
          title: `Article ${i}`,
          url: `https://example.com/${i}`,
          publishedAt: new Date(),
          content: `Content ${i}`,
          source: `${config.type}:${config.name}`,
          status: "pending" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

      const result = await source.fetchArticles();

      expect(result.success).toBe(true);
      expect(result.articles).toHaveLength(20);
    }, 15000);
  });

  describe("validation", () => {
    it("should validate articles have required fields", () => {
      const source = new TestSource(config);

      const validArticle: Partial<Article> = {
        title: "Valid Article",
        url: "https://example.com/valid",
        publishedAt: new Date(),
      };

      expect(source["validateArticle"](validArticle)).toBe(true);
    });

    it("should reject articles missing title", () => {
      const source = new TestSource(config);

      const invalidArticle: Partial<Article> = {
        url: "https://example.com/valid",
        publishedAt: new Date(),
      };

      expect(source["validateArticle"](invalidArticle)).toBe(false);
    });

    it("should reject articles missing url", () => {
      const source = new TestSource(config);

      const invalidArticle: Partial<Article> = {
        title: "Valid Title",
        publishedAt: new Date(),
      };

      expect(source["validateArticle"](invalidArticle)).toBe(false);
    });

    it("should reject articles missing publishedAt", () => {
      const source = new TestSource(config);

      const invalidArticle: Partial<Article> = {
        title: "Valid Title",
        url: "https://example.com/valid",
      };

      expect(source["validateArticle"](invalidArticle)).toBe(false);
    });
  });

  describe("source properties", () => {
    it("should return correct source name", () => {
      const source = new TestSource(config);
      expect(source.getName()).toBe("Test Source");
    });

    it("should return enabled status", () => {
      const enabledSource = new TestSource(config);
      expect(enabledSource.isEnabled()).toBe(true);

      const disabledSource = new TestSource({ ...config, enabled: false });
      expect(disabledSource.isEnabled()).toBe(false);
    });
  });

  describe("metadata", () => {
    it("should include fetch duration in metadata", async () => {
      const source = new TestSource(config);
      source.delay = 50;

      const result = await source.fetchArticles();

      expect(result.metadata.duration).toBeGreaterThanOrEqual(50);
    }, 15000);

    it("should include correct article count", async () => {
      const source = new TestSource(config);
      source.mockImplementation = async () =>
        Array.from({ length: 5 }, (_, i) => ({
          id: `article-${i}`,
          title: `Article ${i}`,
          url: `https://example.com/${i}`,
          publishedAt: new Date(),
          content: `Content ${i}`,
          source: `${config.type}:${config.name}`,
          status: "pending" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

      const result = await source.fetchArticles();

      expect(result.metadata.articleCount).toBe(5);
    }, 15000);

    it("should include fetchedAt timestamp", async () => {
      const before = new Date();
      const source = new TestSource(config);
      const result = await source.fetchArticles();
      const after = new Date();

      expect(result.metadata.fetchedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.metadata.fetchedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    }, 15000);
  });
});
