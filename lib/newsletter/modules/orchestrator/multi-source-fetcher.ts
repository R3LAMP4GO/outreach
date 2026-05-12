/**
 * Multi-Source Fetcher Orchestrator
 *
 * Coordinates parallel content fetching from multiple sources with:
 * - Parallel execution for performance
 * - Error resilience (partial failures don't fail entire operation)
 * - Performance tracking and metrics
 * - Timeout management per source and globally
 *
 * Inspired by: https://github.com/KenKaiii/b0t
 */

import { BaseSource } from "../sources/base-source";
import { Article, FetchResult } from "../../types/article";
import {
  MultiSourceConfig,
  OrchestratorResult,
  SourceResult,
  SourcePerformanceMetrics,
} from "../../types/orchestrator";
import { logger } from "../../lib/logger";

/**
 * Multi-Source Fetcher
 *
 * Orchestrates parallel content fetching from multiple sources
 */
export class MultiSourceFetcher {
  private performanceMetrics: Map<string, SourcePerformanceMetrics>;

  constructor() {
    this.performanceMetrics = new Map();
  }

  /**
   * Fetch articles from all configured sources in parallel
   *
   * @param sources - Array of BaseSource instances to fetch from
   * @param config - Configuration options for the fetch operation
   * @returns Combined articles and detailed results from all sources
   */
  public async fetchAll(
    sources: BaseSource[],
    config?: Partial<MultiSourceConfig>,
  ): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const timeout = config?.timeout ?? 30000;
    const continueOnError = config?.continueOnError ?? true;

    // Filter to only enabled sources
    const enabledSources = sources.filter((source) => source.isEnabled());

    logger.info(
      {
        totalSources: sources.length,
        enabledSources: enabledSources.length,
        timeout,
      },
      "Starting multi-source fetch operation",
    );

    if (enabledSources.length === 0) {
      logger.warn("No enabled sources to fetch from");
      return this.createEmptyResult();
    }

    // Create promises for each source with individual error handling
    const fetchPromises = enabledSources.map((source) =>
      this.fetchFromSource(source, timeout, continueOnError),
    );

    // Execute all fetches in parallel
    const fetchResults = await Promise.all(fetchPromises);

    // Combine and analyze results
    const result = this.aggregateResults(fetchResults, Date.now() - startTime);

    // Update performance metrics
    this.updatePerformanceMetrics(fetchResults);

    // Log summary
    this.logSummary(result);

    return result;
  }

  /**
   * Fetch from a single source with timeout and error handling
   */
  private async fetchFromSource(
    source: BaseSource,
    timeout: number,
    continueOnError: boolean,
  ): Promise<FetchResult> {
    const sourceName = source.getName();
    const startTime = Date.now();

    try {
      // Fetch with timeout, ensuring timer is always cleared
      const result = await new Promise<FetchResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Source ${sourceName} timed out after ${timeout}ms`));
        }, timeout);

        source.fetchArticles().then(
          (res) => {
            clearTimeout(timer);
            resolve(res);
          },
          (err) => {
            clearTimeout(timer);
            reject(err);
          },
        );
      });

      // Log success
      logger.info(
        {
          source: sourceName,
          success: result.success,
          articles: result.articles.length,
          duration: result.metadata.duration,
        },
        `Source fetch completed: ${sourceName}`,
      );

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(
        {
          source: sourceName,
          error: errorMessage,
          duration,
        },
        `Source fetch failed: ${sourceName}`,
      );

      // If we should continue on error, return a failed result
      // Otherwise, re-throw the error
      if (continueOnError) {
        return {
          success: false,
          source: sourceName,
          articles: [],
          error: {
            message: errorMessage,
            code: "FETCH_ERROR",
          },
          metadata: {
            fetchedAt: new Date(),
            duration,
            articleCount: 0,
          },
        };
      } else {
        throw error;
      }
    }
  }

  /**
   * Aggregate results from all sources
   */
  private aggregateResults(fetchResults: FetchResult[], totalDuration: number): OrchestratorResult {
    // Combine all articles
    const allArticles: Article[] = [];
    const sourceResults: SourceResult[] = [];

    let successfulSources = 0;
    let failedSources = 0;
    let fastestSource: { name: string; duration: number } | undefined;
    let slowestSource: { name: string; duration: number } | undefined;

    for (const result of fetchResults) {
      // Add articles
      allArticles.push(...result.articles);

      // Track success/failure
      if (result.success) {
        successfulSources++;
      } else {
        failedSources++;
      }

      // Track fastest/slowest
      if (!fastestSource || result.metadata.duration < fastestSource.duration) {
        fastestSource = {
          name: result.source,
          duration: result.metadata.duration,
        };
      }
      if (!slowestSource || result.metadata.duration > slowestSource.duration) {
        slowestSource = {
          name: result.source,
          duration: result.metadata.duration,
        };
      }

      // Create source result
      sourceResults.push({
        source: result.source,
        success: result.success,
        articleCount: result.articles.length,
        duration: result.metadata.duration,
        error: result.error,
        fetchedAt: result.metadata.fetchedAt,
      });
    }

    // Remove duplicate articles by URL
    const uniqueArticles = this.deduplicateArticles(allArticles);

    // Calculate average duration
    const averageDuration =
      fetchResults.length > 0
        ? fetchResults.reduce((sum, r) => sum + r.metadata.duration, 0) / fetchResults.length
        : 0;

    return {
      articles: uniqueArticles,
      results: sourceResults,
      summary: {
        totalSources: fetchResults.length,
        successfulSources,
        failedSources,
        totalArticles: uniqueArticles.length,
        totalDuration,
        averageDuration: Math.round(averageDuration),
        fastestSource,
        slowestSource,
      },
    };
  }

  /**
   * Remove duplicate articles based on URL
   */
  private deduplicateArticles(articles: Article[]): Article[] {
    const seen = new Set<string>();
    const unique: Article[] = [];

    for (const article of articles) {
      if (!seen.has(article.url)) {
        seen.add(article.url);
        unique.push(article);
      }
    }

    const duplicates = articles.length - unique.length;
    if (duplicates > 0) {
      logger.info(
        { total: articles.length, unique: unique.length, duplicates },
        `Removed ${duplicates} duplicate articles`,
      );
    }

    return unique;
  }

  /**
   * Update performance metrics for each source
   */
  private updatePerformanceMetrics(fetchResults: FetchResult[]): void {
    for (const result of fetchResults) {
      const existing = this.performanceMetrics.get(result.source);

      if (existing) {
        // Update existing metrics
        const totalFetches = existing.fetchCount + 1;
        const successCount = existing.successRate * existing.fetchCount + (result.success ? 1 : 0);

        this.performanceMetrics.set(result.source, {
          sourceName: result.source,
          fetchCount: totalFetches,
          successRate: successCount / totalFetches,
          averageDuration:
            (existing.averageDuration * existing.fetchCount + result.metadata.duration) /
            totalFetches,
          averageArticleCount:
            (existing.averageArticleCount * existing.fetchCount + result.articles.length) /
            totalFetches,
          lastFetchAt: result.metadata.fetchedAt,
          lastError: result.error?.message,
        });
      } else {
        // Create new metrics
        this.performanceMetrics.set(result.source, {
          sourceName: result.source,
          fetchCount: 1,
          successRate: result.success ? 1 : 0,
          averageDuration: result.metadata.duration,
          averageArticleCount: result.articles.length,
          lastFetchAt: result.metadata.fetchedAt,
          lastError: result.error?.message,
        });
      }
    }
  }

  /**
   * Log summary of fetch operation
   */
  private logSummary(result: OrchestratorResult): void {
    const { summary } = result;

    logger.info(
      {
        totalSources: summary.totalSources,
        successful: summary.successfulSources,
        failed: summary.failedSources,
        articles: summary.totalArticles,
        duration: summary.totalDuration,
        avgDuration: summary.averageDuration,
        fastest: summary.fastestSource,
        slowest: summary.slowestSource,
      },
      "Multi-source fetch completed",
    );

    // Log warnings for failed sources
    if (summary.failedSources > 0) {
      const failedSources = result.results.filter((r) => !r.success).map((r) => r.source);

      logger.warn(
        { failedSources, count: summary.failedSources },
        `${summary.failedSources} source(s) failed`,
      );
    }

    // Log performance insights
    if (summary.fastestSource && summary.slowestSource) {
      const speedDiff = summary.slowestSource.duration - summary.fastestSource.duration;
      if (speedDiff > 5000) {
        logger.warn(
          {
            fastest: summary.fastestSource,
            slowest: summary.slowestSource,
            difference: speedDiff,
          },
          "Significant performance difference detected between sources",
        );
      }
    }
  }

  /**
   * Get performance metrics for all sources
   */
  public getPerformanceMetrics(): SourcePerformanceMetrics[] {
    return Array.from(this.performanceMetrics.values());
  }

  /**
   * Get performance metrics for a specific source
   */
  public getSourceMetrics(sourceName: string): SourcePerformanceMetrics | undefined {
    return this.performanceMetrics.get(sourceName);
  }

  /**
   * Reset performance metrics
   */
  public resetMetrics(): void {
    this.performanceMetrics.clear();
    logger.info("Performance metrics reset");
  }

  /**
   * Create an empty result for when no sources are available
   */
  private createEmptyResult(): OrchestratorResult {
    return {
      articles: [],
      results: [],
      summary: {
        totalSources: 0,
        successfulSources: 0,
        failedSources: 0,
        totalArticles: 0,
        totalDuration: 0,
        averageDuration: 0,
      },
    };
  }

  /**
   * Fetch from specific sources by name
   */
  public async fetchFromSources(
    allSources: BaseSource[],
    sourceNames: string[],
    config?: Partial<MultiSourceConfig>,
  ): Promise<OrchestratorResult> {
    const selectedSources = allSources.filter((source) => sourceNames.includes(source.getName()));

    if (selectedSources.length === 0) {
      logger.warn({ requestedSources: sourceNames }, "No matching sources found");
      return this.createEmptyResult();
    }

    return this.fetchAll(selectedSources, config);
  }
}
