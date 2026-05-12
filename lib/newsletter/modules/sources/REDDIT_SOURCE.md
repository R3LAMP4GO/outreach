# Reddit Source Integration

The Reddit source module fetches top posts from specified subreddits using the Reddit JSON API. It includes robust rate limiting, content filtering, and engagement metrics.

## Features

### Core Functionality
- **Multiple Subreddit Support**: Fetch from multiple subreddits in a single source
- **Rate Limiting**: Respects Reddit's API limits (300 requests/15 min = 20/min)
- **Circuit Breaker**: Automatic failure protection via BaseSource
- **Retry Logic**: Exponential backoff for transient errors
- **Content Filtering**: Remove spam, NSFW, and low-quality posts

### Data Mapping
Reddit posts are mapped to the `Article` type with:
- **ID**: `reddit:{post_id}`
- **Title**: Post title (sanitized)
- **URL**: Reddit permalink for self posts, external URL for link posts
- **Content**: Post self-text for text posts, title for link posts
- **Author**: Reddit username
- **Published**: Post creation timestamp
- **Source**: `reddit:{subreddit}`
- **Engagement**: Upvotes, comments, and awards

### Built-in Filters
The Reddit source automatically filters out:
- Stickied posts (moderator announcements)
- Distinguished posts (moderator/admin posts)
- NSFW content
- Spam domains (YouTube, etc.)
- Posts below minimum upvote threshold
- Posts below minimum comment threshold

## Usage

### Basic Usage

```typescript
import { RedditSource } from '@/lib/newsletter/modules/sources';

const config = {
  name: 'Reddit Entrepreneur',
  url: 'https://www.reddit.com/r/Entrepreneur',
  type: 'reddit' as const,
  enabled: true,
  subreddits: ['Entrepreneur'],
  timeframe: 'week' as const,
  maxArticles: 25,
  minUpvotes: 50,
  minComments: 10,
  timeout: 15000,
  retryAttempts: 3,
};

const source = new RedditSource(config);
const result = await source.fetchArticles();

if (result.success) {
  console.log(`Fetched ${result.articles.length} articles`);
  result.articles.forEach(article => {
    console.log(`- ${article.title}`);
    console.log(`  Upvotes: ${article.engagement?.upvotes}`);
    console.log(`  Comments: ${article.engagement?.comments}`);
  });
}
```

### Multiple Subreddits

```typescript
const config = {
  name: 'Reddit Business',
  url: 'https://www.reddit.com/r/Entrepreneur',
  type: 'reddit' as const,
  enabled: true,
  subreddits: ['Entrepreneur', 'startups', 'SaaS', 'smallbusiness'],
  timeframe: 'week' as const,
  maxArticles: 50,
  minUpvotes: 40,
  minComments: 10,
  timeout: 20000,
  retryAttempts: 3,
};
```

### Using Pre-configured Sources

```typescript
import { DEFAULT_REDDIT_SOURCES, fetchMultipleRedditSources } from '@/lib/newsletter/modules/sources';

// Fetch all default Reddit sources
const results = await fetchMultipleRedditSources(DEFAULT_REDDIT_SOURCES);

// Process results
for (const [sourceName, articles] of results.entries()) {
  console.log(`${sourceName}: ${articles.length} articles`);
}
```

## Configuration

### RedditSourceConfig

Extends `SourceConfig` with Reddit-specific options:

```typescript
interface RedditSourceConfig extends SourceConfig {
  type: 'reddit';
  subreddits?: string[];     // List of subreddit names (without r/)
  timeframe?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  minUpvotes?: number;       // Filter posts below this threshold (default: 10)
  minComments?: number;      // Filter posts with fewer comments (default: 3)
}
```

### Default Pre-configured Sources

The module includes 5 pre-configured sources for business/entrepreneurship:

1. **Reddit Entrepreneur** - `r/Entrepreneur` with 50+ upvotes, 10+ comments
2. **Reddit Startups** - `r/startups` with 30+ upvotes, 5+ comments
3. **Reddit SaaS** - `r/SaaS` with 20+ upvotes, 5+ comments
4. **Reddit Small Business** - `r/smallbusiness` with 30+ upvotes, 8+ comments
5. **Reddit Business Multi-Source** - All 4 subreddits with 40+ upvotes, 10+ comments

## Rate Limiting

The Reddit source uses a dedicated rate limiter:

```typescript
export const redditRateLimiter = createRateLimiter({
  maxConcurrent: 2,                  // Allow 2 concurrent requests
  minTime: 4000,                     // Min 4 seconds between requests
  reservoir: 15,                     // 15 requests
  reservoirRefreshAmount: 15,        // Refill to 15
  reservoirRefreshInterval: 60 * 1000, // Per minute
  id: 'reddit-api',
});
```

This is conservative compared to Reddit's official limit (300/15min) to ensure reliability.

## Error Handling

The Reddit source handles various error scenarios:

### Network Errors
- **429 (Rate Limit)**: Waits for `retry-after` header value
- **404 (Not Found)**: Returns `INVALID_URL` error (subreddit doesn't exist)
- **Timeout**: Returns `TIMEOUT` error
- **Fetch Failures**: Returns `NETWORK_ERROR`

### Retry Strategy
- Retries on network errors with exponential backoff
- Does NOT retry on: 404 (invalid subreddit), authentication errors
- Default: 3 retry attempts with delays of 1s, 2s, 4s

### Graceful Degradation
When fetching multiple subreddits, if one fails:
- Logs the error
- Continues with other subreddits
- Returns successful results

## Data Structure

### Article Output

```typescript
{
  id: 'reddit:abc123',
  title: 'How I built a SaaS to $10k MRR',
  url: 'https://www.reddit.com/r/Entrepreneur/comments/abc123/...',
  content: 'This is my story about building...',
  author: 'entrepreneur_user',
  publishedAt: new Date('2024-01-15T10:30:00Z'),
  source: 'reddit:Entrepreneur',

  engagement: {
    upvotes: 250,
    comments: 45,
    shares: 5  // Awards used as proxy for shares
  },

  metadata: {
    subreddit: 'Entrepreneur',
    permalink: '/r/Entrepreneur/comments/abc123/how_i_built_a_saas/',
    domain: 'self.Entrepreneur',
    isTextPost: true,
    flair: 'Success Story',
    score: 245,
    imageUrl: 'https://preview.redd.it/...'
  },

  status: 'pending',
  createdAt: new Date(),
  updatedAt: new Date()
}
```

## Testing

### Unit Tests

Run the comprehensive test suite:

```bash
npm test reddit.test.ts
```

Tests cover:
- Basic fetching from single/multiple subreddits
- Content filtering (upvotes, comments, NSFW, spam)
- Error handling (rate limits, network errors, timeouts)
- Data mapping and sanitization
- Edge cases (empty subreddits, malformed data)

### Manual Testing

Use the manual test script to verify against live Reddit API:

```bash
npx tsx src/modules/sources/__tests__/reddit-manual-test.ts
```

## Best Practices

### Choosing Subreddits
- Focus on quality over quantity
- Use niche subreddits for targeted content
- Monitor subreddit rules to avoid breaking guidelines

### Setting Filters
- Higher `minUpvotes` for popular subreddits (50+)
- Lower `minUpvotes` for niche subreddits (10-20)
- Require `minComments` to ensure engagement

### Timeframe Selection
- **week**: Best for newsletters (most relevant)
- **day**: For daily digests
- **month**: For monthly roundups
- **all/year**: Avoid unless specifically needed

### Rate Limiting
- The default rate limiter is conservative
- Can increase limits if you have Reddit API credentials
- Monitor rate limit errors in logs

## Integration with Newsletter System

### Workflow Integration

```typescript
import { RedditSource, DEFAULT_REDDIT_SOURCES } from '@/lib/newsletter/modules/sources';
import { enrichArticles } from '@/lib/newsletter/modules/processing';
import { generateNewsletter } from '@/lib/newsletter/modules/generation';

// 1. Fetch from Reddit
const redditSource = new RedditSource(DEFAULT_REDDIT_SOURCES[4]); // Multi-source
const result = await redditSource.fetchArticles();

if (!result.success) {
  throw new Error(`Failed to fetch: ${result.error?.message}`);
}

// 2. Enrich with AI
const enriched = await enrichArticles(result.articles);

// 3. Generate newsletter
const newsletter = await generateNewsletter({
  articles: enriched,
  template: 'entrepreneurship',
});
```

### Database Integration

```typescript
import { supabase } from '@/lib/database';

// Store articles in database
const { data, error } = await supabase
  .from('articles')
  .insert(
    result.articles.map(article => ({
      id: article.id,
      title: article.title,
      url: article.url,
      content: article.content,
      author: article.author,
      published_at: article.publishedAt,
      source: article.source,
      engagement: article.engagement,
      metadata: article.metadata,
      status: article.status,
    }))
  );
```

## Troubleshooting

### Rate Limit Errors
- Check `retry-after` header in error logs
- Reduce `reservoir` in rate limiter config
- Increase `minTime` between requests

### Empty Results
- Check subreddit name spelling
- Verify `minUpvotes` and `minComments` aren't too high
- Try different `timeframe` (e.g., 'month' instead of 'day')

### Timeouts
- Increase `timeout` in config (default: 15000ms)
- Check network connectivity
- Verify Reddit API is accessible

### Content Quality Issues
- Increase `minUpvotes` threshold
- Add more spam domains to filter list
- Use `minComments` to ensure discussion

## API Reference

### RedditSource Class

```typescript
class RedditSource extends BaseSource {
  constructor(config: RedditSourceConfig);

  // Inherited from BaseSource
  public async fetchArticles(): Promise<FetchResult>;
  public getName(): string;
  public isEnabled(): boolean;
}
```

### Helper Functions

```typescript
// Fetch multiple Reddit sources in parallel
async function fetchMultipleRedditSources(
  configs: RedditSourceConfig[]
): Promise<Map<string, Article[]>>;
```

### Exports

```typescript
export { RedditSource, fetchMultipleRedditSources, redditRateLimiter, DEFAULT_REDDIT_SOURCES };
export type { RedditSourceConfig, RedditPost, RedditResponse };
```

## Future Enhancements

Potential improvements for future versions:

1. **OAuth Authentication**: Support authenticated requests for higher rate limits
2. **Comment Fetching**: Include top comments in article content
3. **User Filtering**: Filter by specific authors or user karma
4. **Flair Filtering**: Filter by post flair
5. **Crosspost Handling**: Detect and handle crossposts
6. **Media Support**: Better image/video extraction
7. **Hot/New/Rising**: Support for different sorting options
8. **Search Integration**: Fetch posts matching specific queries
9. **Award Weighting**: Use award types for better quality scoring
10. **Sentiment Analysis**: Filter by post sentiment

## License

MIT - See LICENSE file in repository root
