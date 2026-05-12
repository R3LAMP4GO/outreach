import Bottleneck from "bottleneck";
import {
  Article,
  SourceConfig,
  FetchResult,
  SourceError,
  SourceErrorCode,
} from "../../types/article";
import {
  logger,
  logSourceFetchStart,
  logSourceFetchComplete,
  logSourceFetchError,
} from "../../lib/logger";
import { withRateLimit, rssRateLimiter } from "../../lib/rate-limiter";

/**
 * Abstract Base Source Class
 *
 * Provides common functionality for all content sources:
 * - Rate limiting
 * - Error handling with retries
 * - Structured logging
 * - Timeout management
 * - Result standardization
 */

export abstract class BaseSource {
  protected config: SourceConfig;
  protected rateLimiter: Bottleneck;

  constructor(config: SourceConfig, rateLimiter?: Bottleneck) {
    // Apply defaults for missing config values
    this.config = {
      ...config,
      timeout: config.timeout ?? 10000,
      retryAttempts: config.retryAttempts ?? 3,
    };
    this.rateLimiter = rateLimiter || rssRateLimiter;
  }

  /**
   * Abstract method to be implemented by concrete sources
   */
  protected abstract fetchArticlesImpl(): Promise<Article[]>;

  /**
   * Fetch articles with full error handling and rate limiting
   */
  public async fetchArticles(): Promise<FetchResult> {
    const startTime = Date.now();
    logSourceFetchStart(this.config.name, this.config.url);

    try {
      // Wrap fetch with rate limiting
      const rateLimitedFetch = withRateLimit(() => this.fetchWithRetry(), this.rateLimiter);

      const rawArticles = await rateLimitedFetch();
      const articles = this.filterAndLimitArticles(rawArticles);
      const duration = Date.now() - startTime;

      logSourceFetchComplete(this.config.name, articles.length, duration);

      return {
        success: true,
        source: this.config.name,
        articles,
        metadata: {
          fetchedAt: new Date(),
          duration,
          articleCount: articles.length,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logSourceFetchError(this.config.name, this.config.url, error);

      const sourceError =
        error instanceof SourceError
          ? error
          : new SourceError(
              error instanceof Error ? error.message : "Unknown error",
              SourceErrorCode.UNKNOWN_ERROR,
              this.config.name,
              error instanceof Error ? error : undefined,
            );

      return {
        success: false,
        source: this.config.name,
        articles: [],
        error: {
          message: sourceError.message,
          code: sourceError.code,
          stack: sourceError.stack,
        },
        metadata: {
          fetchedAt: new Date(),
          duration,
          articleCount: 0,
        },
      };
    }
  }

  /**
   * Fetch with automatic retry and exponential backoff
   */
  private async fetchWithRetry(): Promise<Article[]> {
    const maxAttempts = this.config.retryAttempts + 1;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Add timeout wrapper
        const articles = await this.fetchWithTimeout();
        return articles;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        logger.warn(
          {
            source: this.config.name,
            attempt: attempt + 1,
            maxAttempts,
            error: lastError.message,
          },
          `Fetch attempt ${attempt + 1}/${maxAttempts} failed`,
        );

        // Don't retry on certain errors
        if (error instanceof SourceError) {
          if (
            error.code === SourceErrorCode.INVALID_URL ||
            error.code === SourceErrorCode.AUTH_ERROR ||
            error.code === SourceErrorCode.INVALID_FEED
          ) {
            throw error; // Don't retry these
          }
        }

        // Wait before retrying (exponential backoff)
        if (attempt < maxAttempts - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          logger.info({ source: this.config.name, delay }, `Retrying after ${delay}ms`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw (
      lastError ||
      new SourceError("All retry attempts failed", SourceErrorCode.UNKNOWN_ERROR, this.config.name)
    );
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(): Promise<Article[]> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new SourceError(
              `Fetch timeout after ${this.config.timeout}ms`,
              SourceErrorCode.TIMEOUT,
              this.config.name,
            ),
          ),
        this.config.timeout,
      );
    });

    try {
      return await Promise.race([this.fetchArticlesImpl(), timeoutPromise]);
    } catch (error) {
      if (error instanceof SourceError) {
        throw error;
      }
      throw new SourceError(
        error instanceof Error ? error.message : "Fetch failed",
        SourceErrorCode.NETWORK_ERROR,
        this.config.name,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Validate article has required fields
   */
  protected validateArticle(article: Partial<Article>): boolean {
    if (!article.title || !article.url || !article.publishedAt) {
      logger.warn(
        {
          source: this.config.name,
          article: { title: article.title, url: article.url },
        },
        "Article missing required fields",
      );
      return false;
    }
    return true;
  }

  /**
   * Filter and limit articles
   */
  protected filterAndLimitArticles(articles: Article[]): Article[] {
    // Remove duplicates by url
    const uniqueArticles = articles.reduce((acc, article) => {
      if (!acc.find((a) => a.url === article.url)) {
        acc.push(article);
      }
      return acc;
    }, [] as Article[]);

    // Apply max articles limit if set
    if (this.config.maxArticles && uniqueArticles.length > this.config.maxArticles) {
      logger.info(
        {
          source: this.config.name,
          total: uniqueArticles.length,
          limit: this.config.maxArticles,
        },
        "Limiting articles to max count",
      );
      return uniqueArticles.slice(0, this.config.maxArticles);
    }

    return uniqueArticles;
  }

  /**
   * Get source name
   */
  public getName(): string {
    return this.config.name;
  }

  /**
   * Check if source is enabled
   */
  public isEnabled(): boolean {
    return this.config.enabled;
  }
}
