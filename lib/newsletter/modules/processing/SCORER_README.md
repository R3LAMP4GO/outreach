# Multi-Factor Content Scoring System

A sophisticated article scoring algorithm that ranks content by quality and relevance using six weighted factors.

## Overview

The `ArticleScorer` evaluates articles across multiple dimensions to select the highest-quality content for newsletter curation. It processes 100+ articles in under 2 seconds with configurable weights for different use cases.

## Scoring Factors

### 1. Recency (15% default weight)
- Exponential decay based on publish date
- Articles lose 50% score every 7 days (configurable)
- Formula: `score = e^(-ln(2) * days / halfLife)`

### 2. Engagement (25% default weight)
- Normalized by source type (Reddit: 100, HN: 50, Other: 10)
- Weighted metrics:
  - Upvotes: 40%
  - Comments: 30%
  - Shares: 20%
  - Views: 10%

### 3. Readability (15% default weight)
- Flesch Reading Ease formula
- Target: 60-70 (Plain English)
- Penalizes overly complex or overly simple content

### 4. Relevance (25% default weight)
- Keyword matching (60 business-focused keywords)
- Topic classification
- Weighted: 60% keywords + 40% topic

### 5. Authority (10% default weight)
- Source reputation (HBR: 1.0, Reddit: 0.65, Unknown: 0.30)
- Author credibility boost
- Weighted: 70% source + 30% author

### 6. Uniqueness (10% default weight)
- Jaccard similarity to recent articles
- 80% penalty for duplicate content
- Ensures content diversity

## Usage

### Basic Usage

```typescript
import { ArticleScorer } from '@/lib/newsletter/modules/processing';

const scorer = new ArticleScorer();

// Score a single article
const scoredArticle = scorer.scoreArticle(article);
console.log(scoredArticle.scores);
// {
//   recency: 0.95,
//   engagement: 0.82,
//   readability: 0.71,
//   relevance: 0.88,
//   authority: 0.90,
//   uniqueness: 1.0,
//   final: 0.86
// }

// Score and sort multiple articles
const scoredArticles = await scorer.scoreArticles(articles);

// Get top 15 articles
const top15 = await scorer.getTopArticles(articles, 15);
```

### Custom Weights

```typescript
const customScorer = new ArticleScorer({
  weights: {
    recency: 0.20,      // Increase for trending content
    engagement: 0.30,   // Increase for viral content
    readability: 0.10,  // Decrease for technical audiences
    relevance: 0.25,
    authority: 0.10,
    uniqueness: 0.05,   // Decrease if duplicates OK
  },
});
```

### Preset Configurations

#### Business-Focused Scorer
Optimized for business owner newsletters:
```typescript
import { createBusinessScorer } from '@/lib/newsletter/modules/processing';

const businessScorer = createBusinessScorer(recentArticles);
// Weights: relevance 30%, authority 15%, engagement 20%
```

#### Viral-Focused Scorer
Optimized for trending/viral content:
```typescript
import { createViralScorer } from '@/lib/newsletter/modules/processing';

const viralScorer = createViralScorer();
// Weights: engagement 40%, recency 20%
// Half-life: 3 days (faster decay)
```

### Custom Configuration

```typescript
const scorer = new ArticleScorer({
  // Recency settings
  recencyHalfLife: 5, // Days until 50% score

  // Engagement baselines
  engagementBaselines: {
    reddit: 150,      // Higher baseline = stricter scoring
    hackernews: 75,
    default: 20,
  },

  // Readability targets
  readabilityTarget: {
    minFlesch: 40,  // Minimum acceptable
    maxFlesch: 80,  // Maximum acceptable
  },

  // Custom keywords
  relevanceKeywords: [
    'AI', 'machine learning', 'automation',
    'productivity', 'efficiency',
  ],

  // Custom authority map
  authorityMap: {
    'my-premium-source': 0.95,
    'trusted-blog': 0.80,
  },

  // Recent articles for uniqueness
  recentArticles: lastWeekArticles,
});
```

## Performance

The scorer is optimized for production use:

- **Speed**: 12,500+ articles/second
- **100 articles**: < 8ms
- **500 articles**: < 27ms
- **Memory**: O(n) where n = number of articles

Performance metrics are logged with each batch:
```javascript
Scoring metrics: {
  totalArticles: 150,
  duration: 12,
  articlesPerSecond: 12500,
  averageScore: 0.68,
  scoreDistribution: {
    excellent: 0,   // 0.8-1.0
    good: 148,      // 0.6-0.8
    average: 2,     // 0.4-0.6
    below: 0        // 0.0-0.4
  }
}
```

## Integration Example

Complete workflow for newsletter curation:

```typescript
import {
  ArticleScorer,
  createBusinessScorer,
} from '@/lib/newsletter/modules/processing';

// Fetch articles from sources
const articles = await fetchArticlesFromSources();

// Load recent newsletter editions
const recentEditions = await getRecentNewsletters(7); // Last week
const recentArticles = recentEditions.flatMap(e => e.articles);

// Create scorer with context
const scorer = createBusinessScorer(recentArticles);

// Score and select top articles
const scored = await scorer.scoreArticles(articles);
const top15 = scored.slice(0, 15);

// Verify quality threshold
const qualityThreshold = 0.6;
const highQuality = top15.filter(a => (a.scores?.final ?? 0) >= qualityThreshold);

if (highQuality.length < 10) {
  console.warn('Insufficient high-quality articles:', highQuality.length);
}

// Use selected articles
await generateNewsletter(highQuality);
```

## Scoring Algorithm Details

### Recency Score
```typescript
// Exponential decay: 50% score every 7 days
const daysSincePublished = (now - publishedAt) / (1000 * 60 * 60 * 24);
const score = Math.exp((-Math.LN2 * daysSincePublished) / halfLife);
```

### Engagement Score
```typescript
// Normalize by source baseline
const baseline = engagementBaselines[source] || 10;
const upvoteScore = Math.min(1.0, upvotes / baseline);
const commentScore = Math.min(1.0, comments / (baseline * 0.2));
const shareScore = Math.min(1.0, shares / (baseline * 0.1));
const viewScore = Math.min(1.0, views / (baseline * 10));

// Weighted average
const score =
  upvoteScore * 0.4 +
  commentScore * 0.3 +
  shareScore * 0.2 +
  viewScore * 0.1;
```

### Readability Score
```typescript
// Flesch Reading Ease
const avgWordsPerSentence = totalWords / totalSentences;
const avgSyllablesPerWord = totalSyllables / totalWords;
const flesch = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;

// Map to 0-1 range (30-70 target)
const score = (flesch - 30) / 40;
```

### Relevance Score
```typescript
// Count keyword matches
const keywordMatches = relevanceKeywords.filter(k =>
  text.toLowerCase().includes(k.toLowerCase())
).length;

// Normalize with diminishing returns
const keywordScore = Math.min(1.0, Math.sqrt(keywordMatches / 10));

// Topic classification
const topicScore = hasBusinessTopic(title) ? 0.8 : 0.4;

// Weighted combination
const score = keywordScore * 0.6 + topicScore * 0.4;
```

### Authority Score
```typescript
// Source reputation lookup
const sourceType = extractSourceType(article.source);
const sourceScore = authorityMap[sourceType] || 0.5;

// Author credibility
const authorScore = article.author ? 0.7 : 0.5;

// Weighted combination
const score = sourceScore * 0.7 + authorScore * 0.3;
```

### Uniqueness Score
```typescript
// Jaccard similarity to recent articles
const similarity = calculateJaccardSimilarity(article, recentArticles);

// Penalize duplicates (80% penalty)
const score = 1.0 - similarity * 0.8;
```

### Final Score
```typescript
const finalScore =
  recency * 0.15 +
  engagement * 0.25 +
  readability * 0.15 +
  relevance * 0.25 +
  authority * 0.10 +
  uniqueness * 0.10;
```

## Edge Cases

The scorer handles various edge cases gracefully:

| Case | Behavior |
|------|----------|
| Missing content | Returns 0.5 (neutral) for readability |
| No engagement data | Returns 0.5 (neutral) for engagement |
| Future publish date | Scores as 1.0 (most recent) |
| Zero engagement | Scores < 0.3 (low quality) |
| Very old articles (2+ weeks) | Recency < 0.25 |
| Extreme engagement (10k+ upvotes) | Caps at 1.0 |
| Empty/whitespace content | Returns 0.5 (neutral) |

## Configuration Best Practices

### For Newsletter Curation
```typescript
{
  recency: 0.15,      // Moderate - want recent but not just today
  engagement: 0.25,   // High - social proof important
  readability: 0.15,  // Moderate - accessible but not dumbed down
  relevance: 0.25,    // High - must match audience interests
  authority: 0.10,    // Low - content quality > source brand
  uniqueness: 0.10,   // Low - OK to cover similar topics differently
}
```

### For Trending/Viral Content
```typescript
{
  recency: 0.25,      // Very high - must be current
  engagement: 0.40,   // Very high - viral = high engagement
  readability: 0.05,  // Very low - viral can be complex
  relevance: 0.15,    // Moderate - broader topics OK
  authority: 0.05,    // Very low - any source can go viral
  uniqueness: 0.10,   // Low - trending topics repeat
  recencyHalfLife: 2, // Very fast decay (2 days)
}
```

### For Technical/Expert Content
```typescript
{
  recency: 0.10,      // Low - timeless content valued
  engagement: 0.15,   // Low - expert content has lower engagement
  readability: 0.05,  // Very low - technical jargon expected
  relevance: 0.35,    // Very high - must be highly relevant
  authority: 0.25,    // Very high - expertise critical
  uniqueness: 0.10,   // Low - deep dives on same topics OK
}
```

## Testing

The scorer includes comprehensive tests:

```bash
npm test -- scorer.test.ts
```

Test coverage:
- 45 tests across 8 suites
- Individual factor tests (recency, engagement, readability, etc.)
- Weighted aggregation tests
- Edge case handling
- Performance benchmarks
- Quality validation
- Integration scenarios

## API Reference

### ArticleScorer

#### Constructor
```typescript
constructor(config?: ScorerConfig)
```

#### Methods

##### scoreArticle()
```typescript
scoreArticle(article: Article): Article
```
Scores a single article and returns it with populated `scores` field.

##### scoreArticles()
```typescript
async scoreArticles(articles: Article[]): Promise<Article[]>
```
Scores multiple articles, sorts by final score (descending), and logs metrics.

##### getTopArticles()
```typescript
async getTopArticles(articles: Article[], count: number = 15): Promise<Article[]>
```
Convenience method to score and return top N articles.

##### getConfig()
```typescript
getConfig(): {
  weights: ScoringWeights;
  recencyHalfLife: number;
  engagementBaselines: typeof DEFAULT_ENGAGEMENT_BASELINES;
  readabilityTarget: { minFlesch: number; maxFlesch: number };
}
```
Returns current configuration.

### Types

```typescript
interface ScoringWeights {
  recency: number;      // 0.15 default
  engagement: number;   // 0.25 default
  readability: number;  // 0.15 default
  relevance: number;    // 0.25 default
  authority: number;    // 0.10 default
  uniqueness: number;   // 0.10 default
}

interface ScorerConfig {
  weights?: Partial<ScoringWeights>;
  recencyHalfLife?: number;
  engagementBaselines?: {
    reddit?: number;
    hackernews?: number;
    default?: number;
  };
  readabilityTarget?: {
    minFlesch: number;
    maxFlesch: number;
  };
  relevanceKeywords?: string[];
  authorityMap?: Record<string, number>;
  recentArticles?: Article[];
}

interface ScorerMetrics {
  totalArticles: number;
  duration: number;
  articlesPerSecond: number;
  averageScore: number;
  scoreDistribution: {
    excellent: number;
    good: number;
    average: number;
    below: number;
  };
}
```

## Future Enhancements

Potential improvements for future versions:

1. **ML-Based Scoring**: Train models on historical newsletter performance
2. **Semantic Analysis**: Use embeddings for better relevance/uniqueness
3. **User Feedback Loop**: Adjust weights based on open rates and clicks
4. **A/B Testing**: Built-in experimentation framework for weight optimization
5. **Content Type Detection**: Adjust scoring for tutorials vs. news vs. opinion
6. **Audience Segmentation**: Different scorers for different reader segments
7. **Time-Based Weighting**: Different weights for different days/times
8. **Source Learning**: Dynamically adjust authority scores based on performance

## Contributing

When modifying the scorer:

1. Ensure all tests pass: `npm test -- scorer.test.ts`
2. Add tests for new features
3. Document configuration changes
4. Update this README
5. Benchmark performance changes

## License

MIT
