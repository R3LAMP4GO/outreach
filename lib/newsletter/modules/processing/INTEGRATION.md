# Integration Guide: AI Summarization Module

This guide shows how to integrate the AI summarization module into your newsletter pipeline.

## Architecture Overview

```
RSS Feed → Article Parser → AI Summarizer → Database → Newsletter Generator
```

## Step 1: Install Dependencies

```bash
cd packages/newsletter-core
pnpm install
```

Ensure these dependencies are installed:
- `@anthropic-ai/sdk` - Claude API client
- `@supabase/supabase-js` - Database client
- `zod` - Type validation

## Step 2: Set Environment Variables

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-xxx
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
```

## Step 3: Database Schema

Add these columns to your `articles` table:

```sql
-- Migration: Add AI enrichment columns
ALTER TABLE articles
ADD COLUMN summary TEXT,
ADD COLUMN key_insights JSONB,
ADD COLUMN psychology_principle JSONB,
ADD COLUMN actionable_framework JSONB,
ADD COLUMN ai_metadata JSONB,
ADD COLUMN enriched_at TIMESTAMP WITH TIME ZONE;

-- Index for querying enriched articles
CREATE INDEX idx_articles_enriched_at ON articles(enriched_at);

-- Index for psychology principles
CREATE INDEX idx_articles_psychology_principle
ON articles USING GIN (psychology_principle);
```

Example of stored data:

```json
{
  "summary": "Loss aversion drives 30% higher conversions...",
  "key_insights": [
    "Loss-framed messaging outperforms gain-framed by 30%",
    "People feel losses 2x more intensely than equivalent gains",
    "Amazon uses scarcity to trigger loss aversion"
  ],
  "psychology_principle": {
    "name": "Loss Aversion",
    "explanation": "The psychological pain of losing..."
  },
  "actionable_framework": {
    "title": "3-Step Loss Aversion Framework",
    "steps": [
      "Identify what customers stand to lose",
      "Reframe messaging around loss prevention",
      "Add genuine urgency elements"
    ]
  },
  "ai_metadata": {
    "processedAt": "2024-01-15T10:30:00Z",
    "model": "claude-3-5-sonnet-20241022",
    "tokensUsed": 850,
    "processingTimeMs": 1250,
    "fromCache": false
  }
}
```

## Step 4: Create Summarization Service

```typescript
// src/services/enrichment-service.ts

import { createClient } from '@supabase/supabase-js';
import { ArticleSummarizer, type ArticleInput } from '@/lib/newsletter/processing';

export class ArticleEnrichmentService {
  private summarizer: ArticleSummarizer;
  private supabase: ReturnType<typeof createClient>;

  constructor() {
    this.summarizer = new ArticleSummarizer({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      enableCache: true,
      enableRateLimiting: true,
    });

    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );
  }

  /**
   * Enrich a single article
   */
  async enrichArticle(articleId: string): Promise<void> {
    // Fetch article from database
    const { data: article, error } = await this.supabase
      .from('articles')
      .select('*')
      .eq('id', articleId)
      .single();

    if (error || !article) {
      throw new Error(`Article not found: ${articleId}`);
    }

    // Skip if already enriched
    if (article.enriched_at) {
      console.log(`Article ${articleId} already enriched`);
      return;
    }

    // Convert to ArticleInput format
    const input: ArticleInput = {
      id: article.id,
      title: article.title,
      content: article.content || article.description,
      url: article.url,
      publishedAt: new Date(article.published_at),
      author: article.author,
      source: article.source_name,
    };

    // Summarize with AI
    const result = await this.summarizer.summarize(input);

    if (!result.success) {
      throw new Error(`Summarization failed: ${result.error.message}`);
    }

    const enriched = result.data;

    // Save back to database
    const { error: updateError } = await this.supabase
      .from('articles')
      .update({
        summary: enriched.summary,
        key_insights: enriched.keyInsights,
        psychology_principle: enriched.psychologyPrinciple || null,
        actionable_framework: enriched.actionableFramework || null,
        ai_metadata: enriched.metadata,
        enriched_at: new Date().toISOString(),
      })
      .eq('id', articleId);

    if (updateError) {
      throw new Error(`Failed to save enrichment: ${updateError.message}`);
    }

    console.log(`Article ${articleId} enriched successfully`);
  }

  /**
   * Enrich multiple articles in batch
   */
  async enrichBatch(articleIds: string[]): Promise<{
    successful: string[];
    failed: Array<{ id: string; error: string }>;
  }> {
    const successful: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of articleIds) {
      try {
        await this.enrichArticle(id);
        successful.push(id);
      } catch (error) {
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { successful, failed };
  }

  /**
   * Enrich all unenriched articles
   */
  async enrichAllPending(limit: number = 100): Promise<void> {
    // Fetch unenriched articles
    const { data: articles, error } = await this.supabase
      .from('articles')
      .select('id, title')
      .is('enriched_at', null)
      .limit(limit)
      .order('published_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch articles: ${error.message}`);
    }

    if (!articles || articles.length === 0) {
      console.log('No pending articles to enrich');
      return;
    }

    console.log(`Enriching ${articles.length} articles...`);

    const result = await this.enrichBatch(articles.map((a) => a.id));

    console.log(`Successful: ${result.successful.length}`);
    console.log(`Failed: ${result.failed.length}`);

    if (result.failed.length > 0) {
      console.error('Failed articles:', result.failed);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.summarizer.getCacheStats();
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus() {
    return this.summarizer.getRateLimitStatus();
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.summarizer.destroy();
  }
}
```

## Step 5: Create CLI Command

```typescript
// src/cli/enrich-articles.ts

import { Command } from 'commander';
import { ArticleEnrichmentService } from '../services/enrichment-service';

const program = new Command();

program
  .name('enrich-articles')
  .description('Enrich articles with AI-generated summaries and insights');

program
  .command('enrich-one')
  .description('Enrich a single article')
  .argument('<article-id>', 'Article ID to enrich')
  .action(async (articleId: string) => {
    const service = new ArticleEnrichmentService();
    try {
      await service.enrichArticle(articleId);
      console.log('Done!');
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    } finally {
      service.destroy();
    }
  });

program
  .command('enrich-batch')
  .description('Enrich multiple articles')
  .argument('<article-ids...>', 'Article IDs to enrich (space-separated)')
  .action(async (articleIds: string[]) => {
    const service = new ArticleEnrichmentService();
    try {
      const result = await service.enrichBatch(articleIds);
      console.log(`Successful: ${result.successful.length}`);
      console.log(`Failed: ${result.failed.length}`);
      if (result.failed.length > 0) {
        console.error('Failed articles:', result.failed);
      }
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    } finally {
      service.destroy();
    }
  });

program
  .command('enrich-all')
  .description('Enrich all pending articles')
  .option('-l, --limit <number>', 'Maximum number of articles to process', '100')
  .action(async (options) => {
    const service = new ArticleEnrichmentService();
    try {
      await service.enrichAllPending(parseInt(options.limit));
      console.log('Done!');
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    } finally {
      service.destroy();
    }
  });

program
  .command('stats')
  .description('Show cache and rate limit statistics')
  .action(() => {
    const service = new ArticleEnrichmentService();

    console.log('=== CACHE STATS ===');
    const cacheStats = service.getCacheStats();
    if (cacheStats) {
      console.log(`Size: ${cacheStats.size}`);
      console.log(`Total hits: ${cacheStats.totalHits}`);
    } else {
      console.log('Cache disabled');
    }

    console.log('\n=== RATE LIMIT STATUS ===');
    const rateLimitStatus = service.getRateLimitStatus();
    if (rateLimitStatus) {
      console.log(`Remaining requests: ${rateLimitStatus.requests}`);
      console.log(`Remaining tokens: ${rateLimitStatus.tokens}`);
      console.log(`Resets in: ${Math.round(rateLimitStatus.resetsIn / 1000)}s`);
    } else {
      console.log('Rate limiting disabled');
    }

    service.destroy();
  });

program.parse();
```

Usage:

```bash
# Enrich a single article
tsx src/cli/enrich-articles.ts enrich-one article-123

# Enrich multiple articles
tsx src/cli/enrich-articles.ts enrich-batch article-1 article-2 article-3

# Enrich all pending articles
tsx src/cli/enrich-articles.ts enrich-all

# Enrich with custom limit
tsx src/cli/enrich-articles.ts enrich-all --limit 50

# Show statistics
tsx src/cli/enrich-articles.ts stats
```

## Step 6: Scheduled Job (Cron)

```typescript
// src/jobs/article-enrichment-job.ts

import cron from 'node-cron';
import { ArticleEnrichmentService } from '../services/enrichment-service';

/**
 * Run article enrichment every 15 minutes
 */
export function startEnrichmentJob() {
  const service = new ArticleEnrichmentService();

  // Every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    console.log('[Enrichment Job] Starting...');

    try {
      await service.enrichAllPending(20); // Process 20 articles per run
      console.log('[Enrichment Job] Completed successfully');
    } catch (error) {
      console.error('[Enrichment Job] Error:', error);
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[Enrichment Job] Shutting down...');
    service.destroy();
    process.exit(0);
  });

  console.log('[Enrichment Job] Scheduled (every 15 minutes)');
}

// Start if run directly
if (require.main === module) {
  startEnrichmentJob();
}
```

## Step 7: Queue-Based Processing (BullMQ)

For high-volume production systems:

```typescript
// src/queues/enrichment-queue.ts

import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { ArticleEnrichmentService } from '../services/enrichment-service';

const connection = new Redis(process.env.REDIS_URL!);

// Create queue
export const enrichmentQueue = new Queue('article-enrichment', {
  connection,
});

// Add article to queue
export async function queueArticleForEnrichment(articleId: string) {
  await enrichmentQueue.add(
    'enrich',
    { articleId },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    }
  );
}

// Worker to process queue
export function startEnrichmentWorker() {
  const service = new ArticleEnrichmentService();

  const worker = new Worker(
    'article-enrichment',
    async (job) => {
      const { articleId } = job.data;
      console.log(`Processing article: ${articleId}`);

      await service.enrichArticle(articleId);

      return { articleId, success: true };
    },
    {
      connection,
      concurrency: 5, // Process 5 articles concurrently
    }
  );

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down worker...');
    await worker.close();
    service.destroy();
    process.exit(0);
  });

  console.log('Enrichment worker started');
}
```

Usage:

```typescript
// When new article is added to database
import { queueArticleForEnrichment } from './queues/enrichment-queue';

async function onNewArticle(articleId: string) {
  await queueArticleForEnrichment(articleId);
}
```

## Step 8: API Endpoint

```typescript
// src/api/routes/enrichment.ts

import { Router } from 'express';
import { ArticleEnrichmentService } from '../../services/enrichment-service';

const router = Router();
const service = new ArticleEnrichmentService();

// Enrich a single article
router.post('/articles/:id/enrich', async (req, res) => {
  try {
    const { id } = req.params;
    await service.enrichArticle(id);
    res.json({ success: true, articleId: id });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Enrich multiple articles
router.post('/articles/enrich-batch', async (req, res) => {
  try {
    const { articleIds } = req.body;

    if (!Array.isArray(articleIds)) {
      return res.status(400).json({
        success: false,
        error: 'articleIds must be an array',
      });
    }

    const result = await service.enrichBatch(articleIds);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get statistics
router.get('/enrichment/stats', (req, res) => {
  const cacheStats = service.getCacheStats();
  const rateLimitStatus = service.getRateLimitStatus();

  res.json({
    cache: cacheStats,
    rateLimit: rateLimitStatus,
  });
});

export default router;
```

## Step 9: Monitor and Alert

```typescript
// src/monitoring/enrichment-metrics.ts

import { ArticleEnrichmentService } from '../services/enrichment-service';

export class EnrichmentMetrics {
  private service: ArticleEnrichmentService;
  private metricsHistory: Array<{
    timestamp: Date;
    successful: number;
    failed: number;
    tokensUsed: number;
    cacheHitRate: number;
  }> = [];

  constructor(service: ArticleEnrichmentService) {
    this.service = service;
  }

  /**
   * Record metrics after batch processing
   */
  recordBatch(stats: {
    successful: number;
    failed: number;
    tokensUsed: number;
    cacheHits: number;
    total: number;
  }) {
    this.metricsHistory.push({
      timestamp: new Date(),
      successful: stats.successful,
      failed: stats.failed,
      tokensUsed: stats.tokensUsed,
      cacheHitRate: stats.cacheHits / stats.total,
    });

    // Keep only last 100 entries
    if (this.metricsHistory.length > 100) {
      this.metricsHistory.shift();
    }

    // Alert if failure rate is high
    if (stats.failed > stats.successful) {
      this.alert('High failure rate detected', stats);
    }

    // Alert if token usage is unusually high
    const avgTokens = stats.tokensUsed / stats.successful;
    if (avgTokens > 2000) {
      this.alert('High token usage detected', { avgTokens });
    }
  }

  /**
   * Get metrics summary
   */
  getSummary() {
    if (this.metricsHistory.length === 0) {
      return null;
    }

    const total = this.metricsHistory.reduce(
      (acc, m) => ({
        successful: acc.successful + m.successful,
        failed: acc.failed + m.failed,
        tokensUsed: acc.tokensUsed + m.tokensUsed,
      }),
      { successful: 0, failed: 0, tokensUsed: 0 }
    );

    const avgCacheHitRate =
      this.metricsHistory.reduce((sum, m) => sum + m.cacheHitRate, 0) /
      this.metricsHistory.length;

    return {
      totalSuccessful: total.successful,
      totalFailed: total.failed,
      totalTokens: total.tokensUsed,
      avgCacheHitRate: Math.round(avgCacheHitRate * 100),
      estimatedCost: (total.tokensUsed * 0.003) / 1000,
    };
  }

  /**
   * Send alert (implement your alerting mechanism)
   */
  private alert(message: string, data: any) {
    console.error(`[ALERT] ${message}`, data);
    // TODO: Send to Slack, PagerDuty, etc.
  }
}
```

## Testing the Integration

```bash
# 1. Add a test article to database
psql $DATABASE_URL -c "INSERT INTO articles (title, content, url, published_at) VALUES ('Test', 'Content...', 'https://test.com', NOW());"

# 2. Enrich the article
tsx src/cli/enrich-articles.ts enrich-all --limit 1

# 3. Verify enrichment
psql $DATABASE_URL -c "SELECT id, title, summary, enriched_at FROM articles WHERE enriched_at IS NOT NULL LIMIT 1;"
```

## Best Practices

1. **Rate Limiting**: Never disable rate limiting in production
2. **Caching**: Keep cache enabled to reduce API costs (30-50% savings)
3. **Batch Size**: Process 20-50 articles at a time to balance throughput and error recovery
4. **Error Handling**: Always log failures for manual review
5. **Monitoring**: Track token usage and costs daily
6. **Retries**: Use exponential backoff for transient failures
7. **Queue-Based**: For high volume, use BullMQ or similar queue system
8. **Database Indexes**: Index `enriched_at` column for performance

## Troubleshooting

### Issue: High API costs

**Solution**:
- Check cache hit rate: `tsx src/cli/enrich-articles.ts stats`
- Increase cache TTL if content doesn't change often
- Review token usage per article in `ai_metadata.tokensUsed`

### Issue: Rate limit errors

**Solution**:
- Reduce batch size or concurrency
- Implement queue-based processing with BullMQ
- Increase `requestsPerMinute` and `tokensPerMinute` if you have higher limits

### Issue: Low-quality summaries

**Solution**:
- Review article content quality (garbage in = garbage out)
- Check that articles have sufficient content (>100 characters)
- Adjust `temperature` parameter (lower = more consistent, higher = more creative)

### Issue: Slow processing

**Solution**:
- Check cache hit rate (should be 30-50% in production)
- Increase concurrency in batch processing
- Use queue-based system for async processing
- Monitor `processingTimeMs` in metadata to identify slow articles

## Cost Estimation

Based on Claude 3.5 Sonnet pricing:

| Articles/Month | Tokens/Article | Cost/Month |
|----------------|----------------|------------|
| 1,000 | 800 | $7 |
| 10,000 | 800 | $70 |
| 100,000 | 800 | $700 |

With 40% cache hit rate:
- 1,000 articles: ~$4.20
- 10,000 articles: ~$42
- 100,000 articles: ~$420

## Support

For issues or questions:
- Check logs for detailed error messages
- Review `ai_metadata` in database for processing details
- Enable debug logging: `LOG_LEVEL=debug`
