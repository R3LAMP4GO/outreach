/**
 * Multi-Factor Content Scoring System
 *
 * Implements a sophisticated scoring algorithm to rank articles by quality and relevance.
 * Uses weighted factors: recency, engagement, readability, relevance, authority, uniqueness.
 *
 * Performance target: 100+ articles scored in < 2 seconds
 */

import { Article, ArticleScores } from "../../types/article";

/**
 * Weight configuration for scoring factors
 * All weights should sum to 1.0
 */
export interface ScoringWeights {
  recency: number; // 0.15 default - Newer articles score higher
  engagement: number; // 0.25 default - Upvotes, comments, shares, views
  readability: number; // 0.15 default - Flesch reading ease, sentence length
  relevance: number; // 0.25 default - Topic match, keyword presence
  authority: number; // 0.10 default - Source reputation, author credibility
  uniqueness: number; // 0.10 default - Novel insights, not covered elsewhere
}

/**
 * Configuration for the ArticleScorer
 */
export interface ScorerConfig {
  weights?: Partial<ScoringWeights>;

  // Recency configuration
  recencyHalfLife?: number; // Days until article loses 50% score (default: 7)

  // Engagement baselines (for normalization)
  engagementBaselines?: {
    reddit?: number; // Average upvotes for Reddit (default: 100)
    hackernews?: number; // Average points for HN (default: 50)
    default?: number; // Default for other sources (default: 10)
  };

  // Readability targets
  readabilityTarget?: {
    minFlesch: number; // Minimum Flesch score (default: 30)
    maxFlesch: number; // Maximum Flesch score (default: 70)
  };

  // Relevance keywords (business owner topics)
  relevanceKeywords?: string[];

  // Authority mapping
  authorityMap?: Record<string, number>;

  // Recent articles for uniqueness comparison
  recentArticles?: Article[];
}

/**
 * Default weights following the specification
 */
const DEFAULT_WEIGHTS: ScoringWeights = {
  recency: 0.15,
  engagement: 0.25,
  readability: 0.15,
  relevance: 0.25,
  authority: 0.1,
  uniqueness: 0.1,
};

/**
 * Default engagement baselines by source type
 */
const DEFAULT_ENGAGEMENT_BASELINES = {
  reddit: 100,
  hackernews: 50,
  default: 10,
};

/**
 * Default authority scores by source
 */
const DEFAULT_AUTHORITY_MAP: Record<string, number> = {
  hbr: 1.0, // Harvard Business Review
  mitsloan: 1.0, // MIT Sloan Management Review
  mckinsey: 0.95, // McKinsey Quarterly
  forbes: 0.85, // Forbes
  inc: 0.85, // Inc Magazine
  fastcompany: 0.85, // Fast Company
  techcrunch: 0.8, // TechCrunch
  wired: 0.8, // Wired
  arstechnica: 0.8, // Ars Technica
  hackernews: 0.75, // Hacker News
  reddit: 0.65, // Reddit (varies by subreddit)
  entrepreneur: 0.65, // Reddit entrepreneur (specific boost)
  medium: 0.6, // Medium
  substack: 0.6, // Substack
  blog: 0.5, // Generic blogs
  unknown: 0.3, // Unknown sources
};

/**
 * Default business-focused keywords for relevance scoring
 */
const DEFAULT_RELEVANCE_KEYWORDS = [
  // Business fundamentals
  "entrepreneurship",
  "startup",
  "business",
  "strategy",
  "growth",
  "revenue",
  "profit",
  "funding",
  "investment",
  "venture capital",

  // Marketing & Sales
  "marketing",
  "sales",
  "customer",
  "acquisition",
  "retention",
  "conversion",
  "funnel",
  "seo",
  "content marketing",
  "email marketing",

  // Operations & Management
  "operations",
  "management",
  "leadership",
  "hiring",
  "culture",
  "productivity",
  "efficiency",
  "automation",
  "workflow",
  "process",

  // Product & Tech
  "product",
  "development",
  "innovation",
  "technology",
  "saas",
  "platform",
  "api",
  "software",
  "mobile",
  "web",

  // Finance & Metrics
  "metrics",
  "kpi",
  "analytics",
  "data",
  "finance",
  "accounting",
  "cash flow",
  "runway",
  "valuation",
  "exit",

  // Psychology & Behavioral
  "psychology",
  "behavior",
  "cognitive",
  "persuasion",
  "influence",
  "decision making",
  "bias",
  "motivation",
  "habit",
  "mental model",
];

/**
 * Performance metrics for scorer
 */
export interface ScorerMetrics {
  totalArticles: number;
  duration: number; // milliseconds
  articlesPerSecond: number;
  averageScore: number;
  scoreDistribution: {
    excellent: number; // 0.8-1.0
    good: number; // 0.6-0.8
    average: number; // 0.4-0.6
    below: number; // 0.0-0.4
  };
}

/**
 * Multi-factor article scoring system
 */
export class ArticleScorer {
  private weights: ScoringWeights;
  private recencyHalfLife: number;
  private engagementBaselines: typeof DEFAULT_ENGAGEMENT_BASELINES;
  private readabilityTarget: { minFlesch: number; maxFlesch: number };
  private relevanceKeywords: string[];
  private authorityMap: Record<string, number>;
  private recentArticles: Article[];

  constructor(config: ScorerConfig = {}) {
    // Merge weights with defaults
    this.weights = {
      ...DEFAULT_WEIGHTS,
      ...config.weights,
    };

    // Validate weights sum to approximately 1.0
    const weightSum = Object.values(this.weights).reduce((a, b) => a + b, 0);
    if (Math.abs(weightSum - 1.0) > 0.01) {
      console.warn(`Scoring weights sum to ${weightSum}, expected 1.0`);
    }

    this.recencyHalfLife = config.recencyHalfLife ?? 7;
    this.engagementBaselines = {
      ...DEFAULT_ENGAGEMENT_BASELINES,
      ...config.engagementBaselines,
    };
    this.readabilityTarget = config.readabilityTarget ?? {
      minFlesch: 30,
      maxFlesch: 70,
    };
    this.relevanceKeywords = config.relevanceKeywords ?? DEFAULT_RELEVANCE_KEYWORDS;
    this.authorityMap = config.authorityMap ?? DEFAULT_AUTHORITY_MAP;
    this.recentArticles = config.recentArticles ?? [];
  }

  /**
   * Score a single article
   */
  public scoreArticle(article: Article): Article {
    const scores: ArticleScores = {
      recency: this.scoreRecency(article),
      engagement: this.scoreEngagement(article),
      readability: this.scoreReadability(article),
      relevance: this.scoreRelevance(article),
      authority: this.scoreAuthority(article),
      uniqueness: this.scoreUniqueness(article),
      final: 0, // Calculated below
    };

    // Calculate weighted final score
    scores.final = this.calculateFinalScore(scores);

    return {
      ...article,
      scores,
    };
  }

  /**
   * Score multiple articles and sort by final score
   */
  public async scoreArticles(articles: Article[]): Promise<Article[]> {
    const startTime = Date.now();

    // Score all articles
    const scored = articles.map((article) => this.scoreArticle(article));

    // Sort by final score (descending)
    scored.sort((a, b) => (b.scores?.final ?? 0) - (a.scores?.final ?? 0));

    const duration = Date.now() - startTime;

    // Log performance metrics
    const metrics = this.calculateMetrics(scored, duration);
    console.log("Scoring metrics:", metrics);

    return scored;
  }

  /**
   * Get top N articles by score
   */
  public async getTopArticles(articles: Article[], count: number = 15): Promise<Article[]> {
    const scored = await this.scoreArticles(articles);
    return scored.slice(0, count);
  }

  /**
   * Score recency: Exponential decay based on publish date
   * Articles lose 50% score every N days (configurable half-life)
   */
  private scoreRecency(article: Article): number {
    const now = new Date();
    const publishedAt = new Date(article.publishedAt);

    // Handle future dates (treat as 0 days old)
    if (publishedAt > now) {
      return 1.0;
    }

    const daysSincePublished = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);

    // Exponential decay: score = e^(-ln(2) * days / halfLife)
    // This ensures score = 0.5 when days = halfLife
    const score = Math.exp((-Math.LN2 * daysSincePublished) / this.recencyHalfLife);

    return this.clamp(score, 0, 1);
  }

  /**
   * Score engagement: Normalized by source averages
   */
  private scoreEngagement(article: Article): number {
    if (!article.engagement) {
      return 0.5; // Neutral score if no engagement data
    }

    const { upvotes = 0, comments = 0, shares = 0, views = 0 } = article.engagement;

    // Determine baseline based on source
    const source = this.getSourceType(article.source);
    const baseline =
      this.engagementBaselines[source as keyof typeof this.engagementBaselines] ??
      this.engagementBaselines.default;

    // Calculate engagement score components
    const upvoteScore = upvotes > 0 ? Math.min(1.0, upvotes / baseline) : 0;
    const commentScore = comments > 0 ? Math.min(1.0, comments / (baseline * 0.2)) : 0;
    const shareScore = shares > 0 ? Math.min(1.0, shares / (baseline * 0.1)) : 0;
    const viewScore = views > 0 ? Math.min(1.0, views / (baseline * 10)) : 0;

    // Weighted average (upvotes most important)
    const weights = {
      upvotes: 0.4,
      comments: 0.3,
      shares: 0.2,
      views: 0.1,
    };

    const score =
      upvoteScore * weights.upvotes +
      commentScore * weights.comments +
      shareScore * weights.shares +
      viewScore * weights.views;

    return this.clamp(score, 0, 1);
  }

  /**
   * Score readability: Flesch reading ease formula
   * Target: 60-70 (Plain English)
   */
  private scoreReadability(article: Article): number {
    const text = article.content || article.title;

    // Check for truly empty or whitespace-only content
    if (!text || text.trim().length === 0) {
      return 0.5; // Neutral score if no content
    }

    const flesch = this.calculateFleschScore(text);

    // Map Flesch score to 0-1 range
    // Target range: 30-70 maps to 0-1
    const { minFlesch, maxFlesch } = this.readabilityTarget;
    const score = (flesch - minFlesch) / (maxFlesch - minFlesch);

    return this.clamp(score, 0, 1);
  }

  /**
   * Calculate Flesch Reading Ease score
   * Formula: 206.835 - 1.015(total words / total sentences) - 84.6(total syllables / total words)
   */
  private calculateFleschScore(text: string): number {
    const sentences = this.countSentences(text);
    const words = this.countWords(text);
    const syllables = this.countSyllables(text);

    if (sentences === 0 || words === 0) {
      return 60; // Default to average if no sentences/words
    }

    const avgWordsPerSentence = words / sentences;
    const avgSyllablesPerWord = syllables / words;

    const flesch = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;

    return flesch;
  }

  /**
   * Score relevance: Keyword matching + topic classification
   */
  private scoreRelevance(article: Article): number {
    const text = `${article.title} ${article.content || ""}`.toLowerCase();

    // Count keyword matches
    let matchCount = 0;
    for (const keyword of this.relevanceKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }

    // Normalize by number of keywords (with diminishing returns)
    const keywordScore = Math.min(1.0, Math.sqrt(matchCount / 10));

    // Topic match score (simplified - could use AI classification)
    // For now, boost if title contains business-related terms
    const topicScore = this.hasBusinessTopic(article.title) ? 0.8 : 0.4;

    // Weighted combination (60% keywords, 40% topic)
    const score = keywordScore * 0.6 + topicScore * 0.4;

    return this.clamp(score, 0, 1);
  }

  /**
   * Score authority: Source reputation + author credibility
   */
  private scoreAuthority(article: Article): number {
    const sourceType = this.getSourceType(article.source);
    const sourceScore = this.authorityMap[sourceType] ?? this.authorityMap["unknown"] ?? 0.5;

    // Author credibility (simplified - could integrate with author database)
    const authorScore = article.author ? 0.7 : 0.5;

    // Weighted combination (70% source, 30% author)
    const score = sourceScore * 0.7 + authorScore * 0.3;

    return this.clamp(score, 0, 1);
  }

  /**
   * Score uniqueness: TF-IDF or content freshness
   * Penalize if similar content recently sent
   */
  private scoreUniqueness(article: Article): number {
    if (this.recentArticles.length === 0) {
      return 1.0; // No recent articles to compare
    }

    // Calculate similarity to recent articles
    let maxSimilarity = 0;

    for (const recentArticle of this.recentArticles) {
      const similarity = this.calculateSimilarity(article, recentArticle);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }

    // Penalize similar content (80% penalty at 100% similarity)
    const score = 1.0 - maxSimilarity * 0.8;

    return this.clamp(score, 0, 1);
  }

  /**
   * Calculate final weighted score
   */
  private calculateFinalScore(scores: Omit<ArticleScores, "final">): number {
    const score =
      scores.recency * this.weights.recency +
      scores.engagement * this.weights.engagement +
      scores.readability * this.weights.readability +
      scores.relevance * this.weights.relevance +
      scores.authority * this.weights.authority +
      scores.uniqueness * this.weights.uniqueness;

    return this.clamp(score, 0, 1);
  }

  /**
   * Calculate performance metrics
   */
  private calculateMetrics(articles: Article[], duration: number): ScorerMetrics {
    const scores = articles.map((a) => a.scores?.final ?? 0);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    const distribution = {
      excellent: scores.filter((s) => s >= 0.8).length,
      good: scores.filter((s) => s >= 0.6 && s < 0.8).length,
      average: scores.filter((s) => s >= 0.4 && s < 0.6).length,
      below: scores.filter((s) => s < 0.4).length,
    };

    return {
      totalArticles: articles.length,
      duration,
      articlesPerSecond: (articles.length / duration) * 1000,
      averageScore: avgScore,
      scoreDistribution: distribution,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Extract source type from source identifier
   * Format: "source:identifier" (e.g., "reddit:entrepreneur", "rss:hbr")
   */
  private getSourceType(source: string): string {
    const parts = source.split(":");
    return parts.length > 1 ? parts[1] : "unknown";
  }

  /**
   * Check if title contains business-related topic
   */
  private hasBusinessTopic(title: string): boolean {
    const businessTerms = [
      "business",
      "startup",
      "entrepreneur",
      "strategy",
      "growth",
      "revenue",
      "profit",
      "marketing",
      "sales",
      "product",
      "management",
      "leadership",
      "innovation",
      "technology",
    ];

    const lowerTitle = title.toLowerCase();
    return businessTerms.some((term) => lowerTitle.includes(term));
  }

  /**
   * Count sentences in text
   */
  private countSentences(text: string): number {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    return Math.max(1, sentences.length);
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    return Math.max(1, words.length);
  }

  /**
   * Count syllables in text (approximation)
   */
  private countSyllables(text: string): number {
    const words = text.toLowerCase().split(/\s+/);
    let totalSyllables = 0;

    for (const word of words) {
      totalSyllables += this.countSyllablesInWord(word);
    }

    return Math.max(1, totalSyllables);
  }

  /**
   * Count syllables in a single word (approximation)
   */
  private countSyllablesInWord(word: string): number {
    word = word.toLowerCase().replace(/[^a-z]/g, "");
    if (word.length <= 3) return 1;

    // Count vowel groups
    const vowelGroups = word.match(/[aeiouy]+/g);
    let syllables = vowelGroups ? vowelGroups.length : 1;

    // Adjust for silent 'e'
    if (word.endsWith("e")) {
      syllables--;
    }

    return Math.max(1, syllables);
  }

  /**
   * Calculate similarity between two articles (simplified Jaccard similarity)
   */
  private calculateSimilarity(article1: Article, article2: Article): number {
    const text1 = `${article1.title} ${article1.content || ""}`.toLowerCase();
    const text2 = `${article2.title} ${article2.content || ""}`.toLowerCase();

    // Extract words
    const words1 = new Set(text1.split(/\s+/).filter((w) => w.length > 3));
    const words2 = new Set(text2.split(/\s+/).filter((w) => w.length > 3));

    // Calculate Jaccard similarity: |A ∩ B| / |A ∪ B|
    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    if (union.size === 0) return 0;

    return intersection.size / union.size;
  }

  /**
   * Clamp a value between min and max
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Get current configuration
   */
  public getConfig(): {
    weights: ScoringWeights;
    recencyHalfLife: number;
    engagementBaselines: typeof DEFAULT_ENGAGEMENT_BASELINES;
    readabilityTarget: { minFlesch: number; maxFlesch: number };
  } {
    return {
      weights: { ...this.weights },
      recencyHalfLife: this.recencyHalfLife,
      engagementBaselines: { ...this.engagementBaselines },
      readabilityTarget: { ...this.readabilityTarget },
    };
  }
}

/**
 * Create a scorer with default configuration
 */
export function createDefaultScorer(): ArticleScorer {
  return new ArticleScorer();
}

/**
 * Create a scorer optimized for business content
 */
export function createBusinessScorer(recentArticles?: Article[]): ArticleScorer {
  return new ArticleScorer({
    weights: {
      recency: 0.15,
      engagement: 0.2, // Slightly lower
      readability: 0.15,
      relevance: 0.3, // Higher for business content
      authority: 0.15, // Higher for business sources
      uniqueness: 0.05, // Lower (less critical)
    },
    recentArticles,
  });
}

/**
 * Create a scorer optimized for viral content
 */
export function createViralScorer(): ArticleScorer {
  return new ArticleScorer({
    weights: {
      recency: 0.2, // Higher for trending
      engagement: 0.4, // Much higher for viral
      readability: 0.1, // Lower (viral can be complex)
      relevance: 0.15, // Lower (broader topics)
      authority: 0.05, // Lower (any source can go viral)
      uniqueness: 0.1,
    },
    recencyHalfLife: 3, // Faster decay (3 days)
  });
}
