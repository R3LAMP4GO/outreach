/**
 * AI Summarization Module using Anthropic Claude
 * Optimized for business owner audiences with psychology-backed insights
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  ArticleInput,
  EnrichedArticle,
  SummarizerConfig,
  SummarizerResult,
  BatchSummarizationOptions,
  BatchSummarizationResult,
} from "../../types/summarizer";
import { SummarizerError, SummarizerErrorType } from "../../types/summarizer";
import { SummaryCache } from "./cache";
import { RateLimiter } from "./rate-limiter";

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<Omit<SummarizerConfig, "apiKey">> = {
  model: "claude-3-5-sonnet-20241022",
  maxTokens: 1024,
  temperature: 0.3,
  enableCache: true,
  cacheTtlSeconds: 7 * 24 * 60 * 60, // 7 days
  enableRateLimiting: true,
  requestsPerMinute: 50,
  tokensPerMinute: 50000,
  maxRetries: 3,
  retryBaseDelayMs: 1000,
  timeoutMs: 30000,
};

/**
 * Psychology-optimized system prompt based on research
 */
const SYSTEM_PROMPT = `You are an expert content strategist specializing in creating newsletter content for busy business owners and entrepreneurs.

Your expertise includes:
- Behavioral psychology and cognitive biases (Loss Aversion, Social Proof, FOMO, Anchoring)
- Decision-making patterns of entrepreneurs
- Attention economy and information consumption habits
- Emotional triggers that drive engagement

Your audience:
- Business owners with 8-second attention spans
- Seeking actionable insights over theoretical knowledge
- Making decisions emotionally, then justifying rationally
- Valuing pattern-based frameworks they can apply repeatedly

Your communication style:
- Concise and scannable (bullets over paragraphs)
- Specific over vague (numbers, timeframes, concrete examples)
- Loss-framed when appropriate ("Stop losing X" vs "Gain X")
- Pattern-interrupt with surprising insights
- Bridge knowledge gaps with plain language`;

/**
 * Psychology-optimized user prompt template
 */
const createUserPrompt = (article: ArticleInput): string => {
  return `Analyze this article and create a psychology-optimized summary for business owners:

ARTICLE TITLE: ${article.title}
SOURCE: ${article.source || "Unknown"}
URL: ${article.url}
PUBLISHED: ${article.publishedAt.toLocaleDateString()}
${article.author ? `AUTHOR: ${article.author}` : ""}

ARTICLE CONTENT:
${article.content}

---

Create a structured analysis with the following sections:

1. SUMMARY (2-3 sentences, max 150 words):
   - Focus on what business owners can DO with this information
   - Lead with the most valuable insight
   - Use specific numbers/timeframes when available
   - Frame for action, not passive learning

2. KEY INSIGHTS (3-5 bullet points):
   - Each bullet should be actionable or paradigm-shifting
   - Use pattern-based language: "This is the same approach [successful company] uses..."
   - Include specific examples or data points
   - Address common pain points or fears
   - Keep each bullet to 1-2 sentences max

3. PSYCHOLOGY PRINCIPLE (if applicable):
   - Identify if the content relates to a cognitive bias or psychological principle
   - Common principles: Loss Aversion, Social Proof, Anchoring, Confirmation Bias, Scarcity, Reciprocity, Authority, etc.
   - Explain how this principle applies to the content in 1-2 sentences
   - Only include if clearly relevant (not forced)

4. ACTIONABLE FRAMEWORK (if applicable):
   - Extract any step-by-step process, framework, or methodology
   - Title the framework clearly
   - List 3-7 concrete steps
   - Each step should be specific and implementable
   - Only include if content contains a clear framework (not every article will have one)

FORMAT YOUR RESPONSE AS JSON:
{
  "summary": "Your 2-3 sentence summary here",
  "keyInsights": [
    "First insight with specific detail",
    "Second insight with actionable advice",
    "Third insight..."
  ],
  "psychologyPrinciple": {
    "name": "Name of Principle",
    "explanation": "How it applies to this content"
  } OR null if not applicable,
  "actionableFramework": {
    "title": "Framework Name",
    "steps": [
      "Step 1: Specific action",
      "Step 2: Specific action",
      "Step 3: Specific action"
    ]
  } OR null if not applicable
}

IMPORTANT: Return ONLY the JSON object, no additional text.`;
};

/**
 * Main Summarizer class
 */
export class ArticleSummarizer {
  private client: Anthropic;
  private config: Required<SummarizerConfig>;
  private cache?: SummaryCache;
  private rateLimiter?: RateLimiter;

  constructor(config: SummarizerConfig) {
    // Merge with defaults
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    // Initialize Anthropic client
    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      timeout: this.config.timeoutMs,
    });

    // Initialize cache if enabled
    if (this.config.enableCache) {
      this.cache = new SummaryCache(this.config.cacheTtlSeconds);
    }

    // Initialize rate limiter if enabled
    if (this.config.enableRateLimiting) {
      this.rateLimiter = new RateLimiter(
        this.config.requestsPerMinute,
        this.config.tokensPerMinute,
      );
    }
  }

  /**
   * Summarize a single article
   */
  async summarize(article: ArticleInput): Promise<SummarizerResult> {
    try {
      // Validate input
      this.validateArticle(article);

      // Check cache first
      if (this.cache) {
        const cached = this.cache.get(article.url, article.content);
        if (cached) {
          return { success: true, data: cached };
        }
      }

      // Check rate limits
      if (this.rateLimiter) {
        await this.rateLimiter.checkLimit(2000); // Estimate 2000 tokens
      }

      // Call Claude API with retry logic
      const enrichedArticle = await this.summarizeWithRetry(article);

      // Cache the result
      if (this.cache) {
        this.cache.set(enrichedArticle);
      }

      return { success: true, data: enrichedArticle };
    } catch (error) {
      if (error instanceof SummarizerError) {
        return { success: false, error };
      }

      // Wrap unknown errors
      return {
        success: false,
        error: new SummarizerError(
          "Unknown error during summarization",
          SummarizerErrorType.UNKNOWN,
          error instanceof Error ? error : undefined,
        ),
      };
    }
  }

  /**
   * Summarize multiple articles in batch
   */
  async summarizeBatch(
    articles: ArticleInput[],
    options: BatchSummarizationOptions = {},
  ): Promise<BatchSummarizationResult> {
    const { concurrency = 5, stopOnError = false, onProgress } = options;

    const result: BatchSummarizationResult = {
      successful: [],
      failed: [],
      stats: {
        total: articles.length,
        successful: 0,
        failed: 0,
        cacheHits: 0,
        totalTokens: 0,
        totalTimeMs: 0,
      },
    };

    const startTime = Date.now();

    // Process in batches with concurrency control
    for (let i = 0; i < articles.length; i += concurrency) {
      const batch = articles.slice(i, i + concurrency);
      const promises = batch.map((article) => this.summarize(article));

      const results = await Promise.allSettled(promises);

      for (let j = 0; j < results.length; j++) {
        const articleResult = results[j];
        const article = batch[j];

        if (articleResult.status === "fulfilled" && articleResult.value.success) {
          const enriched = articleResult.value.data;
          result.successful.push(enriched);
          result.stats.successful++;
          result.stats.totalTokens += enriched.metadata.tokensUsed;

          if (enriched.metadata.fromCache) {
            result.stats.cacheHits++;
          }
        } else {
          const error =
            articleResult.status === "fulfilled" && !articleResult.value.success
              ? articleResult.value.error
              : new SummarizerError(
                  "Promise rejected",
                  SummarizerErrorType.UNKNOWN,
                  articleResult.status === "rejected" ? articleResult.reason : undefined,
                );

          result.failed.push({ article, error });
          result.stats.failed++;

          if (stopOnError) {
            break;
          }
        }

        // Call progress callback
        if (onProgress) {
          onProgress(result.stats.successful + result.stats.failed, articles.length);
        }
      }

      if (stopOnError && result.failed.length > 0) {
        break;
      }
    }

    result.stats.totalTimeMs = Date.now() - startTime;

    return result;
  }

  /**
   * Validate article input
   */
  private validateArticle(article: ArticleInput): void {
    if (!article.id || typeof article.id !== "string") {
      throw new SummarizerError(
        "Article ID is required and must be a string",
        SummarizerErrorType.INVALID_INPUT,
      );
    }

    if (!article.title || typeof article.title !== "string") {
      throw new SummarizerError(
        "Article title is required and must be a string",
        SummarizerErrorType.INVALID_INPUT,
      );
    }

    if (!article.content || typeof article.content !== "string") {
      throw new SummarizerError(
        "Article content is required and must be a string",
        SummarizerErrorType.INVALID_INPUT,
      );
    }

    if (article.content.length < 100) {
      throw new SummarizerError(
        "Article content is too short (minimum 100 characters)",
        SummarizerErrorType.INVALID_INPUT,
      );
    }

    if (!article.url || typeof article.url !== "string") {
      throw new SummarizerError(
        "Article URL is required and must be a string",
        SummarizerErrorType.INVALID_INPUT,
      );
    }

    if (!(article.publishedAt instanceof Date)) {
      throw new SummarizerError(
        "Article publishedAt must be a Date object",
        SummarizerErrorType.INVALID_INPUT,
      );
    }
  }

  /**
   * Summarize with retry logic and exponential backoff
   */
  private async summarizeWithRetry(
    article: ArticleInput,
    attemptNumber: number = 1,
  ): Promise<EnrichedArticle> {
    try {
      const startTime = Date.now();

      // Call Claude API
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: createUserPrompt(article),
          },
        ],
      });

      const processingTimeMs = Date.now() - startTime;

      // Record token usage in rate limiter
      const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
      if (this.rateLimiter) {
        this.rateLimiter.recordRequest(tokensUsed);
      }

      // Parse response
      const enrichedData = this.parseResponse(response);

      // Construct enriched article
      const enrichedArticle: EnrichedArticle = {
        article,
        ...enrichedData,
        metadata: {
          processedAt: new Date(),
          model: this.config.model,
          tokensUsed,
          processingTimeMs,
          fromCache: false,
        },
      };

      return enrichedArticle;
    } catch (error) {
      // Check if we should retry
      if (attemptNumber < this.config.maxRetries) {
        const isRetryable = this.isRetryableError(error);

        if (isRetryable) {
          // Exponential backoff
          const delayMs = this.config.retryBaseDelayMs * Math.pow(2, attemptNumber - 1);
          await new Promise((resolve) => setTimeout(resolve, delayMs));

          // Retry
          return this.summarizeWithRetry(article, attemptNumber + 1);
        }
      }

      // Convert to SummarizerError
      throw this.convertToSummarizerError(error);
    }
  }

  /**
   * Parse Claude API response
   */
  private parseResponse(
    response: Anthropic.Message,
  ): Omit<EnrichedArticle, "article" | "metadata"> {
    try {
      // Extract text content
      const content = response.content[0];
      if (content.type !== "text") {
        throw new Error("Expected text response from Claude");
      }

      const text = content.text.trim();

      // Remove markdown code blocks if present
      const jsonText = text.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "");

      // Parse JSON
      const parsed = JSON.parse(jsonText);

      // Validate structure
      if (!parsed.summary || typeof parsed.summary !== "string") {
        throw new Error("Missing or invalid summary in response");
      }

      if (!Array.isArray(parsed.keyInsights) || parsed.keyInsights.length === 0) {
        throw new Error("Missing or invalid keyInsights in response");
      }

      return {
        summary: parsed.summary,
        keyInsights: parsed.keyInsights,
        psychologyPrinciple: parsed.psychologyPrinciple || undefined,
        actionableFramework: parsed.actionableFramework || undefined,
      };
    } catch (error) {
      throw new SummarizerError(
        "Failed to parse Claude API response",
        SummarizerErrorType.PARSING_ERROR,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof SummarizerError) {
      return error.retryable;
    }

    if (error instanceof Anthropic.APIError) {
      // Retry on rate limits and server errors
      return (
        error.status === 429 || // Rate limit
        error.status === 500 || // Internal server error
        error.status === 502 || // Bad gateway
        error.status === 503 || // Service unavailable
        error.status === 504 // Gateway timeout
      );
    }

    // Retry on network errors
    if (error instanceof Error) {
      return (
        error.message.includes("ECONNRESET") ||
        error.message.includes("ETIMEDOUT") ||
        error.message.includes("ENOTFOUND")
      );
    }

    return false;
  }

  /**
   * Convert various error types to SummarizerError
   */
  private convertToSummarizerError(error: unknown): SummarizerError {
    if (error instanceof SummarizerError) {
      return error;
    }

    if (error instanceof Anthropic.APIError) {
      if (error.status === 429) {
        return new SummarizerError(
          "Claude API rate limit exceeded",
          SummarizerErrorType.RATE_LIMIT_EXCEEDED,
          error,
          true,
        );
      }

      if (error.status === 408 || error.status === 504) {
        return new SummarizerError("Request timeout", SummarizerErrorType.TIMEOUT, error, true);
      }

      return new SummarizerError(
        `Claude API error: ${error.message}`,
        SummarizerErrorType.API_ERROR,
        error,
        this.isRetryableError(error),
      );
    }

    if (error instanceof Error) {
      if (
        error.message.includes("ECONNRESET") ||
        error.message.includes("ETIMEDOUT") ||
        error.message.includes("ENOTFOUND")
      ) {
        return new SummarizerError("Network error", SummarizerErrorType.NETWORK_ERROR, error, true);
      }
    }

    return new SummarizerError(
      "Unknown error",
      SummarizerErrorType.UNKNOWN,
      error instanceof Error ? error : undefined,
      false,
    );
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache?.getStats() || null;
  }

  /**
   * Get rate limiter status
   */
  getRateLimitStatus() {
    return this.rateLimiter?.getRemainingCapacity() || null;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache?.clear();
  }

  /**
   * Graceful shutdown
   */
  destroy(): void {
    this.cache?.destroy();
  }
}
