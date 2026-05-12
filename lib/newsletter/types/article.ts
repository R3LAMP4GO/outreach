/**
 * Article Types
 *
 * Represents content fetched from various sources (RSS, Reddit, Hacker News, etc.)
 * Includes AI enrichment, scoring, and engagement metrics.
 */

import { z } from "zod";

/**
 * Article engagement metrics from the source platform
 */
export const ArticleEngagementSchema = z
  .object({
    upvotes: z.number().optional(),
    comments: z.number().optional(),
    shares: z.number().optional(),
    views: z.number().optional(),
  })
  .optional();

export type ArticleEngagement = z.infer<typeof ArticleEngagementSchema>;

/**
 * Article quality and relevance scores
 */
export const ArticleScoresSchema = z.object({
  recency: z.number().min(0).max(1), // How recent the content is (0-1)
  engagement: z.number().min(0).max(1), // Based on upvotes/comments/shares (0-1)
  readability: z.number().min(0).max(1), // Flesch reading ease score (0-1)
  relevance: z.number().min(0).max(1), // Keyword/topic matching (0-1)
  authority: z.number().min(0).max(1), // Source reputation (0-1)
  uniqueness: z.number().min(0).max(1), // Novelty score (0-1)
  final: z.number().min(0).max(1), // Weighted final score (0-1)
});

export type ArticleScores = z.infer<typeof ArticleScoresSchema>;

/**
 * AI-generated enrichment data
 */
export const ArticleEnrichmentSchema = z
  .object({
    summary: z.string(),
    keyInsights: z.array(z.string()),
    psychologyPrinciple: z.string().optional(),
    actionableFramework: z.string().optional(),
    embedding: z.array(z.number()).optional(),
  })
  .optional();

export type ArticleEnrichment = z.infer<typeof ArticleEnrichmentSchema>;

/**
 * Core article data structure
 */
export const ArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
  content: z.string(),
  author: z.string().optional(),
  publishedAt: z.date(),
  source: z.string(), // Format: "source:identifier" (e.g., "reddit:entrepreneur", "rss:hbr")

  // Optional metadata
  engagement: ArticleEngagementSchema,
  metadata: z.record(z.string(), z.any()).optional(),

  // AI enrichment
  enrichment: ArticleEnrichmentSchema,

  // Scoring
  scores: ArticleScoresSchema.optional(),

  // Database fields
  status: z.enum(["pending", "processed", "published", "archived"]).default("pending"),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export type Article = z.infer<typeof ArticleSchema>;

/**
 * Options for fetching articles from a source
 */
export const FetchOptionsSchema = z.object({
  limit: z.number().positive().default(50),
  timeframe: z.enum(["hour", "day", "week", "month"]).default("day"),
  minScore: z.number().min(0).max(1).optional(),
  topics: z.array(z.string()).optional(),
});

export type FetchOptions = z.infer<typeof FetchOptionsSchema>;

/**
 * Article filter criteria
 */
export const ArticleFilterSchema = z.object({
  sources: z.array(z.string()).optional(),
  minScore: z.number().min(0).max(1).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  keywords: z.array(z.string()).optional(),
  status: z.enum(["pending", "processed", "published", "archived"]).optional(),
});

export type ArticleFilter = z.infer<typeof ArticleFilterSchema>;

/**
 * Source configuration for content fetching
 */
export const SourceConfigSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  type: z.enum(["rss", "reddit", "hackernews", "linkedin", "api", "scraper"]),
  enabled: z.boolean().default(true),

  // Optional configuration
  maxArticles: z.number().int().positive().optional(),
  timeout: z.number().int().positive().default(10000),
  retryAttempts: z.number().int().min(0).default(3),

  // Custom headers or auth
  headers: z.record(z.string(), z.string()).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export type SourceConfig = z.infer<typeof SourceConfigSchema>;

/**
 * Fetch result with metadata
 */
export interface FetchResult {
  success: boolean;
  source: string;
  articles: Article[];
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  metadata: {
    fetchedAt: Date;
    duration: number;
    articleCount: number;
    filteredCount?: number;
  };
}

/**
 * Error types for content source operations
 */
export enum SourceErrorCode {
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT = "TIMEOUT",
  INVALID_URL = "INVALID_URL",
  PARSE_ERROR = "PARSE_ERROR",
  RATE_LIMIT = "RATE_LIMIT",
  AUTH_ERROR = "AUTH_ERROR",
  INVALID_FEED = "INVALID_FEED",
  MISSING_REQUIRED_FIELDS = "MISSING_REQUIRED_FIELDS",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export class SourceError extends Error {
  constructor(
    message: string,
    public code: SourceErrorCode,
    public source?: string,
    public originalError?: Error,
  ) {
    super(message);
    this.name = "SourceError";
    Object.setPrototypeOf(this, SourceError.prototype);
  }
}
