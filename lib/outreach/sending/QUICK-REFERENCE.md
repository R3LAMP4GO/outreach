# Sender Rotation - Quick Reference Card

## Quick Start

```typescript
import { sendEmail, selectAvailableSender, resetDailySenderCounts } from '@/lib/outreach'

// 1. Send email (automatic sender selection)
const result = await sendEmail(resend, contact, campaign, 1, unsubscribeUrl)
if (!result.success) {
  console.error(result.error)
}

// 2. Check available sender before sending
const sender = await selectAvailableSender(campaignId)
if (!sender) {
  console.log('No available senders')
}

// 3. Reset daily counts (cron job)
const resetCount = await resetDailySenderCounts()
```

## Database Setup

```sql
-- Create sender accounts
INSERT INTO outreach_sender_accounts (email, name, domain, daily_limit)
VALUES ('noreply@example.com', 'Example Team', 'example.com', 100);

-- Link to campaign
INSERT INTO outreach_campaign_senders (campaign_id, sender_id)
VALUES ('campaign-id', 'sender-id');

-- Apply RPC migration (optional but recommended)
-- See: supabase/migrations/increment_sender_count_rpc.sql
```

## Error Messages

| Error | Cause | Fix |
|-------|-------|-----|
| "No senders configured for campaign" | No senders linked to campaign | Add senders via `outreach_campaign_senders` |
| "No available senders (daily limit reached)" | All senders at limit | Wait for reset or increase limits |

## Monitoring

```sql
-- Check sender usage
SELECT email, emails_sent_today, daily_limit,
       ROUND(100.0 * emails_sent_today / daily_limit, 1) as usage_percent
FROM outreach_sender_accounts
WHERE is_active = true
ORDER BY usage_percent DESC;

-- Check campaign senders
SELECT c.name, s.email, s.emails_sent_today, s.daily_limit
FROM outreach_campaigns c
JOIN outreach_campaign_senders cs ON c.id = cs.campaign_id
JOIN outreach_sender_accounts s ON cs.sender_id = s.id
WHERE c.id = 'your-campaign-id';
```

## Common Tasks

```sql
-- Increase daily limit
UPDATE outreach_sender_accounts
SET daily_limit = 200
WHERE email = 'noreply@example.com';

-- Disable sender temporarily
UPDATE outreach_sender_accounts
SET is_active = false
WHERE email = 'noreply@example.com';

-- Manual reset (if needed)
UPDATE outreach_sender_accounts
SET emails_sent_today = 0
WHERE id = 'sender-id';
```

## Key Functions

| Function | Purpose | Returns |
|----------|---------|---------|
| `selectAvailableSender(campaignId)` | Select best sender | `SenderAccount \| null` |
| `sendEmail(...)` | Send email with rotation | `SendResult` |
| `resetDailySenderCounts()` | Reset all daily counts | `number` (count reset) |
| `getSenderAccount(id)` | Get sender by ID | `SenderAccount \| null` |
| `getAvailableSenders(campaignId)` | Get all available senders | `SenderAccount[]` |
| `incrementSenderCount(id)` | Increment sender count | `boolean` |
| `updateSenderLastSent(id, timestamp?)` | Update timestamp | `boolean` |

> **Note:** All query functions use Drizzle ORM (`db` from `@/lib/db`) internally. No Supabase client parameter needed.

## Daily Reset Cron

```typescript
// app/api/cron/reset-senders/route.ts
import { resetDailySenderCounts } from '@/lib/outreach'

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const count = await resetDailySenderCounts()

  return Response.json({ success: true, resetCount: count })
}
```

Schedule to run daily at midnight UTC.

## Testing

```typescript
import { runSenderRotationTests } from '@/lib/outreach/sending/sender-rotation-test'

const results = await runSenderRotationTests(testCampaignId)
console.log(`Tests: ${results.filter(r => r.passed).length}/${results.length} passed`)
```

## Best Practices

1. **Start Small**: Begin with daily limits of 50-100 per sender
2. **Multiple Senders**: Use at least 2-3 senders per campaign
3. **Gradual Warm-up**: Increase limits slowly over 2-4 weeks
4. **Monitor Metrics**: Watch bounce rates and deliverability
5. **Active Monitoring**: Check sender usage daily
6. **Domain Diversity**: Use senders from different domains if possible

## Full Documentation

- **Setup Guide**: `/SENDER-ROTATION-SETUP.md`
- **Feature Docs**: `/lib/outreach/sending/README.md`
- **Implementation**: `/SENDER-ROTATION-IMPLEMENTATION.md`
