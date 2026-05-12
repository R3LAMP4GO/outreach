# AI Article Summarization Module

Production-ready AI summarization module using Anthropic Claude, optimized for business owner audiences with psychology-backed insights.

## Features

- **Psychology-Optimized Prompts**: Based on research from `newsletter-system/research/psychology-principles.md`
- **Response Caching**: In-memory cache to avoid re-processing same articles (7-day TTL)
- **Rate Limiting**: Respects Claude API limits (50 requests/min, 50K tokens/min)
- **Error Handling**: Comprehensive error types with retry logic
- **Exponential Backoff**: Automatic retry with exponential backoff on transient failures
- **Batch Processing**: Process multiple articles with concurrency control
- **TypeScript**: Fully typed with comprehensive interfaces

## Installation

```bash
cd packages/newsletter-core
pnpm install
```

## Configuration

The module requires an Anthropic API key. Set it via environment variable or pass directly:

```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

## Usage

### Basic Usage

```typescript
import { ArticleSummarizer } from '@/lib/newsletter/processing';

const summarizer = new ArticleSummarizer({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const article = {
  id: 'article-1',
  title: 'How Loss Aversion Drives Customer Decisions',
  content: 'Article content here...',
  url: 'https://example.com/article',
  publishedAt: new Date(),
  source: 'Business Psychology Today',
  author: 'Jane Smith',
};

const result = await summarizer.summarize(article);

if (result.success) {
  console.log('Summary:', result.data.summary);
  console.log('Key Insights:', result.data.keyInsights);
  console.log('Psychology Principle:', result.data.psychologyPrinciple);
  console.log('Framework:', result.data.actionableFramework);
} else {
  console.error('Error:', result.error.message);
}
```

### Batch Processing

```typescript
const articles = [
  { id: '1', title: 'Article 1', content: '...', url: '...', publishedAt: new Date() },
  { id: '2', title: 'Article 2', content: '...', url: '...', publishedAt: new Date() },
  { id: '3', title: 'Article 3', content: '...', url: '...', publishedAt: new Date() },
];

const result = await summarizer.summarizeBatch(articles, {
  concurrency: 5,
  onProgress: (completed, total) => {
    console.log(`Progress: ${completed}/${total}`);
  },
});

console.log(`Successful: ${result.stats.successful}`);
console.log(`Failed: ${result.stats.failed}`);
console.log(`Cache Hits: ${result.stats.cacheHits}`);
console.log(`Total Tokens: ${result.stats.totalTokens}`);
```

### Advanced Configuration

```typescript
const summarizer = new ArticleSummarizer({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-3-5-sonnet-20241022', // Default
  maxTokens: 1024, // Default
  temperature: 0.3, // Default (lower = more consistent)
  enableCache: true, // Default
  cacheTtlSeconds: 7 * 24 * 60 * 60, // Default: 7 days
  enableRateLimiting: true, // Default
  requestsPerMinute: 50, // Default
  tokensPerMinute: 50000, // Default
  maxRetries: 3, // Default
  retryBaseDelayMs: 1000, // Default
  timeoutMs: 30000, // Default: 30 seconds
});
```

### Cache Management

```typescript
// Get cache statistics
const stats = summarizer.getCacheStats();
console.log(`Cache size: ${stats.size}`);
console.log(`Total hits: ${stats.totalHits}`);
console.log(`Top entries:`, stats.entries.slice(0, 5));

// Clear cache
summarizer.clearCache();
```

### Rate Limit Monitoring

```typescript
const status = summarizer.getRateLimitStatus();
console.log(`Remaining requests: ${status.requests}`);
console.log(`Remaining tokens: ${status.tokens}`);
console.log(`Resets in: ${status.resetsIn}ms`);
```

### Error Handling

```typescript
const result = await summarizer.summarize(article);

if (!result.success) {
  const error = result.error;

  switch (error.type) {
    case SummarizerErrorType.RATE_LIMIT_EXCEEDED:
      console.log('Rate limited. Waiting before retry...');
      // Implement backoff strategy
      break;

    case SummarizerErrorType.INVALID_INPUT:
      console.error('Invalid article data:', error.message);
      // Fix input data
      break;

    case SummarizerErrorType.API_ERROR:
      console.error('Claude API error:', error.message);
      if (error.retryable) {
        // Retry the request
      }
      break;

    case SummarizerErrorType.TIMEOUT:
      console.error('Request timeout');
      break;

    default:
      console.error('Unknown error:', error.message);
  }
}
```

### Graceful Shutdown

```typescript
// Clean up resources on shutdown
process.on('SIGTERM', () => {
  summarizer.destroy();
  process.exit(0);
});
```

## Output Format

### EnrichedArticle Structure

```typescript
{
  article: {
    id: string;
    title: string;
    content: string;
    url: string;
    publishedAt: Date;
    author?: string;
    source?: string;
  },
  summary: string; // 2-3 sentences, max 150 words
  keyInsights: string[]; // 3-5 actionable bullet points
  psychologyPrinciple?: {
    name: string; // e.g., "Loss Aversion", "Social Proof"
    explanation: string;
  },
  actionableFramework?: {
    title: string;
    steps: string[]; // 3-7 concrete steps
  },
  metadata: {
    processedAt: Date;
    model: string;
    tokensUsed: number;
    processingTimeMs: number;
    fromCache: boolean;
  }
}
```

## Psychology Principles

The summarizer is trained to identify these key principles:

1. **Loss Aversion**: Pain of losing > pleasure of gaining
2. **Social Proof**: Following others' actions
3. **Anchoring**: Over-relying on first information
4. **Confirmation Bias**: Seeking information that confirms beliefs
5. **Scarcity**: Limited availability increases value
6. **Reciprocity**: Returning favors
7. **Authority**: Trust in experts
8. **FOMO**: Fear of missing opportunities
9. **Dunning-Kruger Effect**: Overconfidence in novices
10. **Curse of Knowledge**: Assuming others have same knowledge

## Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

## Performance Considerations

### Token Usage

Average token usage per article:
- Input: ~500-1000 tokens (depends on article length)
- Output: ~200-400 tokens (summary + insights)
- Total: ~700-1400 tokens per article

At default rate limits (50K tokens/min), you can process approximately:
- 35-70 articles per minute
- 2,100-4,200 articles per hour

### Caching Strategy

The cache uses URL + content hash as key:
- Same URL + same content = cache hit
- Same URL + different content = cache miss (article updated)
- Cache entries expire after 7 days by default

Cache hit rate in production typically 30-50% for recurring sources.

### Rate Limiting

Two independent limits are enforced:
1. **Request limit**: 50 requests/minute (default)
2. **Token limit**: 50,000 tokens/minute (default)

Both must be satisfied for a request to proceed.

## Error Codes

| Error Type | Description | Retryable |
|------------|-------------|-----------|
| `RATE_LIMIT_EXCEEDED` | API rate limit hit | Yes |
| `API_ERROR` | Claude API returned error | Maybe |
| `TIMEOUT` | Request timeout | Yes |
| `INVALID_INPUT` | Article validation failed | No |
| `PARSING_ERROR` | Failed to parse Claude response | No |
| `NETWORK_ERROR` | Network connectivity issue | Yes |
| `UNKNOWN` | Unexpected error | No |

## Production Recommendations

### 1. Use Redis for Distributed Cache

Replace in-memory cache with Redis:

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Implement custom cache that uses Redis
class RedisCache extends SummaryCache {
  // Override get/set methods to use Redis
}
```

### 2. Monitor Token Usage

Track token consumption to optimize costs:

```typescript
const result = await summarizer.summarize(article);
if (result.success) {
  metrics.recordTokens(result.data.metadata.tokensUsed);
  metrics.recordCost(result.data.metadata.tokensUsed * COST_PER_TOKEN);
}
```

### 3. Implement Circuit Breaker

Prevent cascading failures with circuit breaker pattern:

```typescript
import CircuitBreaker from 'opossum';

const breaker = new CircuitBreaker(
  async (article) => summarizer.summarize(article),
  { timeout: 30000, errorThresholdPercentage: 50 }
);
```

### 4. Add Observability

Integrate with monitoring tools:

```typescript
const result = await summarizer.summarize(article);

logger.info('Article summarized', {
  articleId: article.id,
  tokensUsed: result.data.metadata.tokensUsed,
  processingTime: result.data.metadata.processingTimeMs,
  fromCache: result.data.metadata.fromCache,
});
```

### 5. Queue-Based Processing

For high-volume scenarios, use message queues:

```typescript
import { Queue } from 'bullmq';

const summarizerQueue = new Queue('summarizer', {
  connection: redis,
});

// Add articles to queue
await summarizerQueue.add('summarize', { article });

// Process in worker
const worker = new Worker('summarizer', async (job) => {
  const result = await summarizer.summarize(job.data.article);
  return result;
});
```

## Cost Estimation

Claude 3.5 Sonnet pricing (as of Nov 2024):
- Input: $3 per million tokens
- Output: $15 per million tokens

Average cost per article:
- Input: 750 tokens × $3/1M = $0.00225
- Output: 300 tokens × $15/1M = $0.0045
- **Total: ~$0.007 per article**

For 1,000 articles: ~$7
For 10,000 articles: ~$70
For 100,000 articles: ~$700

Cache can reduce costs by 30-50% in production.

## Support

For issues or questions:
- Check existing tests for usage examples
- Review psychology research: `newsletter-system/research/psychology-principles.md`
- Open an issue in the repository

## License

MIT
