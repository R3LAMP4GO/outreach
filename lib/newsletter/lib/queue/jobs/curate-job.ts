/**
 * Curate Job Processor
 *
 * Processes content curation jobs:
 * 1. Fetch articles from configured sources
 * 2. Deduplicate articles
 * 3. Score articles for quality
 * 4. Filter and select top articles
 */

import { logger } from "../../logger";
import { CurateJobData, CurateJobResult } from "../types";
import { MultiSourceFetcher } from "../../../modules/orchestrator/multi-source-fetcher";
import { RSSSource } from "../../../modules/sources/rss";
import { RedditSource } from "../../../modules/sources/reddit";
import { HackerNewsSource } from "../../../modules/sources/hackernews";
import { BaseSource } from "../../../modules/sources/base-source";
import { ArticleScorer } from "../../../modules/processing/scorer";
import { ArticleFilter } from "../../../modules/processing/filter";
import type { Article } from "../../../types/article";

/**
 * Source factory
 * Creates source instances based on configuration
 */
function createSource(sourceName: string): BaseSource | null {
  switch (sourceName.toLowerCase()) {
    case "rss":
      // RSS source requires feed URL configuration
      // This should be loaded from database or environment
      return new RSSSource({
        name: "HBR",
        url: "https://hbr.org/feed",
        type: "rss",
        enabled: true,
        maxArticles: 50,
        timeout: 10000,
        retryAttempts: 3,
      });

    case "reddit":
      return new RedditSource({
        name: "Entrepreneur Reddit",
        url: "https://www.reddit.com/r/entrepreneur",
        type: "reddit",
        enabled: true,
        maxArticles: 50,
        timeout: 10000,
        retryAttempts: 3,
      });

    case "hackernews":
    case "hn":
      return new HackerNewsSource({
        name: "Hacker News",
        url: "https://news.ycombinator.com",
        type: "hackernews",
        enabled: true,
        maxArticles: 50,
        timeout: 10000,
        retryAttempts: 3,
      });

    default:
      logger.warn({ sourceName }, "Unknown source type");
      return null;
  }
}

/**
 * Curate Job Processor
 *
 * Main processing function for curation jobs
 */
export async function processCurateJob(data: CurateJobData): Promise<CurateJobResult> {
  const startTime = Date.now();
  const { campaignId, sources, maxArticles = 15, userId } = data;

  logger.info(
    {
      campaignId,
      sources,
      maxArticles,
      userId,
    },
    "Starting content curation job",
  );

  try {
    // Step 1: Fetch articles from sources
    const sourceInstances: BaseSource[] = sources
      .map(createSource)
      .filter((s): s is BaseSource => s !== null);

    if (sourceInstances.length === 0) {
      throw new Error("No valid sources configured");
    }

    const fetcher = new MultiSourceFetcher();
    const fetchResult = await fetcher.fetchAll(sourceInstances, {
      timeout: 60000, // 60 second timeout per source
      continueOnError: true,
    });

    if (fetchResult.articles.length === 0) {
      logger.warn({ campaignId }, "No articles fetched from any source");
      return {
        success: false,
        articles: [],
        totalFetched: 0,
        totalFiltered: 0,
        duration: Date.now() - startTime,
        error: "No articles fetched from any source",
      };
    }

    // Step 2: Score articles
    const scorer = new ArticleScorer({
      weights: {
        recency: 0.15,
        engagement: 0.25,
        readability: 0.15,
        relevance: 0.25,
        authority: 0.1,
        uniqueness: 0.1,
      },
    });

    // scoreArticle is synchronous and returns an Article with scores embedded
    const scoredArticles = fetchResult.articles.map((article) =>
      scorer.scoreArticle(article as Article),
    );

    // Step 3: Filter articles
    const filter = new ArticleFilter({
      minScore: 0.6,
      minWords: 200,
      maxWords: 5000,
      filterPromotional: true,
      promotionalKeywords: ["sponsored", "advertisement", "promoted"],
      filterClickbait: true,
    });

    const filterResult = await filter.filterArticles(scoredArticles);
    const filteredArticles = filterResult.passed;

    // Step 4: Select top N articles
    // Sort by score descending and take top N
    const topArticles = filteredArticles
      .sort((a, b) => (b.scores?.final ?? 0) - (a.scores?.final ?? 0))
      .slice(0, maxArticles);

    // Step 5: Prepare result
    const result: CurateJobResult = {
      success: true,
      articles: topArticles.map((article) => ({
        id: article.id || article.url,
        title: article.title,
        url: article.url,
        summary: article.enrichment?.summary || article.content.substring(0, 200),
        score: article.scores?.final || 0,
        source: article.source,
      })),
      totalFetched: fetchResult.articles.length,
      totalFiltered: filteredArticles.length,
      duration: Date.now() - startTime,
    };

    logger.info(
      {
        campaignId,
        articlesSelected: result.articles.length,
        totalFetched: result.totalFetched,
        duration: result.duration,
      },
      "Content curation job completed successfully",
    );

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        campaignId,
        error: errorMessage,
        duration: Date.now() - startTime,
      },
      "Content curation job failed",
    );

    return {
      success: false,
      articles: [],
      totalFetched: 0,
      totalFiltered: 0,
      duration: Date.now() - startTime,
      error: errorMessage,
    };
  }
}
