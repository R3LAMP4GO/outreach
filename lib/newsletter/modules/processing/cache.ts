/**
 * In-memory cache implementation for article summaries
 * Production note: Replace with Redis for distributed systems
 */

import type { CacheEntry, EnrichedArticle } from "../../types/summarizer";

export class SummaryCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly ttlSeconds: number;

  constructor(ttlSeconds: number = 7 * 24 * 60 * 60) {
    // Default: 7 days
    this.ttlSeconds = ttlSeconds;
    // Start cleanup interval to remove expired entries
    this.startCleanupInterval();
  }

  /**
   * Generate cache key from article content
   * Uses URL as primary key, falls back to content hash
   */
  private generateKey(url: string, content: string): string {
    // Simple hash function for content
    const contentHash = this.hashString(content.substring(0, 500));
    return `${url}:${contentHash}`;
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get cached entry if exists and not expired
   */
  get(url: string, content: string): EnrichedArticle | null {
    const key = this.generateKey(url, content);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (new Date() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Increment hit count
    entry.hits++;
    entry.data.metadata.fromCache = true;

    return entry.data;
  }

  /**
   * Store enriched article in cache
   */
  set(article: EnrichedArticle): void {
    const key = this.generateKey(article.article.url, article.article.content);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);

    const entry: CacheEntry = {
      data: article,
      cachedAt: now,
      expiresAt,
      hits: 0,
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if article is in cache
   */
  has(url: string, content: string): boolean {
    const key = this.generateKey(url, content);
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check if expired
    if (new Date() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear specific entry
   */
  delete(url: string, content: string): boolean {
    const key = this.generateKey(url, content);
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    totalHits: number;
    entries: Array<{ key: string; hits: number; expiresAt: Date }>;
  } {
    let totalHits = 0;
    const entries: Array<{ key: string; hits: number; expiresAt: Date }> = [];

    this.cache.forEach((entry, key) => {
      totalHits += entry.hits;
      entries.push({
        key,
        hits: entry.hits,
        expiresAt: entry.expiresAt,
      });
    });

    return {
      size: this.cache.size,
      totalHits,
      entries: entries.sort((a, b) => b.hits - a.hits),
    };
  }

  /**
   * Remove expired entries (called periodically)
   */
  private cleanup(): void {
    const now = new Date();
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => this.cache.delete(key));
  }

  /**
   * Start periodic cleanup interval (every hour)
   */
  private cleanupInterval?: NodeJS.Timeout;

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      60 * 60 * 1000, // 1 hour
    );
  }

  /**
   * Stop cleanup interval (for graceful shutdown)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }
}
