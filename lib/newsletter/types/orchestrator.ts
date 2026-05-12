/**
 * Multi-Source Orchestrator Types
 *
 * Types for coordinating parallel content fetching from multiple sources
 */

import { z } from "zod";
import { SourceConfigSchema } from "./article";

/**
 * Source-specific result from a fetch operation
 */
export const SourceResultSchema = z.object({
  source: z.string(),
  success: z.boolean(),
  articleCount: z.number().int().min(0),
  duration: z.number().int().min(0), // milliseconds
  error: z
    .object({
      message: z.string(),
      code: z.string().optional(),
    })
    .optional(),
  fetchedAt: z.date(),
});

export type SourceResult = z.infer<typeof SourceResultSchema>;

/**
 * Multi-source fetch configuration
 */
export const MultiSourceConfigSchema = z.object({
  sources: z.array(SourceConfigSchema),
  timeout: z.number().int().positive().default(30000), // Global timeout for all sources
  maxArticlesPerSource: z.number().int().positive().optional(),
  continueOnError: z.boolean().default(true), // Don't fail entire operation if one source fails
});

export type MultiSourceConfig = z.infer<typeof MultiSourceConfigSchema>;

/**
 * Orchestrator fetch result with aggregated data
 */
export interface OrchestratorResult {
  articles: unknown[]; // Will be Article[] but avoiding circular dependency
  results: SourceResult[];
  summary: {
    totalSources: number;
    successfulSources: number;
    failedSources: number;
    totalArticles: number;
    totalDuration: number;
    averageDuration: number;
    fastestSource?: {
      name: string;
      duration: number;
    };
    slowestSource?: {
      name: string;
      duration: number;
    };
  };
}

/**
 * Performance metrics for monitoring source health
 */
export interface SourcePerformanceMetrics {
  sourceName: string;
  fetchCount: number;
  successRate: number;
  averageDuration: number;
  averageArticleCount: number;
  lastFetchAt?: Date;
  lastError?: string;
}
