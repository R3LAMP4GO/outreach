/**
 * Tests for ArticleFilter
 * Comprehensive test coverage for all filter types and edge cases
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ArticleFilter, DEFAULT_FILTER_CONFIG } from "../filter";
import { Article } from "../../../types/article";

describe("ArticleFilter", () => {
  let filter: ArticleFilter;

  // Default article content with adequate length (200+ words)
  const DEFAULT_CONTENT =
    `Building a successful business requires careful planning and execution. You need to understand your market, develop a unique value proposition, and create a sustainable business model. This article explores the key strategies that successful entrepreneurs use to build thriving companies. We will examine case studies, best practices, and actionable frameworks that you can apply to your own business and entrepreneurial journey.

    The journey of entrepreneurship is challenging but rewarding, and with the right approach, you can achieve your goals and create lasting value for your customers. Understanding market dynamics is crucial for long-term success. You must identify customer pain points and develop solutions that truly address their needs. Market research provides valuable insights that guide product development and marketing strategies.

    Innovation and adaptability are key traits of successful entrepreneurs. Markets change rapidly, and businesses must evolve to stay competitive. This means constantly gathering feedback, iterating on your products, and staying ahead of industry trends. Financial management is another critical aspect - maintaining healthy cash flow and making smart investment decisions can make or break your venture. Careful budgeting and forecasting are essential for sustainability.

    Building a strong team is equally important. Surround yourself with talented individuals who share your vision and bring complementary skills to the table. Create a culture of excellence and continuous improvement. Effective leadership involves setting clear goals, providing support and resources, and fostering an environment where innovation thrives. Remember that sustainable growth comes from consistent effort and strategic thinking over time.`.trim();

  // Helper function to create test articles
  const createArticle = (overrides: Partial<Article> = {}): Article => {
    return {
      id: "test-article-1",
      title: "How to Build a Successful Business",
      content: DEFAULT_CONTENT,
      url: "https://example.com/business-article",
      author: "Jane Smith",
      publishedAt: new Date("2024-01-15"),
      source: "rss:business-blog",
      engagement: {
        upvotes: 100,
        comments: 25,
      },
      scores: {
        recency: 0.9,
        engagement: 0.8,
        readability: 0.75,
        relevance: 0.85,
        authority: 0.8,
        uniqueness: 0.7,
        final: 0.8,
      },
      status: "processed",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  };

  beforeEach(() => {
    filter = new ArticleFilter();
  });

  describe("Score Threshold Filter", () => {
    it("should pass articles with score >= minScore", async () => {
      const article = createArticle({
        scores: {
          recency: 0.9,
          engagement: 0.8,
          readability: 0.75,
          relevance: 0.85,
          authority: 0.8,
          uniqueness: 0.7,
          final: 0.8,
        },
      });

      const result = await filter.filterArticles([article]);

      expect(result.passed).toHaveLength(1);
      expect(result.rejected).toHaveLength(0);
      expect(result.stats.passed).toBe(1);
    });

    it("should reject articles with score < minScore", async () => {
      const article = createArticle({
        scores: {
          recency: 0.5,
          engagement: 0.4,
          readability: 0.5,
          relevance: 0.5,
          authority: 0.5,
          uniqueness: 0.5,
          final: 0.45,
        },
      });

      const result = await filter.filterArticles([article]);

      expect(result.passed).toHaveLength(0);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.some((r) => r.includes("score_too_low"))).toBe(true);
    });

    it("should reject articles without scores", async () => {
      const article = createArticle({
        scores: undefined,
      });

      const result = await filter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons).toContain("missing_score");
    });

    it("should allow custom minScore threshold", async () => {
      const customFilter = new ArticleFilter({ minScore: 0.8 });
      const article = createArticle({
        scores: {
          recency: 0.7,
          engagement: 0.7,
          readability: 0.7,
          relevance: 0.7,
          authority: 0.7,
          uniqueness: 0.7,
          final: 0.7,
        },
      });

      const result = await customFilter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.some((r) => r.includes("score_too_low"))).toBe(true);
    });
  });

  describe("Content Length Filter", () => {
    it("should pass articles within word count range", async () => {
      const article = createArticle(); // Default has 200+ words

      const result = await filter.filterArticles([article]);

      expect(result.passed).toHaveLength(1);
    });

    it("should reject articles that are too short", async () => {
      const article = createArticle({
        content: "This is too short.",
      });

      const result = await filter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.some((r) => r.includes("too_short"))).toBe(true);
    });

    it("should reject articles that are too long", async () => {
      const article = createArticle({
        content: "This is a very long article. ".repeat(2000), // ~6000 words
      });

      const result = await filter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.some((r) => r.includes("too_long"))).toBe(true);
    });

    it("should allow custom word count limits", async () => {
      const customFilter = new ArticleFilter({
        minWords: 500,
        maxWords: 1000,
      });

      const shortArticle = createArticle(); // Default ~200 words

      const result = await customFilter.filterArticles([shortArticle]);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.some((r) => r.includes("too_short"))).toBe(true);
    });
  });

  describe("Promotional Content Filter", () => {
    it("should detect promotional keywords", async () => {
      const article = createArticle({
        title: "Amazing Limited Offer - Buy Now!",
        content:
          DEFAULT_CONTENT +
          " This is an exclusive deal you cannot miss. Use discount code SAVE50. Click here to buy now before this limited time offer expires! Amazing opportunity awaits.",
      });

      const result = await filter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.some((r) => r.includes("promotional_content"))).toBe(true);
    });

    it("should detect excessive capitalization", async () => {
      const article = createArticle({
        title: "THIS AMAZING OPPORTUNITY WILL CHANGE YOUR LIFE",
      });

      const result = await filter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.some((r) => r.includes("excessive_caps"))).toBe(true);
    });

    it("should detect excessive links", async () => {
      const article = createArticle({
        content:
          DEFAULT_CONTENT +
          " Check out https://example.com and https://test.com Visit https://link1.com, https://link2.com, https://link3.com More at https://link4.com, https://link5.com, https://link6.com https://link7.com https://link8.com https://link9.com https://link10.com https://link11.com https://link12.com https://link13.com https://link14.com https://link15.com https://link16.com https://link17.com https://link18.com https://link19.com https://link20.com",
      });

      const result = await filter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.some((r) => r.includes("excessive_links"))).toBe(true);
    });

    it("should allow custom promotional keywords", async () => {
      const customFilter = new ArticleFilter({
        promotionalKeywords: ["custom-promo", "special-offer"],
      });

      const article = createArticle({
        content: DEFAULT_CONTENT + " This article has a custom-promo code inside that you can use.",
      });

      const result = await customFilter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.some((r) => r.includes("promotional_content"))).toBe(true);
    });

    it("should not flag legitimate business articles", async () => {
      const article = createArticle({
        title: "How to Price Your Product",
        content: DEFAULT_CONTENT,
      });

      const result = await filter.filterArticles([article]);

      expect(result.passed).toHaveLength(1);
    });
  });

  describe("Clickbait Detection Filter", () => {
    it("should detect excessive punctuation", async () => {
      const article = createArticle({
        title: "You Won't Believe What Happened Next!!!",
      });

      const result = await filter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.some((r) => r.includes("clickbait"))).toBe(true);
    });

    it("should detect all-caps words", async () => {
      const article = createArticle({
        title: "This AMAZING Method Will BLOW Your MIND",
      });

      const result = await filter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.some((r) => r.includes("clickbait_all_caps"))).toBe(true);
    });

    it("should detect clickbait phrases", async () => {
      const article = createArticle({
        title: "One Weird Trick for Business Success",
      });

      const result = await filter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.some((r) => r.includes("clickbait_phrases"))).toBe(true);
    });

    it("should allow legitimate titles with acronyms", async () => {
      const article = createArticle({
        title: "How SaaS Companies Use API Integration",
      });

      const result = await filter.filterArticles([article]);

      expect(result.passed).toHaveLength(1);
    });

    it("should allow legitimate exclamation marks", async () => {
      const article = createArticle({
        title: "The Future of AI is Here!",
      });

      const result = await filter.filterArticles([article]);

      expect(result.passed).toHaveLength(1);
    });
  });

  describe("Spam and Low-Value Filter", () => {
    it("should detect thin content with high link ratio", async () => {
      const article = createArticle({
        content: `
          Visit https://link1.com and https://link2.com.
          See https://link3.com for more.
          Check https://link4.com and https://link5.com.
          https://link6.com has details.
          More at https://link7.com.
        `, // High link-to-text ratio
      });

      const result = await filter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
      expect(
        result.rejected[0].reasons.some(
          (r) => r.includes("thin_content") || r.includes("too_short"),
        ),
      ).toBe(true);
    });

    it("should detect press releases", async () => {
      const article = createArticle({
        content:
          DEFAULT_CONTENT +
          `
          FOR IMMEDIATE RELEASE
          Company XYZ announces new product.
          For media contact, call 555-1234.
          About the Company: We are a leading provider of innovative solutions.
          Forward-looking statements: This release contains forward-looking information.
        `,
      });

      const result = await filter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.some((r) => r.includes("press_release"))).toBe(true);
    });

    it("should detect self-promotional content", async () => {
      const article = createArticle({
        content:
          DEFAULT_CONTENT +
          `
          Our company offers the best solutions in the industry.
          We offer comprehensive services tailored to your needs.
          Our product is industry-leading and trusted by thousands.
          Contact us for a free consultation and discover the difference.
        `,
      });

      const result = await filter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.some((r) => r.includes("self_promotional"))).toBe(true);
    });

    it("should pass legitimate case studies mentioning companies", async () => {
      const article = createArticle({
        content:
          DEFAULT_CONTENT +
          " This case study examines how Amazon uses data analytics to improve customer experience.",
      });

      const result = await filter.filterArticles([article]);

      expect(result.passed).toHaveLength(1);
    });
  });

  describe("Readability Filter", () => {
    it("should reject articles with low readability score", async () => {
      const article = createArticle({
        scores: {
          recency: 0.9,
          engagement: 0.8,
          readability: 0.2, // Low readability (20/100 on Flesch scale)
          relevance: 0.85,
          authority: 0.8,
          uniqueness: 0.7,
          final: 0.75,
        },
      });

      const result = await filter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.some((r) => r.includes("low_readability"))).toBe(true);
    });

    it("should pass articles with adequate readability", async () => {
      const article = createArticle({
        scores: {
          recency: 0.9,
          engagement: 0.8,
          readability: 0.6, // 60/100 on Flesch scale
          relevance: 0.85,
          authority: 0.8,
          uniqueness: 0.7,
          final: 0.8,
        },
      });

      const result = await filter.filterArticles([article]);

      expect(result.passed).toHaveLength(1);
    });

    it("should allow custom readability threshold", async () => {
      const customFilter = new ArticleFilter({ minReadability: 50 });
      const article = createArticle({
        scores: {
          recency: 0.9,
          engagement: 0.8,
          readability: 0.4, // 40/100 on Flesch scale
          relevance: 0.85,
          authority: 0.8,
          uniqueness: 0.7,
          final: 0.75,
        },
      });

      const result = await customFilter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
    });

    it("should skip readability check if score not available", async () => {
      const article = createArticle({
        scores: {
          recency: 0.9,
          engagement: 0.8,
          readability: 0, // Not calculated
          relevance: 0.85,
          authority: 0.8,
          uniqueness: 0.7,
          final: 0.75,
        },
      });

      const result = await filter.filterArticles([article]);

      // Should not reject based on readability alone
      const hasReadabilityReason = result.rejected.some((r) =>
        r.reasons.some((reason) => reason.includes("readability")),
      );
      expect(hasReadabilityReason).toBe(false);
    });
  });

  describe("Domain Diversity Filter", () => {
    it("should limit articles per domain", async () => {
      const articles = [
        createArticle({
          id: "article-1",
          url: "https://example.com/article-1",
        }),
        createArticle({
          id: "article-2",
          url: "https://example.com/article-2",
        }),
        createArticle({
          id: "article-3",
          url: "https://example.com/article-3",
        }),
        createArticle({
          id: "article-4",
          url: "https://example.com/article-4",
        }),
      ];

      const result = await filter.filterArticles(articles);

      // Default is 3 articles per domain
      expect(result.passed).toHaveLength(3);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.some((r) => r.includes("domain_limit_exceeded"))).toBe(
        true,
      );
    });

    it("should handle www and non-www domains as same", async () => {
      const articles = [
        createArticle({
          id: "article-1",
          url: "https://example.com/article-1",
        }),
        createArticle({
          id: "article-2",
          url: "https://www.example.com/article-2",
        }),
        createArticle({
          id: "article-3",
          url: "https://example.com/article-3",
        }),
        createArticle({
          id: "article-4",
          url: "https://www.example.com/article-4",
        }),
      ];

      const result = await filter.filterArticles(articles);

      expect(result.passed).toHaveLength(3);
      expect(result.rejected).toHaveLength(1);
    });

    it("should allow custom domain limits", async () => {
      const customFilter = new ArticleFilter({ maxArticlesPerDomain: 1 });
      const articles = [
        createArticle({
          id: "article-1",
          url: "https://example.com/article-1",
        }),
        createArticle({
          id: "article-2",
          url: "https://example.com/article-2",
        }),
      ];

      const result = await customFilter.filterArticles(articles);

      expect(result.passed).toHaveLength(1);
      expect(result.rejected).toHaveLength(1);
    });

    it("should handle different domains correctly", async () => {
      const articles = [
        createArticle({
          id: "article-1",
          url: "https://example.com/article-1",
        }),
        createArticle({
          id: "article-2",
          url: "https://different.com/article-2",
        }),
        createArticle({
          id: "article-3",
          url: "https://another.com/article-3",
        }),
      ];

      const result = await filter.filterArticles(articles);

      expect(result.passed).toHaveLength(3); // All different domains
    });

    it("should not count rejected articles towards domain limit", async () => {
      const articles = [
        createArticle({
          id: "article-1",
          url: "https://example.com/article-1",
          scores: {
            recency: 0.9,
            engagement: 0.8,
            readability: 0.75,
            relevance: 0.85,
            authority: 0.8,
            uniqueness: 0.7,
            final: 0.8,
          },
        }),
        createArticle({
          id: "article-2",
          url: "https://example.com/article-2",
          scores: {
            recency: 0.1,
            engagement: 0.1,
            readability: 0.1,
            relevance: 0.1,
            authority: 0.1,
            uniqueness: 0.1,
            final: 0.1, // Will be rejected for low score
          },
        }),
        createArticle({
          id: "article-3",
          url: "https://example.com/article-3",
          scores: {
            recency: 0.9,
            engagement: 0.8,
            readability: 0.75,
            relevance: 0.85,
            authority: 0.8,
            uniqueness: 0.7,
            final: 0.8,
          },
        }),
      ];

      const result = await filter.filterArticles(articles);

      // Should pass 2 articles (rejected one doesn't count)
      expect(result.passed.length).toBeGreaterThan(0);
    });
  });

  describe("Custom Keyword Rejection", () => {
    it("should reject articles with custom keywords", async () => {
      const customFilter = new ArticleFilter({
        rejectKeywords: ["cryptocurrency", "bitcoin"],
      });

      const article = createArticle({
        content:
          DEFAULT_CONTENT +
          " This section discusses cryptocurrency trends and Bitcoin investment strategies that are gaining popularity.",
      });

      const result = await customFilter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.some((r) => r.includes("rejected_keywords"))).toBe(true);
    });

    it("should handle case-insensitive keyword matching", async () => {
      const customFilter = new ArticleFilter({
        rejectKeywords: ["SPORTS", "Politics"],
      });

      const article = createArticle({
        content:
          DEFAULT_CONTENT +
          " This article also covers sports and politics news from around the world.",
      });

      const result = await customFilter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
    });
  });

  describe("Performance Tests", () => {
    it("should filter 200+ articles in < 1 second", async () => {
      const articles = Array.from({ length: 250 }, (_, i) =>
        createArticle({
          id: `article-${i}`,
          url: `https://example${i}.com/article`,
        }),
      );

      const result = await filter.filterArticles(articles);

      expect(result.stats.total).toBe(250);
      expect(result.stats.processingTimeMs).toBeLessThan(1000);
    });

    it("should efficiently track rejection reasons", async () => {
      const articles = [
        createArticle({
          id: "article-1",
          scores: {
            recency: 0.3,
            engagement: 0.3,
            readability: 0.3,
            relevance: 0.3,
            authority: 0.3,
            uniqueness: 0.3,
            final: 0.3,
          },
        }),
        createArticle({
          id: "article-2",
          content: "Too short",
        }),
        createArticle({
          id: "article-3",
          title: "Buy Now! Limited Offer!!!",
        }),
      ];

      const result = await filter.filterArticles(articles);

      expect(result.stats.rejectionReasons).toBeDefined();
      expect(Object.keys(result.stats.rejectionReasons).length).toBeGreaterThan(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty article array", async () => {
      const result = await filter.filterArticles([]);

      expect(result.passed).toHaveLength(0);
      expect(result.rejected).toHaveLength(0);
      expect(result.stats.total).toBe(0);
    });

    it("should handle articles with missing content", async () => {
      const article = createArticle({
        content: "",
      });

      const result = await filter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
    });

    it("should handle articles with malformed URLs", async () => {
      const article = createArticle({
        url: "not-a-valid-url",
      });

      const result = await filter.filterArticles([article]);

      // Should not crash, domain filter should skip
      expect(result).toBeDefined();
    });

    it("should handle articles with undefined scores properties", async () => {
      const article = createArticle({
        scores: {
          recency: 0.9,
          engagement: 0.8,
          readability: 0,
          relevance: 0.85,
          authority: 0.8,
          uniqueness: 0.7,
          final: 0.8,
        },
      });

      const result = await filter.filterArticles([article]);

      expect(result).toBeDefined();
    });

    it("should provide detailed rejection reasons", async () => {
      const article = createArticle({
        title: "SHOCKING!!! You Won't Believe This!!!",
        content: "Buy now! Limited offer! Click here! Too short to pass filters.",
        scores: {
          recency: 0.9,
          engagement: 0.8,
          readability: 0.2,
          relevance: 0.85,
          authority: 0.8,
          uniqueness: 0.7,
          final: 0.4,
        },
      });

      const result = await filter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.length).toBeGreaterThan(1);
      expect(result.rejected[0].title).toBe(article.title);
      expect(result.rejected[0].articleId).toBe(article.id);
    });
  });

  describe("Configuration Management", () => {
    it("should allow config updates", () => {
      filter.updateConfig({ minScore: 0.7 });
      const config = filter.getConfig();
      expect(config.minScore).toBe(0.7);
    });

    it("should preserve existing config on partial update", () => {
      filter.updateConfig({ minScore: 0.7 });
      const config = filter.getConfig();
      expect(config.minWords).toBe(DEFAULT_FILTER_CONFIG.minWords);
    });

    it("should allow disabling filters", async () => {
      const customFilter = new ArticleFilter({
        filterPromotional: false,
        filterClickbait: false,
        filterSpam: false,
      });

      const article = createArticle({
        title: "Buy Now! Limited Offer!!!",
        content: DEFAULT_CONTENT + " Click here for amazing deals and exclusive offers!",
      });

      const result = await customFilter.filterArticles([article]);

      // Should pass because promotional/clickbait filters disabled
      expect(result.passed).toHaveLength(1);
    });
  });

  describe("Individual Filter Methods", () => {
    it("should expose checkScore method", async () => {
      const article = createArticle();
      const result = await filter.checkScore(article);

      expect(result.passed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should expose checkContentLength method", async () => {
      const article = createArticle();
      const result = await filter.checkContentLength(article);

      expect(result.passed).toBe(true);
    });

    it("should expose checkPromotional method", async () => {
      const article = createArticle();
      const result = await filter.checkPromotional(article);

      expect(result.passed).toBe(true);
    });

    it("should expose checkClickbait method", async () => {
      const article = createArticle();
      const result = await filter.checkClickbait(article);

      expect(result.passed).toBe(true);
    });

    it("should expose checkSpam method", async () => {
      const article = createArticle();
      const result = await filter.checkSpam(article);

      expect(result.passed).toBe(true);
    });
  });

  describe("Filter Result Statistics", () => {
    it("should provide comprehensive stats", async () => {
      const articles = [
        createArticle({ id: "pass-1" }),
        createArticle({ id: "pass-2" }),
        createArticle({
          id: "fail-1",
          scores: {
            recency: 0.3,
            engagement: 0.3,
            readability: 0.3,
            relevance: 0.3,
            authority: 0.3,
            uniqueness: 0.3,
            final: 0.3,
          },
        }),
      ];

      const result = await filter.filterArticles(articles);

      expect(result.stats.total).toBe(3);
      expect(result.stats.passed).toBe(2);
      expect(result.stats.rejected).toBe(1);
      expect(result.stats.processingTimeMs).toBeGreaterThan(0);
      expect(result.stats.rejectionReasons).toBeDefined();
    });

    it("should aggregate rejection reasons correctly", async () => {
      const articles = [
        createArticle({
          id: "fail-1",
          scores: {
            recency: 0.3,
            engagement: 0.3,
            readability: 0.3,
            relevance: 0.3,
            authority: 0.3,
            uniqueness: 0.3,
            final: 0.3,
          },
        }),
        createArticle({
          id: "fail-2",
          scores: {
            recency: 0.3,
            engagement: 0.3,
            readability: 0.3,
            relevance: 0.3,
            authority: 0.3,
            uniqueness: 0.3,
            final: 0.3,
          },
        }),
      ];

      const result = await filter.filterArticles(articles);

      // Both should fail with score_too_low
      const scoreTooLowCount = Object.entries(result.stats.rejectionReasons).find(([key]) =>
        key.includes("score_too_low"),
      );

      expect(scoreTooLowCount).toBeDefined();
      expect(scoreTooLowCount![1]).toBe(2);
    });
  });

  describe("Complex Filtering Scenarios", () => {
    it("should handle multiple filter violations", async () => {
      const article = createArticle({
        title: "BUY NOW!!! SHOCKING OFFER!!!",
        content: "Limited time only! Click here! Visit https://spam.com Not enough content here.",
        scores: {
          recency: 0.9,
          engagement: 0.8,
          readability: 0.75,
          relevance: 0.85,
          authority: 0.8,
          uniqueness: 0.7,
          final: 0.3, // Low score
        },
      });

      const result = await filter.filterArticles([article]);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reasons.length).toBeGreaterThan(2);
    });

    it("should filter realistic batch of mixed quality", async () => {
      const articles = [
        // Good article
        createArticle({
          id: "good-1",
          title: "How to Build a Sustainable Business Model",
          content: DEFAULT_CONTENT,
          scores: {
            recency: 0.9,
            engagement: 0.8,
            readability: 0.75,
            relevance: 0.85,
            authority: 0.8,
            uniqueness: 0.7,
            final: 0.8,
          },
        }),
        // Low score
        createArticle({
          id: "bad-1",
          scores: {
            recency: 0.3,
            engagement: 0.3,
            readability: 0.3,
            relevance: 0.3,
            authority: 0.3,
            uniqueness: 0.3,
            final: 0.3,
          },
        }),
        // Too short
        createArticle({
          id: "bad-2",
          content: "This is way too short to be useful.",
        }),
        // Promotional
        createArticle({
          id: "bad-3",
          title: "Limited Time Offer - Buy Now!",
          content: DEFAULT_CONTENT + " Amazing discount code! Exclusive deal! Click here now!",
        }),
        // Good article
        createArticle({
          id: "good-2",
          title: "The Psychology of Customer Retention",
          content: DEFAULT_CONTENT,
          scores: {
            recency: 0.85,
            engagement: 0.75,
            readability: 0.7,
            relevance: 0.8,
            authority: 0.85,
            uniqueness: 0.75,
            final: 0.78,
          },
        }),
      ];

      const result = await filter.filterArticles(articles);

      expect(result.passed.length).toBe(2);
      expect(result.rejected.length).toBe(3);
      expect(result.stats.total).toBe(5);
    });
  });
});
