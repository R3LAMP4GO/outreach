/**
 * Article Content Filtering Module
 *
 * Removes low-quality and inappropriate articles from the curation pipeline.
 * Filters run after scoring to ensure only high-quality content reaches the newsletter.
 *
 * Features:
 * - Composable filter functions
 * - Configurable thresholds
 * - Detailed rejection tracking
 * - Domain diversity controls
 * - Performance optimized for batch processing
 *
 * @example
 * ```typescript
 * const filter = new ArticleFilter({
 *   minScore: 0.6,
 *   minWords: 200,
 *   maxWords: 5000,
 *   maxArticlesPerDomain: 3,
 * });
 *
 * const result = await filter.filterArticles(scoredArticles);
 * console.log(`Passed: ${result.passed.length}`);
 * console.log(`Rejected: ${result.rejected.length}`);
 * console.log(`Reasons:`, result.stats.rejectionReasons);
 * ```
 */

import { Article } from "../../types/article";

/**
 * Filter configuration options
 */
export interface FilterConfig {
  // Score threshold
  minScore: number;

  // Content length boundaries (in words)
  minWords: number;
  maxWords: number;

  // Promotional content detection
  filterPromotional: boolean;
  promotionalKeywords?: string[];

  // Quality filters
  filterClickbait: boolean;
  minReadability?: number; // Flesch reading ease score (0-100)

  // Spam/low-value filters
  filterSpam: boolean;
  maxLinksPerHundredWords?: number;

  // Domain diversity
  maxArticlesPerDomain: number;

  // Custom reject keywords
  rejectKeywords?: string[];
}

/**
 * Default filter configuration
 */
export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  minScore: 0.6,
  minWords: 200,
  maxWords: 5000,
  filterPromotional: true,
  filterClickbait: true,
  filterSpam: true,
  maxArticlesPerDomain: 3,
  maxLinksPerHundredWords: 5,
  minReadability: 30,
  promotionalKeywords: [
    "buy now",
    "limited offer",
    "discount code",
    "affiliate",
    "sponsored",
    "click here",
    "limited time",
    "act now",
    "exclusive deal",
    "coupon",
    "promo code",
  ],
  rejectKeywords: [],
};

/**
 * Rejection reason tracking
 */
export interface RejectionReason {
  articleId: string;
  title: string;
  reasons: string[];
  score?: number;
}

/**
 * Filtered article with rejection details
 */
export interface FilteredArticle {
  article: Article;
  passed: boolean;
  reasons?: string[];
}

/**
 * Filter result with statistics
 */
export interface FilterResult {
  passed: Article[];
  rejected: RejectionReason[];
  stats: {
    total: number;
    passed: number;
    rejected: number;
    processingTimeMs: number;
    rejectionReasons: Record<string, number>;
  };
}

/**
 * ArticleFilter class for filtering low-quality and inappropriate content
 */
export class ArticleFilter {
  private config: FilterConfig;

  constructor(config: Partial<FilterConfig> = {}) {
    this.config = { ...DEFAULT_FILTER_CONFIG, ...config };
  }

  /**
   * Filter an array of articles
   */
  async filterArticles(articles: Article[]): Promise<FilterResult> {
    const startTime = performance.now();

    const passed: Article[] = [];
    const rejected: RejectionReason[] = [];
    const rejectionReasonCounts: Record<string, number> = {};

    // Track domain counts for diversity filter
    const domainCounts = new Map<string, number>();

    for (const article of articles) {
      const reasons: string[] = [];

      // Apply all filters
      this.applyScoreFilter(article, reasons);
      this.applyContentLengthFilter(article, reasons);

      if (this.config.filterPromotional) {
        this.applyPromotionalFilter(article, reasons);
      }

      if (this.config.filterClickbait) {
        this.applyClickbaitFilter(article, reasons);
      }

      if (this.config.filterSpam) {
        this.applySpamFilter(article, reasons);
      }

      this.applyReadabilityFilter(article, reasons);
      this.applyKeywordFilter(article, reasons);

      // Domain diversity filter (stateful)
      this.applyDomainDiversityFilter(article, domainCounts, reasons);

      // Determine pass/fail
      if (reasons.length === 0) {
        passed.push(article);
      } else {
        rejected.push({
          articleId: article.id,
          title: article.title,
          reasons,
          score: article.scores?.final,
        });

        // Track rejection reasons
        for (const reason of reasons) {
          rejectionReasonCounts[reason] = (rejectionReasonCounts[reason] || 0) + 1;
        }
      }
    }

    const endTime = performance.now();

    return {
      passed,
      rejected,
      stats: {
        total: articles.length,
        passed: passed.length,
        rejected: rejected.length,
        processingTimeMs: endTime - startTime,
        rejectionReasons: rejectionReasonCounts,
      },
    };
  }

  /**
   * Filter: Score threshold
   */
  private applyScoreFilter(article: Article, reasons: string[]): void {
    if (!article.scores?.final) {
      reasons.push("missing_score");
      return;
    }

    if (article.scores.final < this.config.minScore) {
      reasons.push(`score_too_low (${article.scores.final.toFixed(2)} < ${this.config.minScore})`);
    }
  }

  /**
   * Filter: Content length (word count)
   */
  private applyContentLengthFilter(article: Article, reasons: string[]): void {
    const wordCount = this.countWords(article.content);

    if (wordCount < this.config.minWords) {
      reasons.push(`too_short (${wordCount} words < ${this.config.minWords})`);
    } else if (wordCount > this.config.maxWords) {
      reasons.push(`too_long (${wordCount} words > ${this.config.maxWords})`);
    }
  }

  /**
   * Filter: Promotional content detection
   */
  private applyPromotionalFilter(article: Article, reasons: string[]): void {
    const combinedText = `${article.title} ${article.content}`.toLowerCase();
    const keywords = this.config.promotionalKeywords || DEFAULT_FILTER_CONFIG.promotionalKeywords!;

    // Check for promotional keywords
    const foundKeywords = keywords.filter((keyword) =>
      combinedText.includes(keyword.toLowerCase()),
    );

    if (foundKeywords.length > 0) {
      reasons.push(`promotional_content (keywords: ${foundKeywords.slice(0, 3).join(", ")})`);
    }

    // Check for excessive capitalization (>30% caps in title)
    const capsPercentage = this.calculateCapsPercentage(article.title);
    if (capsPercentage > 30) {
      reasons.push(`excessive_caps (${capsPercentage.toFixed(0)}%)`);
    }

    // Check for excessive links
    const wordCount = this.countWords(article.content);
    const linkCount = this.countLinks(article.content);
    const linksPerHundredWords = (linkCount / wordCount) * 100;

    if (linksPerHundredWords > (this.config.maxLinksPerHundredWords || 5)) {
      reasons.push(`excessive_links (${linksPerHundredWords.toFixed(1)} per 100 words)`);
    }
  }

  /**
   * Filter: Clickbait detection
   */
  private applyClickbaitFilter(article: Article, reasons: string[]): void {
    const title = article.title;

    // Check for excessive punctuation
    const punctuationCount = (title.match(/[!?]+/g) || []).length;
    if (punctuationCount > 2) {
      reasons.push(`clickbait_punctuation (${punctuationCount} exclamation/question marks)`);
    }

    // Check for all caps title (allowing for acronyms)
    const words = title.split(/\s+/);
    const allCapsWords = words.filter(
      (word) => word.length > 3 && word === word.toUpperCase() && /[A-Z]/.test(word),
    );
    if (allCapsWords.length > 2) {
      reasons.push(`clickbait_all_caps (${allCapsWords.length} all-caps words)`);
    }

    // Check for clickbait phrases
    const clickbaitPhrases = [
      "you won't believe",
      "shocking",
      "one weird trick",
      "doctors hate",
      "what happens next",
      "number 7 will",
      "this is why",
      "the reason why",
    ];

    const titleLower = title.toLowerCase();
    const foundPhrases = clickbaitPhrases.filter((phrase) => titleLower.includes(phrase));

    if (foundPhrases.length > 0) {
      reasons.push(`clickbait_phrases (${foundPhrases[0]})`);
    }
  }

  /**
   * Filter: Spam and low-value content
   */
  private applySpamFilter(article: Article, reasons: string[]): void {
    const content = article.content;
    const wordCount = this.countWords(content);

    // Check for thin content (high link-to-text ratio)
    const linkCount = this.countLinks(content);
    const textToLinkRatio = wordCount / Math.max(linkCount, 1);

    if (linkCount > 5 && textToLinkRatio < 50) {
      reasons.push(`thin_content (text/link ratio: ${textToLinkRatio.toFixed(0)})`);
    }

    // Check for press release indicators
    const pressReleaseIndicators = [
      "press release",
      "for immediate release",
      "media contact",
      "about the company",
      "forward-looking statements",
    ];

    const contentLower = content.toLowerCase();
    const foundIndicators = pressReleaseIndicators.filter((indicator) =>
      contentLower.includes(indicator),
    );

    if (foundIndicators.length >= 2) {
      reasons.push("press_release");
    }

    // Check for self-promotional content
    const selfPromotionIndicators = ["our company", "our product", "we offer", "contact us for"];
    const foundSelfPromo = selfPromotionIndicators.filter((indicator) =>
      contentLower.includes(indicator),
    );

    if (foundSelfPromo.length >= 3) {
      reasons.push("self_promotional");
    }
  }

  /**
   * Filter: Readability score
   */
  private applyReadabilityFilter(article: Article, reasons: string[]): void {
    if (!article.scores?.readability) {
      return; // Skip if readability not calculated
    }

    const minReadability = this.config.minReadability || DEFAULT_FILTER_CONFIG.minReadability!;

    // Readability score is 0-1, convert to Flesch scale (0-100)
    const fleschScore = article.scores.readability * 100;

    if (fleschScore < minReadability) {
      reasons.push(`low_readability (${fleschScore.toFixed(0)} < ${minReadability})`);
    }
  }

  /**
   * Filter: Custom keyword rejection
   */
  private applyKeywordFilter(article: Article, reasons: string[]): void {
    if (!this.config.rejectKeywords || this.config.rejectKeywords.length === 0) {
      return;
    }

    const combinedText = `${article.title} ${article.content}`.toLowerCase();
    const foundKeywords = this.config.rejectKeywords.filter((keyword) =>
      combinedText.includes(keyword.toLowerCase()),
    );

    if (foundKeywords.length > 0) {
      reasons.push(`rejected_keywords (${foundKeywords.slice(0, 3).join(", ")})`);
    }
  }

  /**
   * Filter: Domain diversity (max N articles per domain)
   */
  private applyDomainDiversityFilter(
    article: Article,
    domainCounts: Map<string, number>,
    reasons: string[],
  ): void {
    const domain = this.extractDomain(article.url);

    if (!domain) {
      return;
    }

    const currentCount = domainCounts.get(domain) || 0;

    if (currentCount >= this.config.maxArticlesPerDomain) {
      reasons.push(
        `domain_limit_exceeded (${domain}: ${currentCount}/${this.config.maxArticlesPerDomain})`,
      );
    } else {
      // Only increment if article hasn't been rejected by other filters
      if (reasons.length === 0) {
        domainCounts.set(domain, currentCount + 1);
      }
    }
  }

  /**
   * Utility: Count words in text
   */
  private countWords(text: string): number {
    return text
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
  }

  /**
   * Utility: Count links in text
   */
  private countLinks(text: string): number {
    // Match http/https URLs and markdown links
    const urlPattern = /https?:\/\/[^\s]+|\[.*?\]\(.*?\)/g;
    const matches = text.match(urlPattern);
    return matches ? matches.length : 0;
  }

  /**
   * Utility: Calculate percentage of capital letters
   */
  private calculateCapsPercentage(text: string): number {
    const letters = text.replace(/[^a-zA-Z]/g, "");
    if (letters.length === 0) return 0;

    const caps = text.replace(/[^A-Z]/g, "");
    return (caps.length / letters.length) * 100;
  }

  /**
   * Utility: Extract domain from URL
   */
  private extractDomain(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }

  /**
   * Update filter configuration
   */
  updateConfig(config: Partial<FilterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): FilterConfig {
    return { ...this.config };
  }

  /**
   * Individual filter functions (exposed for composition)
   */

  /**
   * Check if article passes score threshold
   */
  async checkScore(article: Article): Promise<{ passed: boolean; reason?: string }> {
    const reasons: string[] = [];
    this.applyScoreFilter(article, reasons);
    return {
      passed: reasons.length === 0,
      reason: reasons[0],
    };
  }

  /**
   * Check if article passes content length requirements
   */
  async checkContentLength(article: Article): Promise<{ passed: boolean; reason?: string }> {
    const reasons: string[] = [];
    this.applyContentLengthFilter(article, reasons);
    return {
      passed: reasons.length === 0,
      reason: reasons[0],
    };
  }

  /**
   * Check if article is promotional
   */
  async checkPromotional(article: Article): Promise<{ passed: boolean; reason?: string }> {
    const reasons: string[] = [];
    this.applyPromotionalFilter(article, reasons);
    return {
      passed: reasons.length === 0,
      reason: reasons[0],
    };
  }

  /**
   * Check if article is clickbait
   */
  async checkClickbait(article: Article): Promise<{ passed: boolean; reason?: string }> {
    const reasons: string[] = [];
    this.applyClickbaitFilter(article, reasons);
    return {
      passed: reasons.length === 0,
      reason: reasons[0],
    };
  }

  /**
   * Check if article is spam
   */
  async checkSpam(article: Article): Promise<{ passed: boolean; reason?: string }> {
    const reasons: string[] = [];
    this.applySpamFilter(article, reasons);
    return {
      passed: reasons.length === 0,
      reason: reasons[0],
    };
  }
}
