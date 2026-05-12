import { BaseSource } from "./base-source";
import { Article, SourceConfig, SourceError, SourceErrorCode } from "../../types/article";
import { logger } from "../../lib/logger";
import { createRateLimiter } from "../../lib/rate-limiter";
import Bottleneck from "bottleneck";

/**
 * Hacker News Content Source
 *
 * Fetches top stories from Hacker News Firebase API with:
 * - Smart rate limiting (60 req/min)
 * - Content filtering (skip Ask HN, Show HN without URLs, jobs)
 * - Engagement-based ranking
 * - Batch fetching for efficiency
 * - Automatic retry with exponential backoff (inherited from BaseSource)
 */

const HN_API_BASE = "https://hacker-news.firebaseio.com/v0";
const HN_ITEM_URL = "https://news.ycombinator.com/item?id=";

/**
 * Hacker News API response types
 */
interface HNItem {
  id: number;
  type: "story" | "comment" | "job" | "poll" | "pollopt";
  by: string;
  time: number;
  text?: string;
  dead?: boolean;
  deleted?: boolean;
  parent?: number;
  poll?: number;
  kids?: number[];
  url?: string;
  score?: number;
  title?: string;
  descendants?: number;
}

export interface HackerNewsSourceConfig extends SourceConfig {
  type: "hackernews";
  minScore?: number; // Minimum points threshold (default: 50)
  includeAskHN?: boolean; // Include Ask HN posts (default: false)
  includeShowHN?: boolean; // Include Show HN posts (default: false)
  includeJobs?: boolean; // Include job posts (default: false)
}

/**
 * Hacker News rate limiter
 * 60 requests per minute to be respectful
 */
export const hackerNewsRateLimiter = createRateLimiter({
  maxConcurrent: 5, // Allow 5 concurrent requests
  minTime: 1000, // Min 1 second between requests
  reservoir: 60, // 60 requests
  reservoirRefreshAmount: 60, // Refill to 60
  reservoirRefreshInterval: 60 * 1000, // Per minute
  id: "hackernews",
});

export class HackerNewsSource extends BaseSource {
  private minScore: number;
  private includeAskHN: boolean;
  private includeShowHN: boolean;
  private includeJobs: boolean;

  constructor(config: HackerNewsSourceConfig, rateLimiter?: Bottleneck) {
    // Set default URL for HN topstories endpoint
    const configWithDefaults = {
      ...config,
      url: config.url || `${HN_API_BASE}/topstories.json`,
    };

    super(configWithDefaults, rateLimiter || hackerNewsRateLimiter);

    this.minScore = config.minScore ?? 50;
    this.includeAskHN = config.includeAskHN ?? false;
    this.includeShowHN = config.includeShowHN ?? false;
    this.includeJobs = config.includeJobs ?? false;
  }

  /**
   * Fetch articles from Hacker News
   */
  protected async fetchArticlesImpl(): Promise<Article[]> {
    try {
      logger.debug({ source: this.config.name }, "Fetching Hacker News top stories");

      // Step 1: Get top story IDs
      const storyIds = await this.fetchTopStoryIds();

      if (storyIds.length === 0) {
        logger.warn({ source: this.config.name }, "No story IDs returned from HN API");
        return [];
      }

      logger.info(
        { source: this.config.name, storyCount: storyIds.length },
        "Fetched top story IDs from Hacker News",
      );

      // Step 2: Fetch story details in parallel
      const stories = await this.fetchStoryDetails(storyIds);

      logger.info(
        { source: this.config.name, fetchedCount: stories.length },
        "Fetched story details from Hacker News",
      );

      // Step 3: Filter and convert to Article format
      const articles = stories
        .filter((story) => this.shouldIncludeStory(story))
        .map((story) => this.convertToArticle(story))
        .filter((article): article is Article => article !== null);

      logger.info(
        { source: this.config.name, articleCount: articles.length },
        "Successfully processed Hacker News stories",
      );

      return articles;
    } catch (error) {
      // Re-throw SourceErrors as-is, convert others
      if (error instanceof SourceError) {
        throw error;
      }
      throw this.handleHNError(error);
    }
  }

  /**
   * Fetch top story IDs from HN API
   */
  private async fetchTopStoryIds(): Promise<number[]> {
    try {
      const response = await fetch(this.config.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)",
          ...this.config.headers,
        },
      });

      if (!response.ok) {
        throw new SourceError(
          `HN API returned status ${response.status}`,
          SourceErrorCode.NETWORK_ERROR,
          this.config.name,
        );
      }

      const storyIds: number[] = await response.json();

      // Limit to top 30 stories for processing
      const limit = this.config.maxArticles || 30;
      return storyIds.slice(0, limit);
    } catch (error) {
      // Re-throw SourceErrors
      if (error instanceof SourceError) {
        throw error;
      }
      // Convert other errors to SourceError
      throw this.handleHNError(error);
    }
  }

  /**
   * Fetch story details (parallel Promise.allSettled)
   */
  private async fetchStoryDetails(storyIds: number[]): Promise<HNItem[]> {
    const fetchPromises = storyIds.map((id) => this.fetchStory(id));
    const results = await Promise.allSettled(fetchPromises);

    const stories: HNItem[] = [];
    for (const result of results) {
      if (result.status === "fulfilled" && result.value !== null) {
        stories.push(result.value);
      }
    }

    return stories;
  }

  /**
   * Fetch individual story from HN API
   */
  private async fetchStory(id: number): Promise<HNItem | null> {
    try {
      const url = `${HN_API_BASE}/item/${id}.json`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)",
          ...this.config.headers,
        },
        signal: AbortSignal.timeout(this.config.timeout || 30000),
      });

      if (!response.ok) {
        logger.warn(
          { source: this.config.name, storyId: id, status: response.status },
          "Failed to fetch story",
        );
        return null;
      }

      const story: HNItem = await response.json();

      // Skip if story is null (deleted/dead)
      if (!story) {
        return null;
      }

      return story;
    } catch (error) {
      logger.warn(
        {
          source: this.config.name,
          storyId: id,
          error: error instanceof Error ? error.message : "Unknown",
        },
        "Error fetching story",
      );
      return null;
    }
  }

  /**
   * Determine if a story should be included based on filters
   */
  private shouldIncludeStory(story: HNItem): boolean {
    // Skip dead or deleted stories
    if (story.dead || story.deleted) {
      return false;
    }

    // Skip non-story/job types
    if (story.type !== "story" && story.type !== "job") {
      return false;
    }

    // Skip job posts unless explicitly included
    if (story.type === "job" && !this.includeJobs) {
      return false;
    }

    // Check minimum score threshold
    if (story.score !== undefined && story.score < this.minScore) {
      return false;
    }

    // Handle Ask HN posts
    if (story.title?.startsWith("Ask HN:")) {
      // Only include if explicitly allowed OR if it has an external URL
      if (!this.includeAskHN && !story.url) {
        return false;
      }
    }

    // Handle Show HN posts
    if (story.title?.startsWith("Show HN:")) {
      // Only include if explicitly allowed OR if it has an external URL
      if (!this.includeShowHN && !story.url) {
        return false;
      }
    }

    // Must have a title
    if (!story.title) {
      return false;
    }

    return true;
  }

  /**
   * Convert HN story to Article format
   * Note: Using same field names as RSS source for consistency
   */
  private convertToArticle(story: HNItem): Article | null {
    try {
      // Validate required fields
      if (!story.title || !story.id) {
        logger.warn(
          { source: this.config.name, storyId: story.id },
          "Story missing required fields",
        );
        return null;
      }

      // Use story URL if available, otherwise link to HN comments
      const link = story.url || `${HN_ITEM_URL}${story.id}`;

      // Parse publication date from unix timestamp
      const pubDate = new Date(story.time * 1000);

      // Validate date
      if (isNaN(pubDate.getTime())) {
        logger.warn(
          { source: this.config.name, storyId: story.id, time: story.time },
          "Invalid publication timestamp",
        );
        return null;
      }

      const article: Article = {
        id: `hn:${story.id}`,
        title: story.title,
        url: link,
        content: story.text || "",
        author: story.by,
        publishedAt: pubDate,
        source: `hackernews:${story.id}`,

        // Optional engagement data
        engagement: {
          upvotes: story.score,
          comments: story.descendants,
        },

        // Store HN-specific data as metadata
        metadata: {
          hnId: story.id.toString(),
          type: story.type,
        },

        // Required fields with defaults
        status: "pending" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return article;
    } catch (error) {
      logger.error(
        { source: this.config.name, error, storyId: story.id },
        "Failed to convert HN story to article",
      );
      return null;
    }
  }

  /**
   * Handle Hacker News-specific errors
   */
  private handleHNError(error: unknown): SourceError {
    if (error instanceof SourceError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const originalError = error instanceof Error ? error : undefined;

    // Detect specific error types
    if (message.includes("Invalid URL") || message.includes("ENOTFOUND")) {
      return new SourceError(
        `Invalid Hacker News API URL: ${this.config.url}`,
        SourceErrorCode.INVALID_URL,
        this.config.name,
        originalError,
      );
    }

    if (message.includes("timeout") || message.includes("ETIMEDOUT")) {
      return new SourceError(
        `Hacker News API timeout: ${this.config.url}`,
        SourceErrorCode.TIMEOUT,
        this.config.name,
        originalError,
      );
    }

    if (
      message.includes("JSON") ||
      message.includes("parse") ||
      message.includes("Unexpected token")
    ) {
      return new SourceError(
        `Invalid JSON response from Hacker News API`,
        SourceErrorCode.PARSE_ERROR,
        this.config.name,
        originalError,
      );
    }

    if (message.includes("429") || message.includes("rate limit")) {
      return new SourceError(
        `Rate limited by Hacker News API`,
        SourceErrorCode.RATE_LIMIT,
        this.config.name,
        originalError,
      );
    }

    if (message.includes("401") || message.includes("403")) {
      return new SourceError(
        `Authentication failed for Hacker News API`,
        SourceErrorCode.AUTH_ERROR,
        this.config.name,
        originalError,
      );
    }

    return new SourceError(
      `Hacker News fetch failed: ${message}`,
      SourceErrorCode.NETWORK_ERROR,
      this.config.name,
      originalError,
    );
  }
}

/**
 * Pre-configured Hacker News source
 */
export const DEFAULT_HN_SOURCE: HackerNewsSourceConfig = {
  name: "Hacker News",
  url: `${HN_API_BASE}/topstories.json`,
  type: "hackernews",
  enabled: true,
  maxArticles: 30,
  timeout: 30000, // 30 seconds for batch fetching
  retryAttempts: 3,
  minScore: 50,
  includeAskHN: false,
  includeShowHN: true, // Include Show HN with URLs
  includeJobs: false,
};
