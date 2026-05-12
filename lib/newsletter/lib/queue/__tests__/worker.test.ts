/**
 * Job Processor Tests
 *
 * Tests that job processors work correctly as plain async functions
 * (no longer dependent on BullMQ Job wrapper).
 */

import { describe, it, expect, vi } from "vitest";

// Mock the logger
vi.mock("../../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock source modules
vi.mock("../../../modules/orchestrator/multi-source-fetcher", () => ({
  MultiSourceFetcher: class {
    fetchAll = vi.fn().mockResolvedValue({
      articles: [
        {
          id: "article-1",
          title: "Test Article",
          url: "https://example.com/article",
          content: "This is a test article with enough content to pass filters.",
          source: "rss",
          publishedAt: new Date(),
          status: "processed",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      errors: [],
    });
  },
}));

vi.mock("../../../modules/processing/scorer", () => ({
  ArticleScorer: class {
    scoreArticle(article: Record<string, unknown>) {
      return { ...article, scores: { final: 0.85 } };
    }
  },
}));

vi.mock("../../../modules/processing/filter", () => ({
  ArticleFilter: class {
    async filterArticles(articles: unknown[]) {
      return { passed: articles, failed: [] };
    }
  },
}));

// Mock source classes - they just need to be constructible objects
vi.mock("../../../modules/sources/base-source", () => ({
  BaseSource: class {},
}));
vi.mock("../../../modules/sources/rss", () => ({
  RSSSource: class {
    name = "mock-rss";
  },
}));
vi.mock("../../../modules/sources/reddit", () => ({
  RedditSource: class {
    name = "mock-reddit";
  },
}));
vi.mock("../../../modules/sources/hackernews", () => ({
  HackerNewsSource: class {
    name = "mock-hackernews";
  },
}));

describe("Job Processors", () => {
  describe("processCurateJob", () => {
    it("should accept plain data object and return result", async () => {
      const { processCurateJob } = await import("../jobs/curate-job");

      const result = await processCurateJob({
        campaignId: "campaign-123",
        sources: ["rss"],
        maxArticles: 10,
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.articles).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("should return error when no valid sources configured", async () => {
      const { processCurateJob } = await import("../jobs/curate-job");

      const result = await processCurateJob({
        campaignId: "campaign-123",
        sources: ["invalid-source"],
        maxArticles: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("No valid sources configured");
    });
  });

  describe("processCleanupJob", () => {
    it("should accept plain data object and return result", async () => {
      const { processCleanupJob } = await import("../jobs/cleanup-job");

      const result = await processCleanupJob({
        olderThan: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        types: ["articles", "newsletters"],
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.deleted).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
