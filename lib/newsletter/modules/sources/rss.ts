import Parser from "rss-parser";
import Bottleneck from "bottleneck";
import { BaseSource } from "./base-source";
import { Article, SourceConfig, SourceError, SourceErrorCode } from "../../types/article";
import { logger } from "../../lib/logger";

/**
 * RSS Content Source
 *
 * Fetches articles from RSS feeds with:
 * - Parallel feed fetching
 * - Graceful failure handling
 * - Field normalization
 * - Automatic retry with exponential backoff
 * - Rate limiting (inherited from BaseSource)
 */

export interface RSSSourceConfig extends SourceConfig {
  type: "rss";
  // RSS-specific configuration
  customFields?: {
    feed?: string[];
    item?: string[];
  };
}

export class RSSSource extends BaseSource {
  private parser: Parser;

  constructor(config: RSSSourceConfig, rateLimiter?: Bottleneck) {
    super(config, rateLimiter);
    this.parser = new Parser({
      customFields: config.customFields,
      timeout: config.timeout,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)",
        ...config.headers,
      },
    });
  }

  /**
   * Fetch articles from RSS feed
   */
  protected async fetchArticlesImpl(): Promise<Article[]> {
    try {
      logger.debug({ source: this.config.name, url: this.config.url }, "Parsing RSS feed");

      const feedData = await this.parser.parseURL(this.config.url);

      if (!feedData.items || feedData.items.length === 0) {
        logger.warn({ source: this.config.name }, "RSS feed contains no items");
        return [];
      }

      logger.info(
        { source: this.config.name, itemCount: feedData.items.length },
        "Successfully parsed RSS feed",
      );

      // Convert RSS items to Article format
      const articles = feedData.items
        .map((item) => this.convertToArticle(item))
        .filter((article): article is Article => article !== null);

      // Filter and limit
      return this.filterAndLimitArticles(articles);
    } catch (error) {
      throw this.handleRSSError(error);
    }
  }

  /**
   * Convert RSS item to Article format
   */
  private convertToArticle(item: Parser.Item): Article | null {
    try {
      // Validate required fields
      if (!item.title || !item.link) {
        logger.warn(
          { source: this.config.name, item: { title: item.title, link: item.link } },
          "RSS item missing required fields",
        );
        return null;
      }

      // Parse publication date
      const pubDate = item.pubDate
        ? new Date(item.pubDate)
        : item.isoDate
          ? new Date(item.isoDate)
          : new Date();

      // Validate date
      if (isNaN(pubDate.getTime())) {
        logger.warn(
          { source: this.config.name, item: item.title, pubDate: item.pubDate },
          "Invalid publication date, using current date",
        );
        pubDate.setTime(Date.now());
      }

      const article: Article = {
        id: item.guid || `rss:${this.config.url}:${item.link}`,
        title: this.sanitizeText(item.title),
        url: item.link,
        content: item.content
          ? this.sanitizeText(item.content)
          : item.contentSnippet
            ? this.sanitizeText(item.contentSnippet)
            : "",
        author: item.creator || (item as { author?: string }).author,
        publishedAt: pubDate,
        source: `rss:${this.config.name}`,

        // Store RSS-specific data as metadata
        metadata: {
          guid: item.guid,
          isoDate: item.isoDate,
          categories: item.categories?.join(", "),
          excerpt: item.summary ? this.sanitizeText(item.summary) : undefined,
          imageUrl: this.extractImageUrl(item),
          enclosureUrl: item.enclosure?.url,
          enclosureType: item.enclosure?.type,
          enclosureLength: item.enclosure?.length
            ? parseInt(String(item.enclosure.length), 10).toString()
            : undefined,
        },

        // Required fields with defaults
        status: "pending" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return article;
    } catch (error) {
      logger.error(
        { source: this.config.name, error, item: item.title },
        "Failed to convert RSS item to article",
      );
      return null;
    }
  }

  /**
   * Extract image URL from various RSS fields
   */
  private extractImageUrl(item: Parser.Item): string | undefined {
    // Try enclosure first
    if (item.enclosure?.url && item.enclosure.type?.startsWith("image/")) {
      return item.enclosure.url;
    }

    // Try media:thumbnail or media:content
    const mediaContent = (item as { "media:thumbnail"?: { $?: { url?: string } } })[
      "media:thumbnail"
    ];
    if (mediaContent?.$?.url) {
      return mediaContent.$.url;
    }

    // Try itunes:image
    const itunesImage = (item as { "itunes:image"?: { $?: { href?: string } } })["itunes:image"];
    if (itunesImage?.$?.href) {
      return itunesImage.$.href;
    }

    // Try to extract from content
    if (item.content) {
      const imgMatch = item.content.match(/<img[^>]+src="([^">]+)"/);
      if (imgMatch) {
        return imgMatch[1];
      }
    }

    return undefined;
  }

  /**
   * Sanitize text content (remove HTML, trim whitespace)
   */
  private sanitizeText(text: string): string {
    return text
      .replace(/<[^>]*>/g, "") // Remove HTML tags
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();
  }

  /**
   * Handle RSS-specific errors
   */
  private handleRSSError(error: unknown): SourceError {
    if (error instanceof SourceError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const originalError = error instanceof Error ? error : undefined;

    // Detect specific error types
    if (message.includes("Invalid URL") || message.includes("ENOTFOUND")) {
      return new SourceError(
        `Invalid RSS feed URL: ${this.config.url}`,
        SourceErrorCode.INVALID_URL,
        this.config.name,
        originalError,
      );
    }

    if (message.includes("timeout") || message.includes("ETIMEDOUT")) {
      return new SourceError(
        `RSS feed timeout: ${this.config.url}`,
        SourceErrorCode.TIMEOUT,
        this.config.name,
        originalError,
      );
    }

    if (message.includes("Parse Error") || message.includes("Invalid XML")) {
      return new SourceError(
        `Invalid RSS feed format: ${this.config.url}`,
        SourceErrorCode.PARSE_ERROR,
        this.config.name,
        originalError,
      );
    }

    if (message.includes("429") || message.includes("rate limit")) {
      return new SourceError(
        `Rate limited by RSS feed: ${this.config.url}`,
        SourceErrorCode.RATE_LIMIT,
        this.config.name,
        originalError,
      );
    }

    if (message.includes("401") || message.includes("403")) {
      return new SourceError(
        `Authentication failed for RSS feed: ${this.config.url}`,
        SourceErrorCode.AUTH_ERROR,
        this.config.name,
        originalError,
      );
    }

    return new SourceError(
      `RSS fetch failed: ${message}`,
      SourceErrorCode.NETWORK_ERROR,
      this.config.name,
      originalError,
    );
  }
}

/**
 * Fetch from multiple RSS feeds in parallel
 */
export async function fetchMultipleRSSFeeds(
  configs: RSSSourceConfig[],
  rateLimiter?: Bottleneck,
): Promise<Map<string, Article[]>> {
  logger.info({ feedCount: configs.length }, "Fetching multiple RSS feeds in parallel");

  const results = new Map<string, Article[]>();
  const startTime = Date.now();

  // Fetch all feeds in parallel
  const fetchPromises = configs
    .filter((config) => config.enabled)
    .map(async (config) => {
      const source = new RSSSource(config, rateLimiter);
      const result = await source.fetchArticles();

      if (result.success) {
        results.set(config.name, result.articles);
        logger.info(
          { source: config.name, articleCount: result.articles.length },
          "Successfully fetched RSS feed",
        );
      } else {
        logger.error({ source: config.name, error: result.error }, "Failed to fetch RSS feed");
        results.set(config.name, []); // Store empty array on failure
      }

      return result;
    });

  // Wait for all feeds to complete
  await Promise.allSettled(fetchPromises);

  const duration = Date.now() - startTime;
  const totalArticles = Array.from(results.values()).reduce(
    (sum, articles) => sum + articles.length,
    0,
  );

  logger.info(
    {
      feedCount: configs.length,
      successCount: results.size,
      totalArticles,
      duration,
    },
    "Completed fetching multiple RSS feeds",
  );

  return results;
}

/**
 * Pre-configured RSS sources for testing
 */
export const DEFAULT_RSS_SOURCES: RSSSourceConfig[] = [
  {
    name: "Harvard Business Review",
    url: "https://hbr.org/feed",
    type: "rss",
    enabled: true,
    maxArticles: 10,
    timeout: 15000,
    retryAttempts: 3,
  },
  {
    name: "MIT Sloan Management Review",
    url: "https://mitsloan.mit.edu/rss.xml",
    type: "rss",
    enabled: true,
    maxArticles: 10,
    timeout: 15000,
    retryAttempts: 3,
  },
  {
    name: "Entrepreneur",
    url: "https://www.entrepreneur.com/latest.rss",
    type: "rss",
    enabled: true,
    maxArticles: 10,
    timeout: 15000,
    retryAttempts: 3,
  },
  {
    name: "Behavioral Economics",
    url: "https://www.behavioraleconomics.com/feed/",
    type: "rss",
    enabled: true,
    maxArticles: 10,
    timeout: 15000,
    retryAttempts: 3,
  },
  {
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    type: "rss",
    enabled: true,
    maxArticles: 10,
    timeout: 15000,
    retryAttempts: 3,
  },
];
