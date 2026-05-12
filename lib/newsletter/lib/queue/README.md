**# BullMQ Queue System for Newsletter Automation

A production-ready job queue system built on BullMQ for the newsletter automation pipeline. Provides resilience, scalability, and job persistence with comprehensive monitoring.

## Features

- **Persistent Jobs**: Jobs survive server restarts and failures
- **Automatic Retries**: 3 retry attempts with exponential backoff (2s, 4s, 8s)
- **Progress Tracking**: Real-time progress updates for all jobs
- **Dead Letter Queue**: Failed jobs are preserved for analysis
- **Configurable Concurrency**: Process up to 20 jobs concurrently
- **Rate Limiting**: Prevent API overload with configurable limits
- **Monitoring**: Comprehensive tools for queue health and job inspection
- **Type Safety**: Full TypeScript support with type-safe job data

## Architecture

```
┌─────────────────┐
│   API/Client    │ ← Enqueues jobs
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Redis Queue    │ ← Stores jobs persistently
└────────┬────────┘
         │
         v
┌─────────────────┐
│     Worker      │ ← Processes jobs (can scale horizontally)
└────────┬────────┘
         │
         v
┌─────────────────┐
│   Processors    │ ← Job-specific logic (curate, generate, publish, etc.)
└─────────────────┘
```

## Job Types

### 1. **CURATE** - Content Curation
Fetches, deduplicates, scores, and filters articles from multiple sources.

**Input:**
- `campaignId`: Unique campaign identifier
- `sources`: Array of source names (e.g., ['rss', 'reddit', 'hackernews'])
- `maxArticles`: Maximum number of articles to return (default: 15)
- `userId`: Optional user identifier

**Output:**
- `articles`: Array of top-scored articles
- `totalFetched`: Total articles fetched
- `totalFiltered`: Articles after filtering
- `duration`: Processing time in milliseconds

### 2. **GENERATE** - Newsletter Generation
Creates HTML and text newsletter from curated articles.

**Input:**
- `campaignId`: Campaign identifier
- `articles`: Array of article data
- `templateId`: Optional template override
- `userId`: Optional user identifier

**Output:**
- `newsletterId`: Generated newsletter ID
- `html`: HTML email content
- `text`: Plain text version
- `subjectLines`: Array of subject line variations
- `duration`: Generation time

### 3. **PUBLISH** - Email Publishing
Sends newsletter to subscribers in batches.

**Input:**
- `campaignId`: Campaign identifier
- `newsletterId`: Newsletter to send
- `subscriberIds`: Optional specific subscribers (for testing)
- `batchSize`: Batch size for sending (default: 100)
- `userId`: Optional user identifier

**Output:**
- `sent`: Number of emails sent successfully
- `failed`: Number of failed sends
- `duration`: Total send time
- `errors`: Array of error details (if any)

### 4. **SCHEDULE** - Scheduled Newsletter
Orchestrates the full newsletter pipeline at a scheduled time.

**Input:**
- `campaignId`: Campaign identifier
- `scheduledFor`: Target send time
- `sources`: Content sources
- `maxArticles`: Max articles to include
- `templateId`: Optional template
- `userId`: Optional user identifier

**Output:**
- `scheduledJobId`: Job ID for tracking
- `scheduledFor`: Scheduled execution time

### 5. **CLEANUP** - Data Cleanup
Archives old articles, newsletters, and events.

**Input:**
- `olderThan`: Date threshold
- `types`: Array of types to clean ['articles', 'newsletters', 'events']

**Output:**
- `deleted`: Object with counts per type
- `duration`: Cleanup time

## Quick Start

### 1. Install Dependencies

```bash
pnpm add bullmq ioredis
```

### 2. Set Environment Variables

```env
# Local Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# OR Upstash Cloud
UPSTASH_REDIS_URL=https://your-instance.upstash.io
UPSTASH_REDIS_TOKEN=your-token

# OR Redis URL
REDIS_URL=redis://localhost:6379
```

### 3. Initialize Queue and Worker

```typescript
import { newsletterQueue, createNewsletterWorker } from '@/lib/queue';

// Initialize the queue
await newsletterQueue.initialize();

// Start a worker (in separate process or thread)
const worker = await createNewsletterWorker({
  concurrency: 20,
  name: 'newsletter-worker-1',
});
```

### 4. Enqueue Jobs

```typescript
// Curate articles
const curateJob = await newsletterQueue.addCurateJob({
  campaignId: 'campaign_123',
  sources: ['rss', 'reddit', 'hackernews'],
  maxArticles: 15,
});

// Monitor progress
curateJob.on('progress', (progress) => {
  console.log(`Progress: ${progress}%`);
});

// Wait for completion
const result = await curateJob.waitUntilFinished();
console.log(`Curated ${result.articles.length} articles`);
```

## Usage Examples

### Basic Workflow: Manual Newsletter

```typescript
import { newsletterQueue } from '@/lib/queue';

// 1. Curate content
const curateJob = await newsletterQueue.addCurateJob({
  campaignId: 'manual_001',
  sources: ['rss', 'reddit'],
  maxArticles: 15,
});

const { articles } = await curateJob.waitUntilFinished();

// 2. Generate newsletter
const generateJob = await newsletterQueue.addGenerateJob({
  campaignId: 'manual_001',
  articles,
});

const { newsletterId, html } = await generateJob.waitUntilFinished();

// 3. Publish newsletter
const publishJob = await newsletterQueue.addPublishJob({
  campaignId: 'manual_001',
  newsletterId,
});

const { sent, failed } = await publishJob.waitUntilFinished();
console.log(`Sent to ${sent} subscribers, ${failed} failed`);
```

### Scheduled Newsletter

```typescript
import { newsletterQueue } from '@/lib/queue';

// Schedule newsletter for tomorrow at 9 AM
const tomorrow9am = new Date();
tomorrow9am.setDate(tomorrow9am.getDate() + 1);
tomorrow9am.setHours(9, 0, 0, 0);

const scheduleJob = await newsletterQueue.addScheduleJob({
  campaignId: 'weekly_001',
  scheduledFor: tomorrow9am,
  sources: ['rss', 'reddit', 'hackernews'],
  maxArticles: 15,
});

console.log(`Newsletter scheduled for ${tomorrow9am}`);
```

### Monitoring Queue Health

```typescript
import { getQueueHealth, getQueueStats } from '@/lib/queue';

// Get queue statistics
const stats = await getQueueStats();
console.log(`Active: ${stats.active}, Waiting: ${stats.waiting}`);

// Check queue health
const health = await getQueueHealth();
if (!health.healthy) {
  console.error('Queue issues:', health.issues);
}
```

### Retrying Failed Jobs

```typescript
import { getFailedJobs, retryJob, retryAllFailedJobs } from '@/lib/queue';

// Get failed jobs
const failedJobs = await getFailedJobs(0, 10);

// Retry specific job
await retryJob(failedJobs[0].id);

// Retry all failed jobs
const retriedCount = await retryAllFailedJobs();
console.log(`Retried ${retriedCount} jobs`);
```

## API Endpoint Integration

### Example: Express/Next.js API Route

```typescript
// POST /api/newsletter/curate
import { newsletterQueue } from '@/lib/newsletter/lib/queue';

export async function POST(req: Request) {
  const { campaignId, sources, maxArticles } = await req.json();

  // Enqueue job instead of direct execution
  const job = await newsletterQueue.addCurateJob({
    campaignId,
    sources,
    maxArticles,
  });

  return Response.json({
    jobId: job.id,
    status: 'queued',
    message: 'Curation job started',
  });
}

// GET /api/newsletter/status/:jobId
export async function GET(req: Request, { params }: { params: { jobId: string } }) {
  const { jobId } = params;

  const jobDetails = await getJobDetails(jobId);

  if (!jobDetails) {
    return Response.json({ error: 'Job not found' }, { status: 404 });
  }

  return Response.json({
    id: jobDetails.id,
    status: jobDetails.finishedOn ? 'completed' : 'processing',
    progress: jobDetails.progress,
    result: jobDetails.returnvalue,
    logs: jobDetails.logs,
  });
}
```

## Worker Deployment

### Standalone Worker Process

```typescript
// worker.ts
import { createNewsletterWorker, closeRedisConnections } from '@/lib/queue';
import { logger } from '@/lib/logger';

async function startWorker() {
  try {
    logger.info('Starting newsletter worker...');

    const worker = await createNewsletterWorker({
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '20'),
      name: `worker-${process.pid}`,
    });

    logger.info('Worker started successfully');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      await worker.stop();
      await closeRedisConnections();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully...');
      await worker.stop();
      await closeRedisConnections();
      process.exit(0);
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start worker');
    process.exit(1);
  }
}

startWorker();
```

### Run Worker

```bash
# Development
tsx worker.ts

# Production (with PM2)
pm2 start worker.ts --name newsletter-worker --instances 4

# Production (with Docker)
docker run -d \
  -e REDIS_URL=redis://redis:6379 \
  -e WORKER_CONCURRENCY=20 \
  newsletter-worker
```

## Configuration

### Queue Options

```typescript
import { QUEUE_CONFIGS } from '@/lib/queue';

// Default retry policy
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000  // 2s, 4s, 8s
  }
}

// Job cleanup
{
  removeOnComplete: {
    age: 24 * 60 * 60,  // 24 hours
    count: 1000
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60,  // 7 days
    count: 5000
  }
}
```

### Worker Options

```typescript
import { WORKER_CONFIGS } from '@/lib/queue';

// Default worker configuration
{
  concurrency: 20,  // Process 20 jobs concurrently
  limiter: {
    max: 600,       // Max 600 jobs per minute
    duration: 60000 // Rate limit window
  }
}
```

## Monitoring & Observability

### Queue Dashboard

Use Bull Board for visual monitoring:

```typescript
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { newsletterQueue } from '@/lib/queue';

const serverAdapter = new ExpressAdapter();

createBullBoard({
  queues: [new BullMQAdapter(newsletterQueue.getQueue())],
  serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());
// Visit: http://localhost:3000/admin/queues
```

### Health Checks

```typescript
import { getQueueHealth } from '@/lib/queue';

app.get('/health/queue', async (req, res) => {
  const health = await getQueueHealth();

  res.status(health.healthy ? 200 : 503).json(health);
});
```

## Best Practices

1. **Idempotency**: Ensure jobs can be retried safely
2. **Progress Tracking**: Update progress regularly for long-running jobs
3. **Error Handling**: Throw errors to trigger retries, return errors to mark as complete
4. **Logging**: Use structured logging with job context
5. **Monitoring**: Set up alerts for failed jobs and queue backlog
6. **Cleanup**: Regularly clean old completed/failed jobs
7. **Scaling**: Scale workers horizontally by running multiple instances

## Troubleshooting

### Jobs not processing
- Check if worker is running: `getQueueStats()`
- Verify Redis connection
- Check worker logs for errors

### High failure rate
- Review job logs: `getJobDetails(jobId)`
- Check external API rate limits
- Verify environment configuration

### Queue backlog
- Increase worker concurrency
- Scale workers horizontally
- Optimize job processors

## Testing

Run tests:
```bash
pnpm test src/lib/queue
```

See test files in `__tests__/` directory for examples.

## References

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Redis Documentation](https://redis.io/docs/)
- [b0t Framework](https://github.com/KenKaiii/b0t) - Reference implementation

## License

MIT
