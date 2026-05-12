/**
 * Tests for ArticleSummarizer
 * Uses mocked Anthropic SDK responses
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ArticleSummarizer } from "../summarizer";
import type { ArticleInput, SummarizerConfig } from "../../../types/summarizer";
import { SummarizerErrorType } from "../../../types/summarizer";

// Mock Anthropic SDK — use vi.hoisted() so mocks are available when vi.mock() factory runs
const { mockCreate, MockAPIError } = vi.hoisted(() => {
  const mockCreate = vi.fn();

  class MockAPIError extends Error {
    status: number;
    error: unknown;
    override message: string;
    headers: unknown;

    constructor(status: number, error: unknown, message: string, headers: unknown) {
      super(message);
      this.status = status;
      this.error = error;
      this.message = message;
      this.headers = headers;
      this.name = "APIError";
    }
  }

  return { mockCreate, MockAPIError };
});

vi.mock("@anthropic-ai/sdk", () => {
  // Use a regular function (not arrow) so it can be called with `new`
  function MockAnthropic() {
    return {
      messages: {
        create: mockCreate,
      },
    };
  }

  // Add APIError as a static property of the Anthropic class
  MockAnthropic.APIError = MockAPIError;

  return {
    default: MockAnthropic,
  };
});

// Import after mock is set up
import Anthropic from "@anthropic-ai/sdk";

describe("ArticleSummarizer", () => {
  let summarizer: ArticleSummarizer;

  const mockConfig: SummarizerConfig = {
    apiKey: "test-api-key",
    enableCache: true,
    enableRateLimiting: false, // Disable for tests
    maxRetries: 2, // Allow one retry
    retryBaseDelayMs: 10, // Fast retries for tests
  };

  const mockArticle: ArticleInput = {
    id: "test-article-1",
    title: "How Loss Aversion Drives Customer Decisions",
    content: `Loss aversion is a cognitive bias where people feel the pain of losing something twice as strongly as the pleasure of gaining something equivalent. In business, this principle can be leveraged to improve conversion rates by framing offers around what customers stand to lose rather than what they might gain. Research shows that loss-framed messaging can increase conversions by up to 30% compared to gain-framed alternatives. Successful companies like Amazon use loss aversion in their "Only 2 left in stock" messaging to create urgency and drive immediate purchases.`,
    url: "https://example.com/loss-aversion-article",
    publishedAt: new Date("2024-01-15"),
    author: "Jane Smith",
    source: "Business Psychology Today",
  };

  const mockClaudeResponse: Anthropic.Message = {
    id: "msg_test123",
    type: "message",
    role: "assistant",
    model: "claude-3-5-sonnet-20241022",
    container: null,
    content: [
      {
        type: "text",
        citations: null,
        text: JSON.stringify({
          summary:
            'Loss aversion—the psychological principle where losing feels twice as painful as gaining feels good—can boost your conversion rates by up to 30%. Frame your offers around what customers stand to lose (not just gain) to tap into this powerful bias. Amazon\'s "Only 2 left" messaging demonstrates this principle in action.',
          keyInsights: [
            "Loss-framed messaging outperforms gain-framed by 30% in conversion tests",
            "People feel losses 2x more intensely than equivalent gains—use this in your copy",
            'Amazon leverages loss aversion with scarcity messaging ("Only 2 left in stock")',
            'Frame offers as preventing loss: "Don\'t miss out" beats "Get this benefit"',
          ],
          psychologyPrinciple: {
            name: "Loss Aversion",
            explanation:
              "This article directly explains loss aversion—a cognitive bias where the psychological pain of losing outweighs the pleasure of gaining. Business owners can apply this by reframing value propositions to emphasize what customers risk losing.",
          },
          actionableFramework: {
            title: "3-Step Loss Aversion Framework",
            steps: [
              "Identify what your customer stands to lose without your product (time, money, opportunity)",
              'Reframe your messaging to highlight the loss: "Stop wasting $X" instead of "Save $X"',
              'Add urgency elements that emphasize scarcity or time limits: "Last chance before..."',
            ],
          },
        }),
      },
    ],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      input_tokens: 500,
      output_tokens: 300,
      server_tool_use: null,
      service_tier: null,
    },
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup default mock response (this acts as fallback for any call beyond the queued Once methods)
    mockCreate.mockResolvedValue(mockClaudeResponse);

    summarizer = new ArticleSummarizer(mockConfig);
  });

  describe("summarize()", () => {
    it("should successfully summarize an article", async () => {
      const result = await summarizer.summarize(mockArticle);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.summary).toContain("Loss aversion");
      expect(result.data.keyInsights).toHaveLength(4);
      expect(result.data.psychologyPrinciple).toBeDefined();
      expect(result.data.psychologyPrinciple?.name).toBe("Loss Aversion");
      expect(result.data.actionableFramework).toBeDefined();
      expect(result.data.actionableFramework?.steps).toHaveLength(3);
      expect(result.data.metadata.tokensUsed).toBe(800);
      expect(result.data.metadata.fromCache).toBe(false);
    });

    it("should return cached result on second call", async () => {
      // First call
      const result1 = await summarizer.summarize(mockArticle);
      expect(result1.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await summarizer.summarize(mockArticle);
      expect(result2.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledTimes(1); // Still 1, not called again

      if (!result2.success) return;
      expect(result2.data.metadata.fromCache).toBe(true);
    });

    it("should validate article input", async () => {
      const invalidArticle = {
        ...mockArticle,
        content: "Too short", // Less than 100 characters
      };

      const result = await summarizer.summarize(invalidArticle);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.type).toBe(SummarizerErrorType.INVALID_INPUT);
      expect(result.error.message).toContain("too short");
    });

    it("should handle missing required fields", async () => {
      const invalidArticle = {
        ...mockArticle,
        title: "",
      } as ArticleInput;

      const result = await summarizer.summarize(invalidArticle);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.type).toBe(SummarizerErrorType.INVALID_INPUT);
    });

    it("should handle API errors gracefully", async () => {
      const apiError = new MockAPIError(
        500,
        { error: "Internal server error" },
        "Server error",
        {},
      );
      mockCreate.mockRejectedValue(apiError);

      const result = await summarizer.summarize(mockArticle);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.type).toBe(SummarizerErrorType.API_ERROR);
    });

    it("should handle parsing errors when Claude returns invalid JSON", async () => {
      const invalidResponse = {
        ...mockClaudeResponse,
        content: [
          {
            type: "text",
            text: "This is not valid JSON",
          },
        ],
      };

      mockCreate.mockResolvedValue(invalidResponse);

      const result = await summarizer.summarize(mockArticle);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.type).toBe(SummarizerErrorType.PARSING_ERROR);
    });

    it("should retry on retryable errors", async () => {
      // Setup mock to fail once then succeed
      mockCreate
        .mockRejectedValueOnce(new MockAPIError(429, { error: "Rate limit" }, "Rate limited", {}))
        .mockResolvedValueOnce(mockClaudeResponse);

      const retrySummarizer = new ArticleSummarizer({
        ...mockConfig,
        enableCache: false, // Disable cache for this test
      });

      const result = await retrySummarizer.summarize(mockArticle);

      expect(result.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("should handle articles without psychology principles", async () => {
      const responseWithoutPrinciple = {
        ...mockClaudeResponse,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              summary: "Test summary without psychology principle",
              keyInsights: ["Insight 1", "Insight 2", "Insight 3"],
              psychologyPrinciple: null,
              actionableFramework: null,
            }),
          },
        ],
      };

      mockCreate.mockResolvedValueOnce(responseWithoutPrinciple);

      // Use a different article to avoid cache hit
      const differentArticle = {
        ...mockArticle,
        id: "different-article",
        url: "https://example.com/different-article",
      };

      const result = await summarizer.summarize(differentArticle);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.psychologyPrinciple).toBeUndefined();
      expect(result.data.actionableFramework).toBeUndefined();
    });
  });

  describe("summarizeBatch()", () => {
    const mockArticles: ArticleInput[] = [
      mockArticle,
      {
        ...mockArticle,
        id: "test-article-2",
        title: "Different Article",
        url: "https://example.com/article-2",
      },
      {
        ...mockArticle,
        id: "test-article-3",
        title: "Another Article",
        url: "https://example.com/article-3",
      },
    ];

    it("should process multiple articles successfully", async () => {
      const result = await summarizer.summarizeBatch(mockArticles);

      expect(result.stats.total).toBe(3);
      expect(result.stats.successful).toBe(3);
      expect(result.stats.failed).toBe(0);
      expect(result.successful).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
    });

    it("should handle mixed success and failure", async () => {
      // Clear cache to ensure fresh API calls
      summarizer.clearCache();

      // Make second call fail with non-retryable error (400 = Bad Request)
      mockCreate
        .mockResolvedValueOnce(mockClaudeResponse)
        .mockRejectedValueOnce(new MockAPIError(400, { error: "Bad request" }, "Error", {}))
        .mockResolvedValueOnce(mockClaudeResponse);

      const result = await summarizer.summarizeBatch(mockArticles);

      expect(result.stats.successful).toBe(2);
      expect(result.stats.failed).toBe(1);
      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(1);
    });

    it("should respect concurrency limits", async () => {
      const manyArticles = Array.from({ length: 10 }, (_, i) => ({
        ...mockArticle,
        id: `article-${i}`,
        url: `https://example.com/article-${i}`,
      }));

      const result = await summarizer.summarizeBatch(manyArticles, {
        concurrency: 2,
      });

      expect(result.stats.total).toBe(10);
      expect(result.stats.successful).toBe(10);
    });

    it("should call progress callback", async () => {
      const onProgress = vi.fn();

      await summarizer.summarizeBatch(mockArticles, {
        onProgress,
      });

      expect(onProgress).toHaveBeenCalledWith(1, 3);
      expect(onProgress).toHaveBeenCalledWith(2, 3);
      expect(onProgress).toHaveBeenCalledWith(3, 3);
    });

    it("should stop on error when stopOnError is true", async () => {
      // Clear cache to ensure fresh API calls
      summarizer.clearCache();

      // Use non-retryable error (400 = Bad Request)
      mockCreate
        .mockResolvedValueOnce(mockClaudeResponse)
        .mockRejectedValueOnce(new MockAPIError(400, { error: "Bad request" }, "Error", {}))
        .mockResolvedValueOnce(mockClaudeResponse);

      const result = await summarizer.summarizeBatch(mockArticles, {
        stopOnError: true,
      });

      expect(result.stats.successful).toBe(1);
      expect(result.stats.failed).toBe(1);
      // Third article should not be processed
      expect(result.stats.successful + result.stats.failed).toBe(2);
    });

    it("should track cache hits in batch stats", async () => {
      // First batch - no cache
      const result1 = await summarizer.summarizeBatch(mockArticles);
      expect(result1.stats.cacheHits).toBe(0);

      // Second batch - all from cache
      const result2 = await summarizer.summarizeBatch(mockArticles);
      expect(result2.stats.cacheHits).toBe(3);
    });
  });

  describe("Cache management", () => {
    it("should provide cache statistics", () => {
      const stats = summarizer.getCacheStats();
      expect(stats).toBeDefined();
      expect(stats?.size).toBe(0);
    });

    it("should clear cache", async () => {
      await summarizer.summarize(mockArticle);

      let stats = summarizer.getCacheStats();
      expect(stats?.size).toBe(1);

      summarizer.clearCache();

      stats = summarizer.getCacheStats();
      expect(stats?.size).toBe(0);
    });
  });

  describe("Rate limiting", () => {
    it("should provide rate limit status", () => {
      const status = summarizer.getRateLimitStatus();
      // Should be null because we disabled rate limiting in config
      expect(status).toBeNull();
    });

    it("should enforce rate limits when enabled", async () => {
      const rateLimitedSummarizer = new ArticleSummarizer({
        ...mockConfig,
        enableRateLimiting: true,
        requestsPerMinute: 1,
        enableCache: false, // Disable cache to test rate limiting
      });

      // First request should succeed
      const result1 = await rateLimitedSummarizer.summarize(mockArticle);
      expect(result1.success).toBe(true);

      // Second request should fail with rate limit error
      const result2 = await rateLimitedSummarizer.summarize({
        ...mockArticle,
        id: "different-article",
        url: "https://example.com/different",
      });

      expect(result2.success).toBe(false);
      if (result2.success) return;

      expect(result2.error.type).toBe(SummarizerErrorType.RATE_LIMIT_EXCEEDED);
    });
  });

  describe("Cleanup", () => {
    it("should cleanup resources on destroy", () => {
      expect(() => summarizer.destroy()).not.toThrow();
    });
  });
});
