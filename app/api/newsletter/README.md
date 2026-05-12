# Newsletter API Documentation

Production-ready API endpoints for AI-powered newsletter generation, management, and delivery.

## Overview

The Newsletter API provides a complete workflow for:
1. Generating newsletters with AI-curated content from RSS feeds
2. Managing newsletter editions (CRUD operations)
3. Sending newsletters to verified subscribers
4. Previewing newsletter content with personalization

All endpoints require authentication and are restricted to admin users.

## Authentication

All endpoints require:
- Valid NextAuth session
- Admin or super_admin role
- Rate limiting applied per user

```typescript
// Headers
Authorization: Bearer <session-token>
```

## Endpoints

### 1. Generate Newsletter

Generate a new newsletter edition with AI-curated content.

**Endpoint:** `POST /api/newsletter/generate`

**Request Body:**
```typescript
{
  campaignId?: string;  // UUID of campaign (optional)
  manual?: boolean;     // Manual generation (default: false)
}
```

**Response:**
```typescript
{
  success: boolean;
  newsletterId: string;
  preview: {
    subject: string;
    html: string;
    articleCount: number;
  };
  metadata: {
    duration: number;
    generatedAt: string;
  };
}
```

**Rate Limit:** 5 requests per hour per user

**Workflow:**
1. Fetch articles from RSS feeds (last 24 hours)
2. Score and rank articles by recency, content quality, and engagement
3. Select top 15 articles
4. Summarize each article with Claude AI (psychology-optimized)
5. Generate newsletter HTML/text templates
6. Store in database with status 'draft'

**Example:**
```bash
curl -X POST https://coastalprograms.com/api/newsletter/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "manual": true
  }'
```

**Error Codes:**
- `401` - Authentication required
- `403` - Insufficient permissions
- `429` - Rate limit exceeded
- `400` - Invalid request body
- `500` - Generation failed

---

### 2. Get Newsletter

Retrieve a newsletter edition by ID.

**Endpoint:** `GET /api/newsletter/:id`

**Response:**
```typescript
{
  success: boolean;
  newsletter: {
    id: string;
    campaignId: string | null;
    campaign: {
      id: string;
      name: string;
      status: string;
    } | null;
    subject: string;
    preheader: string;
    contentHtml: string;
    contentText: string;
    articleCount: number;
    curatedArticles: string[];
    status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
    scheduledAt: string | null;
    sentAt: string | null;
    stats: {
      totalRecipients: number;
      totalSent: number;
      totalDelivered: number;
      totalOpens: number;
      totalClicks: number;
      totalBounces: number;
      openRate: number;
      clickRate: number;
      ctor: number;
    };
    createdAt: string;
    updatedAt: string;
  };
}
```

**Example:**
```bash
curl https://coastalprograms.com/api/newsletter/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer <token>"
```

---

### 3. Update Newsletter

Update a newsletter edition (subject, content, status, etc.).

**Endpoint:** `PATCH /api/newsletter/:id`

**Request Body:**
```typescript
{
  subject?: string;         // Max 200 chars
  preheader?: string;       // Max 200 chars
  contentHtml?: string;
  contentText?: string;
  status?: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduledAt?: string;     // ISO 8601 datetime
}
```

**Response:**
```typescript
{
  success: boolean;
  newsletter: Newsletter;
}
```

**Example:**
```bash
curl -X PATCH https://coastalprograms.com/api/newsletter/123e4567-e89b-12d3-a456-426614174000 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "subject": "Updated Subject Line",
    "status": "scheduled",
    "scheduledAt": "2025-01-27T10:00:00Z"
  }'
```

---

### 4. Delete Newsletter

Delete a newsletter edition (only drafts can be deleted).

**Endpoint:** `DELETE /api/newsletter/:id`

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

**Example:**
```bash
curl -X DELETE https://coastalprograms.com/api/newsletter/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer <token>"
```

**Error Codes:**
- `400` - Only draft newsletters can be deleted
- `404` - Newsletter not found

---

### 5. Send Newsletter

Send a newsletter edition to subscribers.

**Endpoint:** `POST /api/newsletter/:id/send`

**Request Body:**
```typescript
{
  testMode?: boolean;     // Send to single email (default: false)
  testEmail?: string;     // Test recipient email (required if testMode)
}
```

**Response (Test Mode):**
```typescript
{
  success: boolean;
  testMode: boolean;
  message: string;
  emailId: string;
}
```

**Response (Production):**
```typescript
{
  success: boolean;
  newsletterId: string;
  results: {
    total: number;
    sent: number;
    failed: number;
    errors: Array<{
      email: string;
      error: string;
    }>;
  };
  duration: number;
}
```

**Rate Limit:** 10 sends per hour per user

**Process:**
1. Validates newsletter status (not already sent/sending)
2. Fetches all verified, subscribed users
3. Sends emails in batches of 100 (Resend API limit)
4. Personalizes content (firstName, unsubscribeUrl)
5. Updates newsletter status and statistics
6. Logs send events for each subscriber

**Example (Test Mode):**
```bash
curl -X POST https://coastalprograms.com/api/newsletter/123e4567-e89b-12d3-a456-426614174000/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "testMode": true,
    "testEmail": "test@example.com"
  }'
```

**Example (Production):**
```bash
curl -X POST https://coastalprograms.com/api/newsletter/123e4567-e89b-12d3-a456-426614174000/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{}'
```

**Error Codes:**
- `400` - Newsletter already sent or currently sending
- `400` - No verified subscribers found

---

### 6. Preview Newsletter

Get a preview of newsletter content with optional personalization.

**Endpoint:** `GET /api/newsletter/:id/preview?personalize=true`

**Query Parameters:**
- `personalize` - Whether to personalize with sample data (default: false)

**Response:**
```typescript
{
  success: boolean;
  preview: {
    id: string;
    subject: string;
    preheader: string;
    html: string;
    text: string;
    articleCount: number;
    status: string;
    campaign: object | null;
    createdAt: string;
    personalized: boolean;
  };
}
```

**Example:**
```bash
curl https://coastalprograms.com/api/newsletter/123e4567-e89b-12d3-a456-426614174000/preview?personalize=true \
  -H "Authorization: Bearer <token>"
```

---

### 7. Preview with Custom Personalization

Preview newsletter with custom personalization data.

**Endpoint:** `POST /api/newsletter/:id/preview`

**Request Body:**
```typescript
{
  firstName?: string;  // Default: "there"
  email?: string;      // For personalized unsubscribe URL
}
```

**Response:** Same as GET preview

**Example:**
```bash
curl -X POST https://coastalprograms.com/api/newsletter/123e4567-e89b-12d3-a456-426614174000/preview \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "firstName": "John",
    "email": "john@example.com"
  }'
```

---

## Environment Variables

Required environment variables:

```bash
# Anthropic AI (for content summarization)
ANTHROPIC_API_KEY=sk-ant-...

# Resend (for sending emails)
RESEND_API_KEY=re_...

# Database (Drizzle ORM connects directly to PostgreSQL)
DATABASE_URL=postgresql://user:pass@host:port/dbname

# Site configuration
NEXT_PUBLIC_SITE_URL=https://coastalprograms.com

# NextAuth
AUTH_SECRET=your-auth-secret
```

Supabase still provides the PostgreSQL database hosting. The `DATABASE_URL` points to the Supabase PostgreSQL instance, but all queries go through Drizzle ORM — not the Supabase JS client.

---

## Database Tables

### newsletter_campaigns
Campaign configurations with scheduling and content settings.

**Columns (camelCase in Drizzle schema):**
- `id` - UUID primary key
- `name` - Campaign name
- `description` - Campaign description
- `status` - 'draft' | 'active' | 'paused' | 'completed'
- `frequency` - 'daily' | 'weekly' | 'monthly'
- `sendTime` - HH:MM format
- `sendDays` - Array of day numbers (0=Sunday)
- `timezone` - Timezone string
- `sources` - JSONB array of RSS sources
- `articleLimit` - Max articles to fetch
- `summarizerModel` - Claude model to use
- `psychologyMode` - Content curation mode
- `platforms` - Array of publishing platforms

### newsletter_editions
Individual newsletter editions that have been generated or sent.

**Columns (camelCase in Drizzle schema):**
- `id` - UUID primary key
- `campaignId` - Foreign key to campaigns
- `subject` - Email subject line
- `preheader` - Email preheader text
- `contentHtml` - HTML email content
- `contentText` - Plain text email content
- `articleCount` - Number of articles included
- `curatedArticles` - Array of article IDs
- `status` - 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed'
- `scheduledAt` - When to send
- `sentAt` - When it was sent
- `stats` - JSONB statistics object

### newsletter_articles
Cache of fetched and processed articles (optional).

**Columns (camelCase in Drizzle schema):**
- `id` - Article ID (hash of URL)
- `title` - Article title
- `url` - Article URL (unique)
- `content` - Article content
- `summary` - AI-generated summary
- `keyInsights` - Array of key insights
- `psychologyPrinciple` - Psychology principle
- `scoreFinal` - Final relevance score

---

## Database Access

All database queries use Drizzle ORM with typed schema tables:

```typescript
import { db } from "@/lib/db";
import { newsletterEditions, newsletterCampaigns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Query a newsletter edition
try {
  const edition = await db.query.newsletterEditions.findFirst({
    where: eq(newsletterEditions.id, editionId),
    with: { campaign: true },
  });
} catch (error) {
  console.error("Database query failed:", error);
}
```

---

## Error Handling

All endpoints follow consistent error response format:

```typescript
{
  success: false;
  error: string;           // User-friendly error message
  details?: string;        // Stack trace (development only)
  resetIn?: number;        // For rate limit errors (ms)
}
```

**Common Error Scenarios:**

1. **Authentication Errors (401)**
   - No valid session
   - Session expired

2. **Authorization Errors (403)**
   - Non-admin user
   - Account disabled

3. **Rate Limit Errors (429)**
   - Too many requests
   - Response includes `resetIn` (ms until reset)

4. **Validation Errors (400)**
   - Invalid request body
   - Invalid UUID format
   - Missing required fields

5. **Not Found Errors (404)**
   - Newsletter doesn't exist
   - Campaign doesn't exist

6. **Server Errors (500)**
   - Database errors
   - AI API errors
   - Email service errors

---

## Logging & Audit Trail

All operations are logged to `admin_audit_log`:

**Logged Actions:**
- `newsletter_generated` - Newsletter generation completed
- `newsletter_generation_failed` - Newsletter generation failed
- `newsletter_updated` - Newsletter content/status updated
- `newsletter_deleted` - Newsletter deleted
- `newsletter_sent` - Newsletter sent to subscribers
- `newsletter_test_sent` - Test email sent

**Log Fields:**
- `userId` - Admin user who performed action
- `action` - Action type
- `resourceType` - 'newsletter_edition'
- `resourceId` - Newsletter ID
- `details` - JSONB with additional context
- `createdAt` - Timestamp

---

## Testing

Run API tests:

```bash
bun run test
```

Run specific test file:

```bash
bun run test __tests__/api/newsletter/generate.test.ts
```

**Test Coverage:**
- Authentication/authorization
- Rate limiting
- Request validation
- Error handling
- Success scenarios
- Edge cases

---

## Rate Limiting

Rate limits are applied per user ID:

| Endpoint | Limit | Window |
|----------|-------|--------|
| Generate | 5 requests | 1 hour |
| Send | 10 requests | 1 hour |
| Other | 100 requests | 1 minute |

Rate limit information is returned in response headers:
- `X-RateLimit-Remaining` - Requests remaining
- `X-RateLimit-Reset` - Unix timestamp when limit resets

---

## Performance Considerations

**Newsletter Generation:**
- Average: 30-60 seconds
- Depends on: Number of articles, AI API latency, RSS feed response times
- Runs asynchronously in background

**Newsletter Sending:**
- Batch size: 100 emails per batch
- Delay between batches: 1 second
- Average: 5-10 seconds per 100 subscribers

**Optimization Tips:**
1. Use test mode before production sends
2. Schedule sends during off-peak hours
3. Monitor rate limit headers
4. Cache article summaries to reduce AI API calls

---

## Security Best Practices

1. **Never expose service keys** - ANTHROPIC_API_KEY, DATABASE_URL, RESEND_API_KEY must remain server-side only

2. **Validate all inputs** - All request bodies validated with Zod schemas

3. **Rate limiting** - Applied to prevent abuse

4. **Audit logging** - All operations logged for compliance

5. **RLS policies** - Database access controlled by Row Level Security

6. **GDPR compliance** - Unsubscribe URLs included in all emails

---

## Troubleshooting

**Newsletter generation fails:**
1. Check ANTHROPIC_API_KEY is valid
2. Verify RSS feeds are accessible
3. Check database connection (DATABASE_URL)
4. Review error logs in admin_audit_log

**Newsletter sending fails:**
1. Check RESEND_API_KEY is valid
2. Verify subscribers exist and are verified
3. Check email content for invalid HTML
4. Review Resend dashboard for delivery errors

**Rate limit errors:**
1. Check user's recent requests in logs
2. Wait for rate limit window to reset
3. Consider increasing limits for production

---

## Future Enhancements

Planned features:
- [ ] Scheduled sends (cron job)
- [ ] A/B testing subject lines
- [ ] Advanced analytics dashboard
- [ ] Multi-platform publishing (LinkedIn, Substack)
- [ ] Article embedding for semantic search
- [ ] Campaign templates
- [ ] Subscriber segmentation
- [ ] Automated optimization based on engagement

---

## Support

For issues or questions:
- GitHub: https://github.com/Coastal-Programs
- Email: support@coastalprograms.com
- Documentation: https://coastalprograms.com/docs
