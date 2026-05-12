/**
 * Tests for SummaryCache
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SummaryCache } from "../cache";
import type { EnrichedArticle } from "../../../types/summarizer";

describe("SummaryCache", () => {
  let cache: SummaryCache;

  const mockEnrichedArticle: EnrichedArticle = {
    article: {
      id: "test-1",
      title: "Test Article",
      content:
        "This is test content for the cache system to validate proper storage and retrieval.",
      url: "https://example.com/test",
      publishedAt: new Date("2024-01-15"),
    },
    summary: "Test summary",
    keyInsights: ["Insight 1", "Insight 2", "Insight 3"],
    metadata: {
      processedAt: new Date(),
      model: "claude-3-5-sonnet-20241022",
      tokensUsed: 500,
      processingTimeMs: 1000,
      fromCache: false,
    },
  };

  beforeEach(() => {
    cache = new SummaryCache(60); // 60 second TTL for testing
  });

  afterEach(() => {
    cache.destroy();
  });

  describe("set() and get()", () => {
    it("should store and retrieve an article", () => {
      cache.set(mockEnrichedArticle);

      const retrieved = cache.get(
        mockEnrichedArticle.article.url,
        mockEnrichedArticle.article.content,
      );

      expect(retrieved).toBeDefined();
      expect(retrieved?.article.id).toBe(mockEnrichedArticle.article.id);
      expect(retrieved?.summary).toBe(mockEnrichedArticle.summary);
      expect(retrieved?.metadata.fromCache).toBe(true);
    });

    it("should return null for non-existent entries", () => {
      const retrieved = cache.get("https://nonexistent.com", "content");
      expect(retrieved).toBeNull();
    });

    it("should increment hit count on repeated retrievals", () => {
      cache.set(mockEnrichedArticle);

      // First retrieval
      cache.get(mockEnrichedArticle.article.url, mockEnrichedArticle.article.content);
      let stats = cache.getStats();
      expect(stats.totalHits).toBe(1);

      // Second retrieval
      cache.get(mockEnrichedArticle.article.url, mockEnrichedArticle.article.content);
      stats = cache.getStats();
      expect(stats.totalHits).toBe(2);

      // Third retrieval
      cache.get(mockEnrichedArticle.article.url, mockEnrichedArticle.article.content);
      stats = cache.getStats();
      expect(stats.totalHits).toBe(3);
    });

    it("should handle different articles with same URL but different content", () => {
      const article1 = mockEnrichedArticle;
      const article2 = {
        ...mockEnrichedArticle,
        article: {
          ...mockEnrichedArticle.article,
          content: "Completely different content that should generate a different cache key",
        },
        summary: "Different summary",
      };

      cache.set(article1);
      cache.set(article2);

      const retrieved1 = cache.get(article1.article.url, article1.article.content);
      const retrieved2 = cache.get(article2.article.url, article2.article.content);

      expect(retrieved1?.summary).toBe("Test summary");
      expect(retrieved2?.summary).toBe("Different summary");
    });
  });

  describe("has()", () => {
    it("should return true for existing entries", () => {
      cache.set(mockEnrichedArticle);

      const exists = cache.has(
        mockEnrichedArticle.article.url,
        mockEnrichedArticle.article.content,
      );

      expect(exists).toBe(true);
    });

    it("should return false for non-existent entries", () => {
      const exists = cache.has("https://nonexistent.com", "content");
      expect(exists).toBe(false);
    });

    it("should not increment hit count", () => {
      cache.set(mockEnrichedArticle);

      cache.has(mockEnrichedArticle.article.url, mockEnrichedArticle.article.content);

      const stats = cache.getStats();
      expect(stats.totalHits).toBe(0); // has() should not count as a hit
    });
  });

  describe("delete()", () => {
    it("should delete an entry", () => {
      cache.set(mockEnrichedArticle);

      const deleted = cache.delete(
        mockEnrichedArticle.article.url,
        mockEnrichedArticle.article.content,
      );

      expect(deleted).toBe(true);

      const retrieved = cache.get(
        mockEnrichedArticle.article.url,
        mockEnrichedArticle.article.content,
      );

      expect(retrieved).toBeNull();
    });

    it("should return false for non-existent entries", () => {
      const deleted = cache.delete("https://nonexistent.com", "content");
      expect(deleted).toBe(false);
    });
  });

  describe("clear()", () => {
    it("should clear all entries", () => {
      cache.set(mockEnrichedArticle);
      cache.set({
        ...mockEnrichedArticle,
        article: {
          ...mockEnrichedArticle.article,
          id: "test-2",
          url: "https://example.com/test-2",
        },
      });

      expect(cache.getStats().size).toBe(2);

      cache.clear();

      expect(cache.getStats().size).toBe(0);
    });
  });

  describe("TTL and expiration", () => {
    it("should expire entries after TTL", async () => {
      // Create cache with 100ms TTL
      const shortCache = new SummaryCache(0.1); // 0.1 seconds = 100ms

      shortCache.set(mockEnrichedArticle);

      // Should exist immediately
      let retrieved = shortCache.get(
        mockEnrichedArticle.article.url,
        mockEnrichedArticle.article.content,
      );
      expect(retrieved).toBeDefined();

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be expired now
      retrieved = shortCache.get(
        mockEnrichedArticle.article.url,
        mockEnrichedArticle.article.content,
      );
      expect(retrieved).toBeNull();

      shortCache.destroy();
    });

    it("should remove expired entries on has() check", async () => {
      const shortCache = new SummaryCache(0.1);

      shortCache.set(mockEnrichedArticle);

      // Should exist
      expect(
        shortCache.has(mockEnrichedArticle.article.url, mockEnrichedArticle.article.content),
      ).toBe(true);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be expired
      expect(
        shortCache.has(mockEnrichedArticle.article.url, mockEnrichedArticle.article.content),
      ).toBe(false);

      shortCache.destroy();
    });
  });

  describe("getStats()", () => {
    it("should return accurate statistics", () => {
      const article1 = mockEnrichedArticle;
      const article2 = {
        ...mockEnrichedArticle,
        article: {
          ...mockEnrichedArticle.article,
          id: "test-2",
          url: "https://example.com/test-2",
        },
      };

      cache.set(article1);
      cache.set(article2);

      // Hit first article twice
      cache.get(article1.article.url, article1.article.content);
      cache.get(article1.article.url, article1.article.content);

      // Hit second article once
      cache.get(article2.article.url, article2.article.content);

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.totalHits).toBe(3);
      expect(stats.entries).toHaveLength(2);

      // Entries should be sorted by hits (descending)
      expect(stats.entries[0].hits).toBe(2);
      expect(stats.entries[1].hits).toBe(1);
    });

    it("should return empty stats for empty cache", () => {
      const stats = cache.getStats();

      expect(stats.size).toBe(0);
      expect(stats.totalHits).toBe(0);
      expect(stats.entries).toHaveLength(0);
    });
  });

  describe("Cache key generation", () => {
    it("should generate same key for same URL and content", () => {
      cache.set(mockEnrichedArticle);
      cache.set(mockEnrichedArticle); // Set again

      const stats = cache.getStats();
      expect(stats.size).toBe(1); // Should only have one entry
    });

    it("should generate different keys for different content", () => {
      const article1 = mockEnrichedArticle;
      const article2 = {
        ...mockEnrichedArticle,
        article: {
          ...mockEnrichedArticle.article,
          content: "Different content",
        },
      };

      cache.set(article1);
      cache.set(article2);

      const stats = cache.getStats();
      expect(stats.size).toBe(2); // Should have two entries
    });
  });

  describe("destroy()", () => {
    it("should clear cache and stop cleanup interval", () => {
      cache.set(mockEnrichedArticle);

      expect(cache.getStats().size).toBe(1);

      cache.destroy();

      expect(cache.getStats().size).toBe(0);
    });
  });
});
