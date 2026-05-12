import { BaseSource } from "./base-source";
import { Article, SourceConfig, SourceError, SourceErrorCode } from "../../types/article";
import { logger } from "../../lib/logger";
import { createRateLimiter } from "../../lib/rate-limiter";

/**
 * Reddit Content Source
 *
 * Fetches top posts from subreddits using the Reddit JSON API with:
 * - Multiple subreddit support
 * - Rate limiting (300 requests per 15 min = 20/min)
 * - Spam filtering
 * - Engagement metrics mapping
 * - Automatic retry with exponential backoff
 */

export interface RedditSourceConfig extends SourceConfig {
  type: "reddit";
  subreddits?: string[]; // List of subreddit names (without r/)
  timeframe?: "hour" | "day" | "week" | "month" | "year" | "all";
  minUpvotes?: number; // Filter posts below this threshold
  minComments?: number; // Filter posts with fewer comments
}

export interface RedditPost {
  data: {
    id: string;
    title: string;
    url: string;
    selftext: string;
    selftext_html: string | null;
    author: string;
    created_utc: number;
    subreddit: string;
    permalink: string;
    score: number; // upvotes - downvotes
    ups: number; // upvotes
    num_comments: number;
    total_awards_received: number;
    is_self: boolean; // true for text posts
    domain: string;
    over_18: boolean;
    stickied: boolean;
    distinguished: string | null; // 'moderator' | 'admin' | null
    link_flair_text: string | null;
    thumbnail: string;
    preview?: {
      images: Array<{
        source: {
          url: string;
          width: number;
          height: number;
        };
      }>;
    };
  };
}

export interface RedditResponse {
  kind: "Listing";
  data: {
    children: RedditPost[];
    after: string | null;
    before: string | null;
  };
}

/**
 * Reddit Rate Limiter
 * Reddit allows 300 requests per 15 minutes (20/min)
 * We'll be conservative: 15 requests per minute
 */
export const redditRateLimiter = createRateLimiter({
  maxConcurrent: 2, // Allow 2 concurrent requests
  minTime: 4000, // Min 4 seconds between requests
  reservoir: 15, // 15 requests
  reservoirRefreshAmount: 15, // Refill to 15
  reservoirRefreshInterval: 60 * 1000, // Per minute
  id: "reddit-api",
});

export class RedditSource extends BaseSource {
  private subreddits: string[];
  private timeframe: "hour" | "day" | "week" | "month" | "year" | "all";
  private minUpvotes: number;
  private minComments: number;

  constructor(config: RedditSourceConfig) {
    // Use Reddit-specific rate limiter
    super(config, redditRateLimiter);

    this.subreddits = config.subreddits || ["Entrepreneur", "startups", "SaaS", "smallbusiness"];
    this.timeframe = config.timeframe || "week";
    this.minUpvotes = config.minUpvotes || 10;
    this.minComments = config.minComments || 3;
  }

  /**
   * Fetch articles from Reddit
   */
  protected async fetchArticlesImpl(): Promise<Article[]> {
    logger.debug(
      {
        source: this.config.name,
        subreddits: this.subreddits,
        timeframe: this.timeframe,
      },
      "Fetching from Reddit",
    );

    // Fetch from all subreddits
    const allArticles: Article[] = [];
    const errors: Array<{ subreddit: string; error: Error }> = [];

    for (const subreddit of this.subreddits) {
      try {
        const posts = await this.fetchSubreddit(subreddit);
        allArticles.push(...posts);
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        errors.push({ subreddit, error: errorObj });

        logger.error(
          {
            source: this.config.name,
            subreddit,
            error: errorObj.message,
          },
          `Failed to fetch from r/${subreddit}, continuing with other subreddits`,
        );
        // Continue with other subreddits even if one fails
      }
    }

    // If ALL subreddits failed, throw the first error
    if (errors.length === this.subreddits.length && errors.length > 0) {
      logger.error(
        {
          source: this.config.name,
          failedCount: errors.length,
          totalCount: this.subreddits.length,
        },
        "All subreddits failed to fetch",
      );
      throw errors[0].error;
    }

    logger.info(
      {
        source: this.config.name,
        subreddits: this.subreddits,
        totalPosts: allArticles.length,
      },
      "Successfully fetched Reddit posts",
    );

    return allArticles;
  }

  /**
   * Fetch posts from a single subreddit
   */
  private async fetchSubreddit(subreddit: string): Promise<Article[]> {
    const limit = this.config.maxArticles || 25;
    const url = `https://www.reddit.com/r/${subreddit}/top.json?t=${this.timeframe}&limit=${limit}`;

    logger.debug({ subreddit, url }, `Fetching r/${subreddit}`);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)",
          Accept: "application/json",
          ...this.config.headers,
        },
        signal: AbortSignal.timeout(this.config.timeout || 10000),
      });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;

        throw new SourceError(
          `Rate limited by Reddit. Retry after ${waitTime}ms`,
          SourceErrorCode.RATE_LIMIT,
          this.config.name,
        );
      }

      // Handle other HTTP errors
      if (!response.ok) {
        throw new SourceError(
          `Reddit API error: ${response.status} ${response.statusText}`,
          response.status === 404 ? SourceErrorCode.INVALID_URL : SourceErrorCode.NETWORK_ERROR,
          this.config.name,
        );
      }

      const data = (await response.json()) as RedditResponse;

      if (!data.data?.children || data.data.children.length === 0) {
        logger.warn({ subreddit }, `No posts found in r/${subreddit}`);
        return [];
      }

      // Convert Reddit posts to Articles
      const articles = data.data.children
        .map((post) => this.convertToArticle(post, subreddit))
        .filter((article): article is Article => article !== null);

      logger.info(
        { subreddit, postCount: articles.length },
        `Fetched ${articles.length} posts from r/${subreddit}`,
      );

      return articles;
    } catch (error) {
      if (error instanceof SourceError) {
        throw error;
      }

      // Handle timeout (both DOMException and Error with TimeoutError name) - check BEFORE network errors
      if (
        (error instanceof Error && error.name === "TimeoutError") ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw new SourceError(
          `Timeout fetching r/${subreddit}`,
          SourceErrorCode.TIMEOUT,
          this.config.name,
          error,
        );
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new SourceError(
          `Network error fetching r/${subreddit}: ${error.message}`,
          SourceErrorCode.NETWORK_ERROR,
          this.config.name,
          error,
        );
      }

      throw new SourceError(
        `Failed to fetch r/${subreddit}: ${error instanceof Error ? error.message : String(error)}`,
        SourceErrorCode.UNKNOWN_ERROR,
        this.config.name,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Convert Reddit post to Article format
   */
  private convertToArticle(post: RedditPost, subreddit: string): Article | null {
    try {
      const postData = post.data;

      // Filter out stickied posts (usually mod announcements)
      if (postData.stickied) {
        logger.debug({ postId: postData.id, title: postData.title }, "Skipping stickied post");
        return null;
      }

      // Filter out distinguished posts (mod/admin posts)
      if (postData.distinguished) {
        logger.debug(
          { postId: postData.id, title: postData.title, distinguished: postData.distinguished },
          "Skipping distinguished post",
        );
        return null;
      }

      // Filter by minimum upvotes
      if (postData.ups < this.minUpvotes) {
        logger.debug(
          { postId: postData.id, upvotes: postData.ups, minUpvotes: this.minUpvotes },
          "Post below minimum upvotes threshold",
        );
        return null;
      }

      // Filter by minimum comments
      if (postData.num_comments < this.minComments) {
        logger.debug(
          { postId: postData.id, comments: postData.num_comments, minComments: this.minComments },
          "Post below minimum comments threshold",
        );
        return null;
      }

      // Filter out spam/promotional content by domain
      const spamDomains = ["youtube.com", "youtu.be"];
      if (spamDomains.some((domain) => postData.domain.includes(domain))) {
        logger.debug(
          { postId: postData.id, domain: postData.domain },
          "Skipping promotional/spam domain",
        );
        return null;
      }

      // Filter out NSFW content
      if (postData.over_18) {
        logger.debug({ postId: postData.id }, "Skipping NSFW post");
        return null;
      }

      // Extract content - prefer self-text for text posts, otherwise use title
      const content =
        postData.is_self && postData.selftext
          ? this.sanitizeText(postData.selftext)
          : postData.title;

      // Determine the URL - for self posts, use Reddit permalink, otherwise use the linked URL
      const articleUrl = postData.is_self
        ? `https://www.reddit.com${postData.permalink}`
        : postData.url;

      // Validate we have required fields
      if (!postData.title || !articleUrl) {
        logger.warn(
          { postId: postData.id, title: postData.title, url: articleUrl },
          "Reddit post missing required fields",
        );
        return null;
      }

      // Extract image URL
      const imageUrl = this.extractImageUrl(postData);

      const article: Article = {
        id: `reddit:${postData.id}`,
        title: this.sanitizeText(postData.title),
        url: articleUrl,
        content,
        author: postData.author,
        publishedAt: new Date(postData.created_utc * 1000), // Convert Unix timestamp to Date
        source: `reddit:${subreddit}`,

        // Engagement metrics
        engagement: {
          upvotes: postData.ups,
          comments: postData.num_comments,
          shares: postData.total_awards_received, // Using awards as a proxy for shares
        },

        // Metadata
        metadata: {
          subreddit: postData.subreddit,
          permalink: postData.permalink,
          domain: postData.domain,
          isTextPost: postData.is_self,
          flair: postData.link_flair_text,
          score: postData.score,
          imageUrl,
        },

        // Database fields
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return article;
    } catch (error) {
      logger.error(
        {
          source: this.config.name,
          postId: post.data?.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to convert Reddit post to article",
      );
      return null;
    }
  }

  /**
   * Extract image URL from Reddit post
   */
  private extractImageUrl(postData: RedditPost["data"]): string | undefined {
    // Try preview images first
    if (postData.preview?.images?.[0]?.source?.url) {
      // Decode HTML entities in URL
      return postData.preview.images[0].source.url.replace(/&amp;/g, "&");
    }

    // Try thumbnail (if it's a valid URL and not a placeholder)
    if (
      postData.thumbnail &&
      postData.thumbnail.startsWith("http") &&
      !postData.thumbnail.includes("self") &&
      !postData.thumbnail.includes("default")
    ) {
      return postData.thumbnail;
    }

    return undefined;
  }

  /**
   * Sanitize text content (remove Reddit markdown, trim whitespace)
   */
  private sanitizeText(text: string): string {
    return text
      .replace(/&gt;/g, ">") // Decode HTML entities
      .replace(/&lt;/g, "<")
      .replace(/&amp;/g, "&")
      .replace(/\n{3,}/g, "\n\n") // Normalize multiple newlines
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();
  }
}

/**
 * Fetch from multiple subreddits in parallel
 */
export async function fetchMultipleRedditSources(
  configs: RedditSourceConfig[],
): Promise<Map<string, Article[]>> {
  logger.info({ sourceCount: configs.length }, "Fetching multiple Reddit sources in parallel");

  const results = new Map<string, Article[]>();
  const startTime = Date.now();

  // Fetch all sources in parallel
  const fetchPromises = configs
    .filter((config) => config.enabled)
    .map(async (config) => {
      const source = new RedditSource(config);
      const result = await source.fetchArticles();

      if (result.success) {
        results.set(config.name, result.articles);
        logger.info(
          { source: config.name, articleCount: result.articles.length },
          "Successfully fetched Reddit source",
        );
      } else {
        logger.error({ source: config.name, error: result.error }, "Failed to fetch Reddit source");
        results.set(config.name, []); // Store empty array on failure
      }

      return result;
    });

  // Wait for all sources to complete
  await Promise.allSettled(fetchPromises);

  const duration = Date.now() - startTime;
  const totalArticles = Array.from(results.values()).reduce(
    (sum, articles) => sum + articles.length,
    0,
  );

  logger.info(
    {
      sourceCount: configs.length,
      successCount: results.size,
      totalArticles,
      duration,
    },
    "Completed fetching multiple Reddit sources",
  );

  return results;
}

/**
 * Pre-configured Reddit sources for business/entrepreneurship
 */
export const DEFAULT_REDDIT_SOURCES: RedditSourceConfig[] = [
  {
    name: "Reddit Entrepreneur",
    url: "https://www.reddit.com/r/Entrepreneur",
    type: "reddit",
    enabled: true,
    subreddits: ["Entrepreneur"],
    timeframe: "week",
    maxArticles: 25,
    minUpvotes: 50,
    minComments: 10,
    timeout: 15000,
    retryAttempts: 3,
  },
  {
    name: "Reddit Startups",
    url: "https://www.reddit.com/r/startups",
    type: "reddit",
    enabled: true,
    subreddits: ["startups"],
    timeframe: "week",
    maxArticles: 25,
    minUpvotes: 30,
    minComments: 5,
    timeout: 15000,
    retryAttempts: 3,
  },
  {
    name: "Reddit SaaS",
    url: "https://www.reddit.com/r/SaaS",
    type: "reddit",
    enabled: true,
    subreddits: ["SaaS"],
    timeframe: "week",
    maxArticles: 25,
    minUpvotes: 20,
    minComments: 5,
    timeout: 15000,
    retryAttempts: 3,
  },
  {
    name: "Reddit Small Business",
    url: "https://www.reddit.com/r/smallbusiness",
    type: "reddit",
    enabled: true,
    subreddits: ["smallbusiness"],
    timeframe: "week",
    maxArticles: 25,
    minUpvotes: 30,
    minComments: 8,
    timeout: 15000,
    retryAttempts: 3,
  },
  {
    name: "Reddit Business Multi-Source",
    url: "https://www.reddit.com/r/Entrepreneur",
    type: "reddit",
    enabled: true,
    subreddits: ["Entrepreneur", "startups", "SaaS", "smallbusiness"],
    timeframe: "week",
    maxArticles: 50,
    minUpvotes: 40,
    minComments: 10,
    timeout: 20000,
    retryAttempts: 3,
  },
];
