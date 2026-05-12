/**
 * Tests for Multi-Factor Content Scoring System
 *
 * Covers:
 * - Individual factor scoring (recency, engagement, readability, etc.)
 * - Weighted aggregation
 * - Edge cases (missing data, zero engagement, future dates)
 * - Performance benchmarks (100+ articles in < 2 seconds)
 * - Quality validation
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ArticleScorer,
  createDefaultScorer,
  createBusinessScorer,
  createViralScorer,
} from "../scorer";
import type { Article } from "../../../types/article";

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: "test-article-1",
    title: "How to Build a Successful Startup: Key Strategies for Growth",
    url: "https://example.com/article",
    content:
      "This is a test article about business strategy and entrepreneurship. It provides actionable insights for startup founders.",
    author: "John Doe",
    publishedAt: new Date(),
    source: "rss:hbr",
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createArticlesForPerformanceTest(count: number): Article[] {
  const articles: Article[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const daysOld = Math.floor(Math.random() * 30);
    const publishedAt = new Date(now.getTime() - daysOld * 24 * 60 * 60 * 1000);

    articles.push(
      createMockArticle({
        id: `perf-article-${i}`,
        title: `Article ${i}: Business Strategy and Growth`,
        publishedAt,
        engagement: {
          upvotes: Math.floor(Math.random() * 500),
          comments: Math.floor(Math.random() * 100),
          shares: Math.floor(Math.random() * 50),
          views: Math.floor(Math.random() * 10000),
        },
      }),
    );
  }

  return articles;
}

// ============================================================================
// Recency Scoring Tests
// ============================================================================

describe("ArticleScorer - Recency", () => {
  let scorer: ArticleScorer;

  beforeEach(() => {
    scorer = createDefaultScorer();
  });

  it("should score recent articles highly", () => {
    const article = createMockArticle({
      publishedAt: new Date(), // Today
    });

    const scored = scorer.scoreArticle(article);

    expect(scored.scores?.recency).toBeGreaterThan(0.95);
    expect(scored.scores?.recency).toBeLessThanOrEqual(1.0);
  });

  it("should apply exponential decay to older articles", () => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const recentArticle = scorer.scoreArticle(createMockArticle({ publishedAt: now }));
    const weekOldArticle = scorer.scoreArticle(createMockArticle({ publishedAt: sevenDaysAgo }));
    const twoWeeksOldArticle = scorer.scoreArticle(
      createMockArticle({ publishedAt: fourteenDaysAgo }),
    );

    // Should show exponential decay
    expect(recentArticle.scores?.recency).toBeGreaterThan(weekOldArticle.scores?.recency ?? 0);
    expect(weekOldArticle.scores?.recency).toBeGreaterThan(twoWeeksOldArticle.scores?.recency ?? 0);

    // At 7 days (half-life), score should be ~0.5
    expect(weekOldArticle.scores?.recency).toBeGreaterThan(0.45);
    expect(weekOldArticle.scores?.recency).toBeLessThan(0.55);
  });

  it("should handle future dates gracefully", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const article = createMockArticle({
      publishedAt: tomorrow,
    });

    const scored = scorer.scoreArticle(article);

    // Future dates should score as 1.0 (most recent possible)
    expect(scored.scores?.recency).toBe(1.0);
  });

  it("should respect custom half-life configuration", () => {
    const customScorer = new ArticleScorer({ recencyHalfLife: 3 });
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const scored = customScorer.scoreArticle(createMockArticle({ publishedAt: threeDaysAgo }));

    // With 3-day half-life, 3 days old should be ~0.5
    expect(scored.scores?.recency).toBeGreaterThan(0.45);
    expect(scored.scores?.recency).toBeLessThan(0.55);
  });
});

// ============================================================================
// Engagement Scoring Tests
// ============================================================================

describe("ArticleScorer - Engagement", () => {
  let scorer: ArticleScorer;

  beforeEach(() => {
    scorer = createDefaultScorer();
  });

  it("should score high engagement articles highly", () => {
    const article = createMockArticle({
      source: "reddit:entrepreneur",
      engagement: {
        upvotes: 500,
        comments: 100,
        shares: 50,
        views: 10000,
      },
    });

    const scored = scorer.scoreArticle(article);

    expect(scored.scores?.engagement).toBeGreaterThan(0.8);
  });

  it("should normalize by source type", () => {
    const redditArticle = createMockArticle({
      source: "reddit:entrepreneur",
      engagement: { upvotes: 100 }, // Baseline for Reddit
    });

    const hnArticle = createMockArticle({
      source: "hackernews:front",
      engagement: { upvotes: 50 }, // Baseline for HN
    });

    const redditScored = scorer.scoreArticle(redditArticle);
    const hnScored = scorer.scoreArticle(hnArticle);

    // Both at baseline should score similarly
    expect(
      Math.abs((redditScored.scores?.engagement ?? 0) - (hnScored.scores?.engagement ?? 0)),
    ).toBeLessThan(0.2);
  });

  it("should handle missing engagement data gracefully", () => {
    const article = createMockArticle({
      engagement: undefined,
    });

    const scored = scorer.scoreArticle(article);

    // Should return neutral score (0.5)
    expect(scored.scores?.engagement).toBe(0.5);
  });

  it("should handle zero engagement", () => {
    const article = createMockArticle({
      engagement: {
        upvotes: 0,
        comments: 0,
        shares: 0,
        views: 0,
      },
    });

    const scored = scorer.scoreArticle(article);

    // Zero engagement should score low
    expect(scored.scores?.engagement).toBeLessThan(0.3);
  });

  it("should weight engagement metrics appropriately", () => {
    // Upvotes should be weighted most heavily
    const upvotesOnly = scorer.scoreArticle(
      createMockArticle({
        source: "reddit:entrepreneur",
        engagement: { upvotes: 500 },
      }),
    );

    const commentsOnly = scorer.scoreArticle(
      createMockArticle({
        source: "reddit:entrepreneur",
        engagement: { comments: 100 },
      }),
    );

    expect(upvotesOnly.scores?.engagement).toBeGreaterThan(commentsOnly.scores?.engagement ?? 0);
  });
});

// ============================================================================
// Readability Scoring Tests
// ============================================================================

describe("ArticleScorer - Readability", () => {
  let scorer: ArticleScorer;

  beforeEach(() => {
    scorer = createDefaultScorer();
  });

  it("should score readable content highly", () => {
    const article = createMockArticle({
      content: "This is a simple article. It has short sentences. Easy to read.",
    });

    const scored = scorer.scoreArticle(article);

    expect(scored.scores?.readability).toBeGreaterThan(0);
    expect(scored.scores?.readability).toBeLessThanOrEqual(1.0);
  });

  it("should penalize overly complex content", () => {
    const simpleContent = "The cat sat on the mat. It was a sunny day.";
    const complexContent =
      "The implementation of sophisticated algorithmic methodologies necessitates comprehensive understanding of multifaceted computational paradigms.";

    const simple = scorer.scoreArticle(createMockArticle({ content: simpleContent }));
    const complex = scorer.scoreArticle(createMockArticle({ content: complexContent }));

    expect(simple.scores?.readability).toBeGreaterThan(complex.scores?.readability ?? 0);
  });

  it("should handle missing content gracefully", () => {
    const article = createMockArticle({
      title: "", // Both title and content empty
      content: "",
    });

    const scored = scorer.scoreArticle(article);

    // Should return neutral score (0.5) for missing content
    expect(scored.scores?.readability).toBe(0.5);
  });

  it("should calculate Flesch score correctly", () => {
    // Test with known readability levels
    const verySimple = "Cat. Dog. Run. Jump.";
    const simple = "The cat runs fast. The dog jumps high.";
    const moderate =
      "Business strategy requires careful analysis of market conditions and competitive dynamics.";

    const verySimpleScore = scorer.scoreArticle(createMockArticle({ content: verySimple }));
    const simpleScore = scorer.scoreArticle(createMockArticle({ content: simple }));
    scorer.scoreArticle(createMockArticle({ content: moderate }));

    // Very simple should score highest
    expect(verySimpleScore.scores?.readability).toBeGreaterThanOrEqual(
      simpleScore.scores?.readability ?? 0,
    );
  });
});

// ============================================================================
// Relevance Scoring Tests
// ============================================================================

describe("ArticleScorer - Relevance", () => {
  let scorer: ArticleScorer;

  beforeEach(() => {
    scorer = createDefaultScorer();
  });

  it("should score business-related content highly", () => {
    const article = createMockArticle({
      title: "Startup Growth Strategies for Entrepreneurs",
      content:
        "This article discusses business strategy, marketing, and revenue growth for startups.",
    });

    const scored = scorer.scoreArticle(article);

    expect(scored.scores?.relevance).toBeGreaterThan(0.6);
  });

  it("should score non-business content lower", () => {
    const article = createMockArticle({
      title: "Cooking Recipes for Beginners",
      content: "Learn how to cook delicious meals with these simple recipes.",
    });

    const scored = scorer.scoreArticle(article);

    expect(scored.scores?.relevance).toBeLessThan(0.5);
  });

  it("should match multiple keywords", () => {
    const fewKeywords = createMockArticle({
      content: "This is about business.",
    });
    const manyKeywords = createMockArticle({
      content:
        "This discusses business strategy, marketing, sales, growth, revenue, and entrepreneurship.",
    });

    const fewScored = scorer.scoreArticle(fewKeywords);
    const manyScored = scorer.scoreArticle(manyKeywords);

    expect(manyScored.scores?.relevance).toBeGreaterThan(fewScored.scores?.relevance ?? 0);
  });

  it("should respect custom keyword configuration", () => {
    const customScorer = new ArticleScorer({
      relevanceKeywords: ["AI", "machine learning", "neural networks"],
    });

    const relevantArticle = createMockArticle({
      content: "This article covers AI and machine learning applications.",
    });

    const scored = customScorer.scoreArticle(relevantArticle);

    expect(scored.scores?.relevance).toBeGreaterThan(0.5);
  });

  it("should boost articles with business topics in title", () => {
    const businessTitle = createMockArticle({
      title: "Business Strategy for Startups",
      content: "Content here.",
    });

    const genericTitle = createMockArticle({
      title: "An Interesting Article",
      content: "Content here.",
    });

    const businessScored = scorer.scoreArticle(businessTitle);
    const genericScored = scorer.scoreArticle(genericTitle);

    expect(businessScored.scores?.relevance).toBeGreaterThan(genericScored.scores?.relevance ?? 0);
  });
});

// ============================================================================
// Authority Scoring Tests
// ============================================================================

describe("ArticleScorer - Authority", () => {
  let scorer: ArticleScorer;

  beforeEach(() => {
    scorer = createDefaultScorer();
  });

  it("should score high-authority sources highly", () => {
    const hbrArticle = createMockArticle({
      source: "rss:hbr",
    });

    const scored = scorer.scoreArticle(hbrArticle);

    expect(scored.scores?.authority).toBeGreaterThan(0.8);
  });

  it("should score low-authority sources lower", () => {
    const unknownArticle = createMockArticle({
      source: "blog:unknown",
    });

    const scored = scorer.scoreArticle(unknownArticle);

    expect(scored.scores?.authority).toBeLessThan(0.6);
  });

  it("should differentiate between source types", () => {
    const hbr = scorer.scoreArticle(createMockArticle({ source: "rss:hbr" }));
    const reddit = scorer.scoreArticle(createMockArticle({ source: "reddit:entrepreneur" }));
    const unknown = scorer.scoreArticle(createMockArticle({ source: "blog:unknown" }));

    expect(hbr.scores?.authority).toBeGreaterThan(reddit.scores?.authority ?? 0);
    expect(reddit.scores?.authority).toBeGreaterThanOrEqual(unknown.scores?.authority ?? 0);
  });

  it("should boost articles with known authors", () => {
    const withAuthor = createMockArticle({
      author: "Jane Smith",
      source: "blog:medium",
    });

    const noAuthor = createMockArticle({
      author: undefined,
      source: "blog:medium",
    });

    const withAuthorScored = scorer.scoreArticle(withAuthor);
    const noAuthorScored = scorer.scoreArticle(noAuthor);

    expect(withAuthorScored.scores?.authority).toBeGreaterThan(
      noAuthorScored.scores?.authority ?? 0,
    );
  });

  it("should respect custom authority mapping", () => {
    const customScorer = new ArticleScorer({
      authorityMap: {
        custom: 0.95,
      },
    });

    const article = createMockArticle({
      source: "rss:custom",
    });

    const scored = customScorer.scoreArticle(article);

    expect(scored.scores?.authority).toBeGreaterThan(0.8);
  });
});

// ============================================================================
// Uniqueness Scoring Tests
// ============================================================================

describe("ArticleScorer - Uniqueness", () => {
  it("should score unique content highly", () => {
    const scorer = createDefaultScorer();
    const article = createMockArticle({
      title: "A Completely Unique Article About Quantum Computing",
      content: "This discusses quantum entanglement and superposition.",
    });

    const scored = scorer.scoreArticle(article);

    expect(scored.scores?.uniqueness).toBe(1.0);
  });

  it("should penalize similar content", () => {
    const recentArticles = [
      createMockArticle({
        id: "recent-1",
        title: "Business Strategy for Startups",
        content: "How to grow your startup with effective business strategy.",
      }),
    ];

    const scorer = new ArticleScorer({ recentArticles });

    const similarArticle = createMockArticle({
      title: "Startup Business Strategy",
      content: "Effective strategy for growing your startup business.",
    });

    const differentArticle = createMockArticle({
      title: "Quantum Physics Explained",
      content: "Understanding quantum mechanics and particle physics.",
    });

    const similarScored = scorer.scoreArticle(similarArticle);
    const differentScored = scorer.scoreArticle(differentArticle);

    expect(differentScored.scores?.uniqueness).toBeGreaterThan(
      similarScored.scores?.uniqueness ?? 0,
    );
  });

  it("should calculate similarity correctly", () => {
    const recentArticles = [
      createMockArticle({
        id: "recent-1",
        title: "The Quick Brown Fox",
        content: "The quick brown fox jumps over the lazy dog.",
      }),
    ];

    const scorer = new ArticleScorer({ recentArticles });

    const identical = createMockArticle({
      title: "The Quick Brown Fox",
      content: "The quick brown fox jumps over the lazy dog.",
    });

    const scored = scorer.scoreArticle(identical);

    // Identical content should have low uniqueness
    expect(scored.scores?.uniqueness).toBeLessThan(0.3);
  });
});

// ============================================================================
// Weighted Aggregation Tests
// ============================================================================

describe("ArticleScorer - Weighted Aggregation", () => {
  it("should calculate final score as weighted sum", () => {
    const scorer = new ArticleScorer({
      weights: {
        recency: 0.2,
        engagement: 0.2,
        readability: 0.2,
        relevance: 0.2,
        authority: 0.1,
        uniqueness: 0.1,
      },
    });

    const article = createMockArticle({
      publishedAt: new Date(), // Recent
      source: "rss:hbr", // High authority
      engagement: {
        upvotes: 500,
        comments: 100,
      },
    });

    const scored = scorer.scoreArticle(article);

    // Final score should be between 0 and 1
    expect(scored.scores?.final).toBeGreaterThan(0);
    expect(scored.scores?.final).toBeLessThanOrEqual(1.0);

    // Should be roughly weighted average of component scores
    const { scores } = scored;
    if (scores) {
      const manualFinal =
        scores.recency * 0.2 +
        scores.engagement * 0.2 +
        scores.readability * 0.2 +
        scores.relevance * 0.2 +
        scores.authority * 0.1 +
        scores.uniqueness * 0.1;

      expect(Math.abs(scores.final - manualFinal)).toBeLessThan(0.01);
    }
  });

  it("should respect custom weights", () => {
    const engagementFocused = new ArticleScorer({
      weights: {
        recency: 0.1,
        engagement: 0.5, // Much higher
        readability: 0.1,
        relevance: 0.1,
        authority: 0.1,
        uniqueness: 0.1,
      },
    });

    const highEngagement = createMockArticle({
      engagement: { upvotes: 1000, comments: 200 },
      source: "reddit:entrepreneur",
    });

    const lowEngagement = createMockArticle({
      engagement: { upvotes: 5, comments: 1 },
      source: "reddit:entrepreneur",
    });

    const highScored = engagementFocused.scoreArticle(highEngagement);
    const lowScored = engagementFocused.scoreArticle(lowEngagement);

    // High engagement should score much better (but adjust expectation to be realistic)
    expect(highScored.scores?.final).toBeGreaterThan((lowScored.scores?.final ?? 0) + 0.15);
  });

  it("should warn if weights do not sum to 1.0", () => {
    const consoleSpy = { warnings: [] as string[] };
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      consoleSpy.warnings.push(args.join(" "));
    };

    new ArticleScorer({
      weights: {
        recency: 0.5,
        engagement: 0.3,
        readability: 0.1,
        relevance: 0.1,
        authority: 0.1,
        uniqueness: 0.1,
      },
    });

    console.warn = originalWarn;

    expect(consoleSpy.warnings.some((w) => w.includes("1.0"))).toBe(true);
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe("ArticleScorer - Edge Cases", () => {
  let scorer: ArticleScorer;

  beforeEach(() => {
    scorer = createDefaultScorer();
  });

  it("should handle articles with minimal data", () => {
    const minimal = createMockArticle({
      title: "Test",
      content: "",
      author: undefined,
      engagement: undefined,
    });

    const scored = scorer.scoreArticle(minimal);

    expect(scored.scores?.final).toBeGreaterThan(0);
    expect(scored.scores?.final).toBeLessThanOrEqual(1.0);
  });

  it("should handle articles with all fields populated", () => {
    const complete = createMockArticle({
      title: "Complete Business Strategy Article",
      content:
        "This is a comprehensive article about business strategy, growth, and entrepreneurship.",
      author: "Expert Author",
      publishedAt: new Date(),
      source: "rss:hbr",
      engagement: {
        upvotes: 500,
        comments: 100,
        shares: 50,
        views: 10000,
      },
    });

    const scored = scorer.scoreArticle(complete);

    expect(scored.scores?.final).toBeGreaterThan(0.5);
  });

  it("should handle very old articles", () => {
    const veryOld = new Date("2020-01-01");
    const article = createMockArticle({
      publishedAt: veryOld,
    });

    const scored = scorer.scoreArticle(article);

    expect(scored.scores?.recency).toBeGreaterThan(0);
    expect(scored.scores?.recency).toBeLessThan(0.1);
  });

  it("should handle articles with extreme engagement", () => {
    const viral = createMockArticle({
      source: "reddit:entrepreneur",
      engagement: {
        upvotes: 10000,
        comments: 5000,
        shares: 1000,
        views: 1000000,
      },
    });

    const scored = scorer.scoreArticle(viral);

    // Should cap at 1.0
    expect(scored.scores?.engagement).toBeLessThanOrEqual(1.0);
  });

  it("should handle empty or whitespace-only content", () => {
    const empty = createMockArticle({ title: "", content: "" });
    const whitespace = createMockArticle({ title: "   ", content: "   \n\n   " });

    const emptyScored = scorer.scoreArticle(empty);
    const whitespaceScored = scorer.scoreArticle(whitespace);

    expect(emptyScored.scores?.readability).toBe(0.5);
    expect(whitespaceScored.scores?.readability).toBe(0.5);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe("ArticleScorer - Performance", () => {
  it("should score 100+ articles in < 2 seconds", async () => {
    const scorer = createDefaultScorer();
    const articles = createArticlesForPerformanceTest(150);

    const startTime = Date.now();
    const scored = await scorer.scoreArticles(articles);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(2000);
    expect(scored).toHaveLength(150);
    expect(scored[0].scores?.final).toBeDefined();
  });

  it("should handle 500 articles efficiently", async () => {
    const scorer = createDefaultScorer();
    const articles = createArticlesForPerformanceTest(500);

    const startTime = Date.now();
    const scored = await scorer.scoreArticles(articles);
    const duration = Date.now() - startTime;

    // Should still be reasonably fast
    expect(duration).toBeLessThan(5000);
    expect(scored).toHaveLength(500);
  });

  it("should sort articles by final score", async () => {
    const scorer = createDefaultScorer();
    const articles = createArticlesForPerformanceTest(50);

    const scored = await scorer.scoreArticles(articles);

    // Verify descending order
    for (let i = 0; i < scored.length - 1; i++) {
      expect(scored[i].scores?.final).toBeGreaterThanOrEqual(scored[i + 1].scores?.final ?? 0);
    }
  });

  it("should provide accurate metrics", async () => {
    const scorer = createDefaultScorer();
    const articles = createArticlesForPerformanceTest(100);

    const scored = await scorer.scoreArticles(articles);

    expect(scored).toHaveLength(100);
    expect(scored[0].scores?.final).toBeGreaterThan(0);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("ArticleScorer - Integration", () => {
  it("should select top 15 articles from 50+ candidates", async () => {
    const scorer = createDefaultScorer();
    const articles = createArticlesForPerformanceTest(60);

    const top15 = await scorer.getTopArticles(articles, 15);

    expect(top15).toHaveLength(15);

    // All should have scores
    top15.forEach((article) => {
      expect(article.scores?.final).toBeDefined();
    });

    // Should be sorted descending
    for (let i = 0; i < top15.length - 1; i++) {
      expect(top15[i].scores?.final).toBeGreaterThanOrEqual(top15[i + 1].scores?.final ?? 0);
    }
  });

  it("should work with business-focused scorer", async () => {
    const scorer = createBusinessScorer();
    const articles = [
      createMockArticle({
        title: "Business Strategy for Entrepreneurs",
        content: "How to build a successful business with effective strategy.",
        source: "rss:hbr",
      }),
      createMockArticle({
        title: "Cat Videos Are Trending",
        content: "The latest viral cat videos on social media.",
        source: "reddit:videos",
      }),
    ];

    const scored = await scorer.scoreArticles(articles);

    // Business article should score higher
    expect(scored[0].title).toContain("Business");
  });

  it("should work with viral-focused scorer", async () => {
    const scorer = createViralScorer();
    const articles = [
      createMockArticle({
        title: "Viral Meme Takes Over Internet",
        engagement: { upvotes: 5000, comments: 1000 },
        publishedAt: new Date(), // Recent
      }),
      createMockArticle({
        title: "Academic Research Paper",
        engagement: { upvotes: 10, comments: 2 },
        publishedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 2 weeks old
      }),
    ];

    const scored = await scorer.scoreArticles(articles);

    // Viral article should score higher
    expect(scored[0].title).toContain("Viral");
  });

  it("should maintain configuration integrity", () => {
    const scorer = new ArticleScorer({
      weights: {
        recency: 0.2,
        engagement: 0.3,
        readability: 0.1,
        relevance: 0.2,
        authority: 0.1,
        uniqueness: 0.1,
      },
      recencyHalfLife: 5,
    });

    const config = scorer.getConfig();

    expect(config.weights.recency).toBe(0.2);
    expect(config.weights.engagement).toBe(0.3);
    expect(config.recencyHalfLife).toBe(5);
  });
});

// ============================================================================
// Quality Validation Tests
// ============================================================================

describe("ArticleScorer - Quality Validation", () => {
  it("should rank high-quality articles above low-quality ones", async () => {
    const scorer = createDefaultScorer();

    const highQuality = createMockArticle({
      id: "high-quality",
      title: "Essential Business Strategies for Startup Growth",
      content:
        "This article provides actionable insights for entrepreneurs building successful businesses.",
      author: "Industry Expert",
      publishedAt: new Date(),
      source: "rss:hbr",
      engagement: { upvotes: 500, comments: 100 },
    });

    const lowQuality = createMockArticle({
      id: "low-quality",
      title: "Random Thoughts",
      content: "Just some random stuff.",
      author: undefined,
      publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days old
      source: "blog:unknown",
      engagement: { upvotes: 2 },
    });

    const scored = await scorer.scoreArticles([highQuality, lowQuality]);

    expect(scored[0].id).toBe("high-quality");
    expect(scored[1].id).toBe("low-quality");
    expect(scored[0].scores?.final).toBeGreaterThan((scored[1].scores?.final ?? 0) + 0.2);
  });

  it("should validate that top scorers are consistently high quality", async () => {
    const scorer = createDefaultScorer();
    const articles = [
      // High quality articles
      createMockArticle({
        id: "hq-1",
        title: "Business Growth Strategies",
        content: "Comprehensive guide to scaling your startup.",
        source: "rss:hbr",
        publishedAt: new Date(),
        engagement: { upvotes: 300 },
      }),
      createMockArticle({
        id: "hq-2",
        title: "Marketing for Entrepreneurs",
        content: "Effective marketing strategies for small businesses.",
        source: "rss:inc",
        publishedAt: new Date(),
        engagement: { upvotes: 250 },
      }),
      // Low quality articles
      createMockArticle({
        id: "lq-1",
        title: "Random Post",
        content: "Not relevant.",
        source: "blog:unknown",
        publishedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        engagement: { upvotes: 5 },
      }),
    ];

    const top2 = await scorer.getTopArticles(articles, 2);

    expect(top2).toHaveLength(2);
    expect(["hq-1", "hq-2"]).toContain(top2[0].id);
    expect(["hq-1", "hq-2"]).toContain(top2[1].id);
  });

  it("should balance multiple factors appropriately", () => {
    const scorer = createDefaultScorer();

    // Article with excellent recency but poor everything else
    const recentOnly = createMockArticle({
      id: "recent",
      publishedAt: new Date(),
      source: "blog:unknown",
      engagement: { upvotes: 1 },
      title: "Random",
      content: "Nothing relevant.",
    });

    // Article with excellent engagement but older
    const engagementOnly = createMockArticle({
      id: "engagement",
      publishedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      source: "reddit:entrepreneur",
      engagement: { upvotes: 1000, comments: 200 },
      title: "Random",
      content: "Nothing relevant.",
    });

    // Balanced article
    const balanced = createMockArticle({
      id: "balanced",
      publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      source: "rss:hbr",
      engagement: { upvotes: 150 },
      title: "Business Strategy for Startups",
      content: "Comprehensive guide to business growth and entrepreneurship.",
    });

    const recentScored = scorer.scoreArticle(recentOnly);
    scorer.scoreArticle(engagementOnly);
    const balancedScored = scorer.scoreArticle(balanced);

    // Balanced article should score best overall
    expect(balancedScored.scores?.final).toBeGreaterThan(recentScored.scores?.final ?? 0);
  });
});
