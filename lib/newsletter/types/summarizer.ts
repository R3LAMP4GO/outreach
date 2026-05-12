/**
 * TypeScript interfaces for AI summarization module
 * Optimized for business owner audiences with psychology-backed insights
 */

/**
 * Raw article data input for summarization
 */
export interface ArticleInput {
  /** Unique identifier for the article */
  id: string;
  /** Article title */
  title: string;
  /** Full article content/body text */
  content: string;
  /** Source URL */
  url: string;
  /** Publication date */
  publishedAt: Date;
  /** Article author (optional) */
  author?: string;
  /** Source publication/site name */
  source?: string;
}

/**
 * Enriched article data with AI-generated insights
 */
export interface EnrichedArticle {
  /** Original article data */
  article: ArticleInput;
  /** AI-generated summary (2-3 sentences, max 150 words) */
  summary: string;
  /** 3-5 key takeaways as bullet points */
  keyInsights: string[];
  /** Psychology principle identified (if applicable) */
  psychologyPrinciple?: {
    /** Name of the principle (e.g., "Loss Aversion", "Social Proof") */
    name: string;
    /** Brief explanation of how it applies to this content */
    explanation: string;
  };
  /** Actionable framework extracted from the content (if applicable) */
  actionableFramework?: {
    /** Framework title/name */
    title: string;
    /** Ordered steps or components */
    steps: string[];
  };
  /** Processing metadata */
  metadata: {
    /** When the article was processed */
    processedAt: Date;
    /** Claude model used */
    model: string;
    /** Token usage for the request */
    tokensUsed: number;
    /** Processing time in milliseconds */
    processingTimeMs: number;
    /** Whether result was served from cache */
    fromCache: boolean;
  };
}

/**
 * Configuration for the summarizer service
 */
export interface SummarizerConfig {
  /** Anthropic API key */
  apiKey: string;
  /** Claude model to use (default: claude-3-5-sonnet-20241022) */
  model?: string;
  /** Maximum tokens for response (default: 1024) */
  maxTokens?: number;
  /** Temperature for response generation (default: 0.3 for consistency) */
  temperature?: number;
  /** Enable response caching (default: true) */
  enableCache?: boolean;
  /** Cache TTL in seconds (default: 7 days) */
  cacheTtlSeconds?: number;
  /** Enable rate limiting (default: true) */
  enableRateLimiting?: boolean;
  /** Rate limit: requests per minute (default: 50) */
  requestsPerMinute?: number;
  /** Rate limit: tokens per minute (default: 50000) */
  tokensPerMinute?: number;
  /** Number of retry attempts on failure (default: 3) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  retryBaseDelayMs?: number;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
}

/**
 * Cache entry structure
 */
export interface CacheEntry {
  /** Cached enriched article */
  data: EnrichedArticle;
  /** When the entry was cached */
  cachedAt: Date;
  /** When the entry expires */
  expiresAt: Date;
  /** Cache hit count for analytics */
  hits: number;
}

/**
 * Rate limiter state
 */
export interface RateLimiterState {
  /** Request count in current window */
  requestCount: number;
  /** Token count in current window */
  tokenCount: number;
  /** Window start timestamp */
  windowStart: number;
}

/**
 * Error types for better error handling
 */
export enum SummarizerErrorType {
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  API_ERROR = "API_ERROR",
  TIMEOUT = "TIMEOUT",
  INVALID_INPUT = "INVALID_INPUT",
  PARSING_ERROR = "PARSING_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
  UNKNOWN = "UNKNOWN",
}

/**
 * Custom error class for summarizer errors
 */
export class SummarizerError extends Error {
  constructor(
    message: string,
    public type: SummarizerErrorType,
    public originalError?: Error,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = "SummarizerError";
  }
}

/**
 * Summarization result with success/failure state
 */
export type SummarizerResult =
  | { success: true; data: EnrichedArticle }
  | { success: false; error: SummarizerError };

/**
 * Batch summarization options
 */
export interface BatchSummarizationOptions {
  /** Maximum number of concurrent requests (default: 5) */
  concurrency?: number;
  /** Stop processing on first error (default: false) */
  stopOnError?: boolean;
  /** Callback for progress updates */
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Batch summarization result
 */
export interface BatchSummarizationResult {
  /** Successfully processed articles */
  successful: EnrichedArticle[];
  /** Failed articles with errors */
  failed: Array<{
    article: ArticleInput;
    error: SummarizerError;
  }>;
  /** Processing statistics */
  stats: {
    /** Total articles processed */
    total: number;
    /** Successful count */
    successful: number;
    /** Failed count */
    failed: number;
    /** Cache hit count */
    cacheHits: number;
    /** Total tokens used */
    totalTokens: number;
    /** Total processing time in ms */
    totalTimeMs: number;
  };
}
