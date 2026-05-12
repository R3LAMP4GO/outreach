# Multi-Source Fetcher Orchestrator

A high-performance orchestrator for coordinating parallel content fetching from multiple sources with error resilience and performance tracking.

## Features

- **Parallel Execution**: Fetch from multiple sources simultaneously for maximum performance
- **Error Resilience**: Continue operation even if individual sources fail
- **Performance Tracking**: Monitor source health and performance metrics
- **Timeout Management**: Per-source and global timeouts to prevent hanging
- **Deduplication**: Automatically remove duplicate articles across sources
- **Rich Metrics**: Track success rates, durations, and article counts

## Installation

```typescript
import { MultiSourceFetcher } from '@/modules/orchestrator';
import { RSSSource, RedditSource, HackerNewsSource } from '@/modules/sources';
```

## Quick Start

### Basic Usage

```typescript
import { MultiSourceFetcher } from '@/modules/orchestrator';
import { RSSSource } from '@/modules/sources/rss';

async function fetchContent() {
  const fetcher = new MultiSourceFetcher();

  // Create sources
  const sources = [
    new RSSSource({
      name: 'HBR',
      url: 'https://feeds.hbr.org/harvardbusiness',
      type: 'rss',
      enabled: true,
      maxArticles: 10,
    }),
    new RSSSource({
      name: 'TechCrunch',
      url: 'https://techcrunch.com/feed/',
      type: 'rss',
      enabled: true,
      maxArticles: 10,
    }),
  ];

  // Fetch from all sources in parallel
  const result = await fetcher.fetchAll(sources);

  console.log(`Fetched ${result.summary.totalArticles} articles`);
  console.log(`Success rate: ${result.summary.successfulSources}/${result.summary.totalSources}`);
}
```

## API Reference

### MultiSourceFetcher

The main orchestrator class for coordinating multi-source fetches.

#### `fetchAll(sources, config?): Promise<OrchestratorResult>`

Fetch articles from all provided sources in parallel.

**Parameters:**
- `sources: BaseSource[]` - Array of source instances to fetch from
- `config?: Partial<MultiSourceConfig>` - Optional configuration
  - `timeout?: number` - Global timeout in milliseconds (default: 30000)
  - `maxArticlesPerSource?: number` - Max articles per source
  - `continueOnError?: boolean` - Continue if a source fails (default: true)

**Returns:** `OrchestratorResult`
```typescript
{
  articles: Article[];           // Combined articles from all sources
  results: SourceResult[];       // Per-source results
  summary: {
    totalSources: number;
    successfulSources: number;
    failedSources: number;
    totalArticles: number;
    totalDuration: number;
    averageDuration: number;
    fastestSource?: { name: string; duration: number };
    slowestSource?: { name: string; duration: number };
  };
}
```

#### `fetchFromSources(allSources, sourceNames, config?): Promise<OrchestratorResult>`

Fetch from specific sources by name.

**Parameters:**
- `allSources: BaseSource[]` - Array of all available sources
- `sourceNames: string[]` - Names of sources to fetch from
- `config?: Partial<MultiSourceConfig>` - Optional configuration

**Example:**
```typescript
const result = await fetcher.fetchFromSources(
  allSources,
  ['HBR', 'TechCrunch']
);
```

#### `getPerformanceMetrics(): SourcePerformanceMetrics[]`

Get performance metrics for all sources.

**Returns:** Array of performance metrics per source
```typescript
{
  sourceName: string;
  fetchCount: number;
  successRate: number;          // 0-1
  averageDuration: number;      // milliseconds
  averageArticleCount: number;
  lastFetchAt?: Date;
  lastError?: string;
}
```

#### `getSourceMetrics(sourceName): SourcePerformanceMetrics | undefined`

Get performance metrics for a specific source.

#### `resetMetrics(): void`

Reset all performance metrics.

## Configuration Options

### MultiSourceConfig

```typescript
interface MultiSourceConfig {
  sources: SourceConfig[];           // Source configurations
  timeout?: number;                  // Global timeout (default: 30000ms)
  maxArticlesPerSource?: number;     // Limit articles per source
  continueOnError?: boolean;         // Continue on source failure (default: true)
}
```

### SourceConfig

Each source requires a configuration object:

```typescript
interface SourceConfig {
  name: string;                      // Unique source identifier
  url: string;                       // Source URL
  type: 'rss' | 'reddit' | 'hackernews' | 'linkedin' | 'api' | 'scraper';
  enabled: boolean;                  // Whether to fetch from this source
  maxArticles?: number;              // Max articles to fetch
  timeout?: number;                  // Source-specific timeout (default: 10000ms)
  retryAttempts?: number;            // Retry attempts (default: 3)
  headers?: Record<string, string>;  // Custom HTTP headers
  customFields?: Record<string, unknown>; // Additional fields
}
```

## Usage Examples

### Example 1: Fetch from Multiple RSS Sources

```typescript
const fetcher = new MultiSourceFetcher();

const sources = [
  new RSSSource({
    name: 'HBR',
    url: 'https://feeds.hbr.org/harvardbusiness',
    type: 'rss',
    enabled: true,
    maxArticles: 10,
  }),
  new RSSSource({
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    type: 'rss',
    enabled: true,
    maxArticles: 10,
  }),
  new RSSSource({
    name: 'Entrepreneur',
    url: 'https://www.entrepreneur.com/latest.rss',
    type: 'rss',
    enabled: true,
    maxArticles: 10,
  }),
];

const result = await fetcher.fetchAll(sources);

console.log(`Total articles: ${result.summary.totalArticles}`);
console.log(`Duration: ${result.summary.totalDuration}ms`);
```

### Example 2: Mix Different Source Types

```typescript
import { RSSSource } from '@/modules/sources/rss';
import { RedditSource } from '@/modules/sources/reddit';
import { HackerNewsSource } from '@/modules/sources/hackernews';

const fetcher = new MultiSourceFetcher();

const sources = [
  new RSSSource({ name: 'HBR', url: '...', type: 'rss', enabled: true }),
  new RedditSource({ name: 'r/entrepreneur', url: '...', type: 'reddit', enabled: true }),
  new HackerNewsSource({ name: 'HN-Top', url: '...', type: 'hackernews', enabled: true }),
];

const result = await fetcher.fetchAll(sources, {
  timeout: 15000,
  continueOnError: true,
});
```

### Example 3: Handle Partial Failures

```typescript
const result = await fetcher.fetchAll(sources, {
  continueOnError: true, // Don't fail if one source fails
});

// Check for failures
const failedSources = result.results.filter(r => !r.success);
if (failedSources.length > 0) {
  console.warn('Some sources failed:', failedSources.map(s => s.source));
}

// Still get articles from successful sources
console.log(`Retrieved ${result.summary.totalArticles} articles from ${result.summary.successfulSources} sources`);
```

### Example 4: Monitor Performance

```typescript
const fetcher = new MultiSourceFetcher();

// Perform multiple fetches
for (let i = 0; i < 5; i++) {
  await fetcher.fetchAll(sources);
}

// Check performance metrics
const metrics = fetcher.getPerformanceMetrics();

metrics.forEach(metric => {
  console.log(`${metric.sourceName}:`);
  console.log(`  Success Rate: ${(metric.successRate * 100).toFixed(1)}%`);
  console.log(`  Avg Duration: ${metric.averageDuration}ms`);
  console.log(`  Avg Articles: ${metric.averageArticleCount}`);
});

// Identify slow sources
const slowSources = metrics.filter(m => m.averageDuration > 5000);
console.log('Slow sources:', slowSources.map(s => s.sourceName));
```

### Example 5: Fetch from Specific Sources

```typescript
const allSources = [
  new RSSSource({ name: 'Source1', ... }),
  new RSSSource({ name: 'Source2', ... }),
  new RSSSource({ name: 'Source3', ... }),
];

// Only fetch from Source1 and Source3
const result = await fetcher.fetchFromSources(
  allSources,
  ['Source1', 'Source3']
);
```

## Performance Optimization

### Parallel vs Sequential

The orchestrator executes all fetches in parallel using `Promise.all()`:

```typescript
// ✅ Parallel (Fast) - Takes ~200ms for 3 sources
const result = await fetcher.fetchAll([source1, source2, source3]);

// ❌ Sequential (Slow) - Takes ~600ms for 3 sources
const results = [];
results.push(await source1.fetchArticles());
results.push(await source2.fetchArticles());
results.push(await source3.fetchArticles());
```

### Performance Benefits

With 3 sources that each take 200ms:
- **Sequential**: 600ms total (200ms × 3)
- **Parallel**: ~200ms total (max of all durations)
- **Speedup**: 3x faster

### Timeout Strategy

Set appropriate timeouts to prevent slow sources from blocking:

```typescript
const result = await fetcher.fetchAll(sources, {
  timeout: 10000, // Global timeout
});

// Individual source timeouts
const source = new RSSSource({
  name: 'SlowSource',
  url: '...',
  type: 'rss',
  enabled: true,
  timeout: 5000, // Source-specific timeout
});
```

## Error Handling

### Graceful Degradation

The orchestrator is designed to handle partial failures gracefully:

```typescript
const result = await fetcher.fetchAll(sources, {
  continueOnError: true,
});

// Check results
console.log(`Successful: ${result.summary.successfulSources}`);
console.log(`Failed: ${result.summary.failedSources}`);

// Access error details
result.results.forEach(sourceResult => {
  if (!sourceResult.success) {
    console.error(`${sourceResult.source} failed:`, sourceResult.error?.message);
  }
});
```

### Error Types

Sources can fail for various reasons:
- Network timeout
- Invalid URL
- Parse errors
- Rate limiting
- Authentication errors

All errors are captured in the `SourceResult`:

```typescript
interface SourceResult {
  source: string;
  success: boolean;
  articleCount: number;
  duration: number;
  error?: {
    message: string;
    code?: string;
  };
  fetchedAt: Date;
}
```

## Deduplication

Articles are automatically deduplicated by URL:

```typescript
const result = await fetcher.fetchAll(sources);

// If source1 returns article A and source2 also returns article A,
// result.articles will only contain article A once
console.log(`Unique articles: ${result.articles.length}`);
```

## Performance Metrics

Track source health over time:

```typescript
const fetcher = new MultiSourceFetcher();

// Perform multiple fetches
for (let i = 0; i < 10; i++) {
  await fetcher.fetchAll(sources);
}

// Analyze metrics
const metrics = fetcher.getPerformanceMetrics();

// Find unreliable sources
const unreliable = metrics.filter(m => m.successRate < 0.9);
console.log('Unreliable sources:', unreliable);

// Find slow sources
const slow = metrics.filter(m => m.averageDuration > 5000);
console.log('Slow sources:', slow);

// Find low-value sources
const lowValue = metrics.filter(m => m.averageArticleCount < 2);
console.log('Low-value sources:', lowValue);
```

## Best Practices

1. **Set Appropriate Timeouts**: Don't wait forever for slow sources
   ```typescript
   await fetcher.fetchAll(sources, { timeout: 10000 });
   ```

2. **Enable Error Resilience**: Don't let one source failure break everything
   ```typescript
   await fetcher.fetchAll(sources, { continueOnError: true });
   ```

3. **Monitor Performance**: Track metrics to identify problematic sources
   ```typescript
   const metrics = fetcher.getPerformanceMetrics();
   ```

4. **Limit Articles**: Prevent slow sources from returning too many articles
   ```typescript
   const source = new RSSSource({
     name: 'BigSource',
     url: '...',
     type: 'rss',
     enabled: true,
     maxArticles: 20,
   });
   ```

5. **Filter Disabled Sources**: Sources are automatically filtered if `enabled: false`
   ```typescript
   const source = new RSSSource({
     name: 'DisabledSource',
     url: '...',
     type: 'rss',
     enabled: false, // Will be skipped
   });
   ```

## Testing

The orchestrator includes comprehensive tests covering:

- Basic multi-source fetching
- Parallel execution performance
- Error resilience
- Timeout handling
- Result aggregation
- Deduplication
- Performance metrics
- Source selection
- Edge cases

Run tests:
```bash
npm test -- multi-source-fetcher
```

## Architecture

Based on the orchestration patterns from [b0t](https://github.com/KenKaiii/b0t), the orchestrator:

1. **Accepts** an array of `BaseSource` instances
2. **Filters** to only enabled sources
3. **Executes** fetches in parallel using `Promise.all()`
4. **Handles** errors gracefully (continue on failure)
5. **Combines** results into a single result set
6. **Deduplicates** articles by URL
7. **Tracks** performance metrics
8. **Returns** aggregated results with detailed metadata

## Related Modules

- **BaseSource**: Abstract base class all sources extend
- **RSSSource**: RSS feed source implementation
- **RedditSource**: Reddit subreddit source
- **HackerNewsSource**: Hacker News source

## License

MIT
