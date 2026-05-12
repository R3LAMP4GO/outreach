# Outreach API Routes

This directory contains Next.js App Router API routes that wrap the outreach-core package. These routes provide a complete backend API for the email outreach system.

## Architecture

All routes are thin wrappers around the core package functions. They handle:
- Authentication and authorization
- Request validation
- Error handling and logging
- Response formatting
- HTTP status codes

Database queries use Drizzle ORM (`db` from `@/lib/db`) with typed schema tables from `@/lib/db/schema`. Supabase provides PostgreSQL hosting only.

## Endpoints

### Campaign Management

#### POST /api/outreach/campaigns
Create a new campaign.

**Request:**
```json
{
  "name": "Campaign Name",
  "from_name": "John Doe",
  "from_email": "john@example.com",
  "reply_to": "reply@example.com",
  "status": "draft"
}
```

**Response:**
```json
{
  "campaign": {
    "id": "uuid",
    "name": "Campaign Name",
    "from_name": "John Doe",
    "from_email": "john@example.com",
    "reply_to": "reply@example.com",
    "status": "draft",
    "created_at": "2025-11-26T10:00:00Z"
  }
}
```

#### GET /api/outreach/campaigns
List all campaigns with optional filtering.

**Query Parameters:**
- `status` - Filter by status (draft, active, paused, completed)

**Response:**
```json
{
  "campaigns": [...],
  "count": 10
}
```

#### GET /api/outreach/campaigns/[campaignId]
Get a single campaign by ID.

**Response:**
```json
{
  "campaign": {
    "id": "uuid",
    "name": "Campaign Name",
    ...
  }
}
```

#### PATCH /api/outreach/campaigns/[campaignId]
Update a campaign.

**Request:**
```json
{
  "name": "Updated Name",
  "status": "active"
}
```

#### DELETE /api/outreach/campaigns/[campaignId]
Delete a campaign and all associated data.

**Response:**
```json
{
  "success": true,
  "message": "Campaign deleted successfully"
}
```

---

### Contact Management

#### POST /api/outreach/import/[campaignId]
Import contacts into a campaign. Called by n8n workflow.

**Headers:**
- `x-api-key`: API key for authentication

**Request:**
```json
{
  "contacts": [
    {
      "email": "john@example.com",
      "first_name": "John",
      "email_1_subject": "Introduction",
      "email_1_body": "<p>Hi {{first_name}},</p><p>...</p>",
      "email_2_subject": "Follow up",
      "email_2_body": "<p>Just following up...</p>",
      "email_3_subject": "Final follow up",
      "email_3_body": "<p>Last chance...</p>"
    }
  ]
}
```

**Response:**
```json
{
  "imported": 100,
  "skipped": 5,
  "errors": []
}
```

#### POST /api/outreach/unsubscribe/[contactId]
Unsubscribe a contact from all future emails.

**Response:**
```json
{
  "success": true,
  "message": "Contact unsubscribed successfully",
  "contact": {
    "id": "uuid",
    "email": "john@example.com",
    "unsubscribed": true
  }
}
```

#### GET /api/outreach/unsubscribe/[contactId]
Alternative unsubscribe method via GET (for email links). Redirects to confirmation page.

**Response:** 307 Redirect to `/unsubscribe/success` or `/unsubscribe/error`

---

### Email Processing

#### GET /api/outreach/process
Process due emails and send them via Resend. Called by cron job every 15 minutes.

**Headers:**
- `Authorization: Bearer <OUTREACH_CRON_SECRET>`

**Response:**
```json
{
  "success": true,
  "processed": 47,
  "failed": 2,
  "errors": [
    {
      "contactId": "uuid",
      "error": "Invalid recipient email"
    }
  ],
  "timestamp": "2025-11-26T10:15:00Z"
}
```

**Note:** Also supports POST method for cron providers that prefer POST.

---

### Webhooks

#### POST /api/outreach/webhooks/resend
Handle Resend webhook events for email delivery tracking.

**Headers:**
- `svix-id`: Webhook message ID
- `svix-timestamp`: Webhook timestamp
- `svix-signature`: Webhook signature for verification

**Events Handled:**
- `email.sent` - Email sent successfully
- `email.delivered` - Email delivered to recipient
- `email.bounced` - Email bounced
- `email.complained` - Spam complaint
- `email.opened` - Email opened (if tracking enabled)
- `email.clicked` - Link clicked (if tracking enabled)

**Response:**
```json
{
  "success": true,
  "eventType": "email.delivered"
}
```

---

## Environment Variables

Create a `.env.local` file with the following variables:

```bash
# Database (Drizzle ORM connects directly to PostgreSQL)
DATABASE_URL=postgresql://user:pass@host:port/dbname

# Resend
RESEND_API_KEY=re_your_api_key
RESEND_WEBHOOK_SECRET=whsec_your_webhook_secret

# Outreach System
OUTREACH_API_KEY=your-32-char-random-string
OUTREACH_CRON_SECRET=another-random-string
NEXT_PUBLIC_SITE_URL=https://coastalprograms.com
```

## Security

### API Key Authentication
The import endpoint uses API key authentication via the `x-api-key` header. Generate a secure random string:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Cron Secret
The process endpoint uses Bearer token authentication. Use a different random string for the cron secret.

### Webhook Signature Verification
Resend webhooks are verified using Svix signatures. The verification is handled by the core package.

## Error Handling

All routes implement comprehensive error handling:

1. **Input Validation**: Validates all inputs before processing
2. **Try-Catch Blocks**: Catches and logs all errors
3. **Appropriate Status Codes**: Returns correct HTTP status codes
4. **Error Logging**: Logs errors to console for debugging
5. **User-Friendly Messages**: Returns clean error messages (no stack traces)

## Logging

All routes log important events:
- Authentication failures
- Processing start/completion
- Success/failure counts
- Errors with details

## Testing

Test endpoints using curl:

```bash
# Create campaign
curl -X POST http://localhost:3000/api/outreach/campaigns \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Campaign","from_name":"John","from_email":"john@example.com"}'

# Import contacts
curl -X POST http://localhost:3000/api/outreach/import/CAMPAIGN_ID \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"contacts":[{"email":"test@example.com","first_name":"Test"}]}'

# Process emails (cron)
curl -X GET http://localhost:3000/api/outreach/process \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Unsubscribe contact
curl -X POST http://localhost:3000/api/outreach/unsubscribe/CONTACT_ID
```

## Deployment

### Vercel

1. Deploy to Vercel
2. Configure environment variables in Vercel dashboard
3. Set up Vercel Cron (if using Vercel for scheduling)
4. Configure Resend webhook URL: `https://your-domain.vercel.app/api/outreach/webhooks/resend`

### Vercel Cron Configuration

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/outreach/process",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

### External Cron Services

Alternatively, use external cron services like:
- EasyCron
- Cron-job.org
- AWS EventBridge
- Google Cloud Scheduler

Configure them to call `/api/outreach/process` every 15 minutes with the Authorization header.

## Integration with n8n

Configure n8n HTTP Request node:

```
Method: POST
URL: https://your-domain.vercel.app/api/outreach/import/{{$node["Campaign"].json["id"]}}
Headers:
  x-api-key: YOUR_API_KEY
  Content-Type: application/json
Body:
  {
    "contacts": {{$json["contacts"]}}
  }
```

## Next Steps

1. Create frontend pages for campaign management
2. Build unsubscribe success/error pages
3. Add analytics dashboard
4. Implement email preview functionality
5. Add bulk operations support
