# Article Filter Example Usage

The `ArticleFilter` module removes low-quality and inappropriate articles from the curation pipeline.

## Quick Start

```typescript
import { ArticleFilter } from '@/lib/newsletter/modules/processing';
import { Article } from '@/lib/newsletter/types';

// Create filter with default configuration
const filter = new ArticleFilter();

// Or customize thresholds
const customFilter = new ArticleFilter({
  minScore: 0.7,              // Higher quality threshold
  minWords: 300,              // Longer articles only
  maxWords: 3000,             // Exclude very long articles
  maxArticlesPerDomain: 2,    // Maximum 2 articles from same domain
  filterPromotional: true,    // Remove promotional content
  filterClickbait: true,      // Remove clickbait titles
  filterSpam: true,           // Remove spam and press releases
});

// Filter articles
const result = await filter.filterArticles(scoredArticles);

console.log(`✓ Passed: ${result.passed.length} articles`);
console.log(`✗ Rejected: ${result.rejected.length} articles`);
console.log(`⚡ Processing time: ${result.stats.processingTimeMs}ms`);
console.log(`📊 Rejection reasons:`, result.stats.rejectionReasons);
```

## Filter Configuration

### Score Threshold
```typescript
const filter = new ArticleFilter({
  minScore: 0.6  // Default: 0.6 (range 0-1)
});
```

Rejects articles with `article.scores.final < minScore`.

### Content Length
```typescript
const filter = new ArticleFilter({
  minWords: 200,   // Default: 200
  maxWords: 5000,  // Default: 5000
});
```

Rejects articles that are too short or too long.

### Promotional Content Detection
```typescript
const filter = new ArticleFilter({
  filterPromotional: true,  // Default: true
  promotionalKeywords: [
    'buy now',
    'limited offer',
    'discount code',
    'affiliate',
    // ... customize as needed
  ],
});
```

Detects:
- Promotional keywords
- Excessive capitalization (>30% caps in title)
- Too many links (>5 per 100 words)

### Clickbait Detection
```typescript
const filter = new ArticleFilter({
  filterClickbait: true,  // Default: true
});
```

Detects:
- Excessive punctuation (!!!, ???)
- All-caps words in title
- Clickbait phrases ("you won't believe", "shocking", "one weird trick")

### Spam & Low-Value Content
```typescript
const filter = new ArticleFilter({
  filterSpam: true,              // Default: true
  maxLinksPerHundredWords: 5,    // Default: 5
});
```

Detects:
- Thin content (high link-to-text ratio)
- Press releases
- Self-promotional content

### Readability
```typescript
const filter = new ArticleFilter({
  minReadability: 30,  // Default: 30 (Flesch reading ease scale)
});
```

Requires `article.scores.readability` to be calculated first.

### Domain Diversity
```typescript
const filter = new ArticleFilter({
  maxArticlesPerDomain: 3,  // Default: 3
});
```

Limits how many articles can come from the same domain to ensure variety.

### Custom Keywords
```typescript
const filter = new ArticleFilter({
  rejectKeywords: ['cryptocurrency', 'bitcoin', 'NFT'],
});
```

Reject articles containing specific keywords (case-insensitive).

## Composable Filters

Use individual filter methods for custom filtering logic:

```typescript
const filter = new ArticleFilter();

for (const article of articles) {
  // Check specific filters
  const scoreCheck = await filter.checkScore(article);
  const lengthCheck = await filter.checkContentLength(article);
  const promoCheck = await filter.checkPromotional(article);

  if (!scoreCheck.passed) {
    console.log(`Rejected: ${scoreCheck.reason}`);
  }
}
```

## Filter Result

```typescript
interface FilterResult {
  passed: Article[];           // Articles that passed all filters
  rejected: RejectionReason[]; // Articles that were filtered out
  stats: {
    total: number;
    passed: number;
    rejected: number;
    processingTimeMs: number;
    rejectionReasons: Record<string, number>; // Reason counts
  };
}

interface RejectionReason {
  articleId: string;
  title: string;
  reasons: string[];  // Detailed rejection reasons
  score?: number;     // Original quality score
}
```

## Performance

The filter is optimized for batch processing:

```typescript
// Filters 250 articles in < 1 second
const articles = Array.from({ length: 250 }, () => createArticle());
const result = await filter.filterArticles(articles);

console.log(`Processed ${result.stats.total} articles in ${result.stats.processingTimeMs}ms`);
// Output: Processed 250 articles in 45ms
```

## Common Patterns

### Newsletter Curation Pipeline

```typescript
import { ArticleScorer, ArticleFilter } from '@/lib/newsletter/modules/processing';

// 1. Fetch articles from sources
const rawArticles = await fetchArticles();

// 2. Score articles
const scorer = new ArticleScorer();
const scored = await scorer.scoreArticles(rawArticles);

// 3. Filter low-quality content
const filter = new ArticleFilter({
  minScore: 0.6,
  minWords: 200,
  maxArticlesPerDomain: 3,
});
const filtered = await filter.filterArticles(scored);

// 4. Use top articles in newsletter
const topArticles = filtered.passed.slice(0, 10);
```

### Custom Filter Logic

```typescript
const filter = new ArticleFilter({
  // Disable built-in filters
  filterPromotional: false,
  filterClickbait: false,
  filterSpam: false,
});

// Apply only score and length filters
const result = await filter.filterArticles(articles);

// Then apply custom business logic
const finalArticles = result.passed.filter(article => {
  return article.author !== 'Anonymous' &&
         article.engagement.upvotes > 50;
});
```

### Adjust Filters Dynamically

```typescript
const filter = new ArticleFilter();

// Update configuration at runtime
filter.updateConfig({
  minScore: 0.8,  // Increase quality threshold
  maxArticlesPerDomain: 5,  // Allow more variety
});

const result = await filter.filterArticles(articles);
```

## Debugging Rejected Articles

```typescript
const result = await filter.filterArticles(articles);

// Log rejection details
for (const rejected of result.rejected) {
  console.log(`\n❌ ${rejected.title}`);
  console.log(`   Score: ${rejected.score?.toFixed(2)}`);
  console.log(`   Reasons:`);
  for (const reason of rejected.reasons) {
    console.log(`   - ${reason}`);
  }
}

// Analyze rejection patterns
console.log('\n📊 Rejection Breakdown:');
for (const [reason, count] of Object.entries(result.stats.rejectionReasons)) {
  console.log(`   ${reason}: ${count}`);
}
```

## Best Practices

1. **Start with default configuration** and adjust based on results
2. **Monitor rejection reasons** to tune thresholds
3. **Balance quality vs quantity** - stricter filters = fewer articles
4. **Domain diversity** prevents newsletter from being dominated by single source
5. **Combine with scoring** for best results - filter after scoring
6. **Test with real data** - thresholds vary by content type and audience

## Integration Example

Complete end-to-end newsletter pipeline:

```typescript
import {
  ArticleScorer,
  ArticleFilter,
  ArticleSummarizer,
} from '@/lib/newsletter/modules/processing';

async function createNewsletter() {
  // 1. Fetch from sources
  const articles = await fetchArticles();
  console.log(`Fetched ${articles.length} articles`);

  // 2. Score articles
  const scorer = new ArticleScorer();
  const scored = await scorer.scoreArticles(articles);
  console.log(`Scored ${scored.length} articles`);

  // 3. Filter low-quality content
  const filter = new ArticleFilter({
    minScore: 0.6,
    minWords: 200,
    maxArticlesPerDomain: 3,
  });
  const filtered = await filter.filterArticles(scored);
  console.log(`${filtered.passed.length} articles passed filters`);
  console.log(`Rejected ${filtered.rejected.length} for:`, filtered.stats.rejectionReasons);

  // 4. Summarize top articles
  const summarizer = new ArticleSummarizer();
  const top10 = filtered.passed.slice(0, 10);
  const summarized = await summarizer.summarizeBatch(top10);
  console.log(`Summarized ${summarized.successful.length} articles`);

  return summarized.successful;
}
```
