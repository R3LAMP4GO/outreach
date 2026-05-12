# Email Sending with Sender Rotation

This module implements intelligent sender rotation and daily limit enforcement for the email outreach system.

## Overview

The sender rotation system allows campaigns to use multiple sender accounts and automatically distributes emails across them while respecting daily sending limits. This improves deliverability and scales email volume.

## Features

- **Automatic Sender Selection**: Selects the best available sender for each email
- **Load Balancing**: Distributes emails evenly across all available senders
- **Daily Limit Enforcement**: Prevents senders from exceeding their configured daily limits
- **Graceful Degradation**: Falls back to manual increment if RPC function is unavailable
- **Proper Error Handling**: Clear error messages when no senders are available

## Architecture

### Database Schema

The system uses two main tables:

1. **outreach_sender_accounts**: Stores sender account details
   - `email`: Sender email address
   - `name`: Sender display name
   - `dailyLimit`: Maximum emails per day
   - `emailsSentToday`: Current count for today
   - `lastSentAt`: Last time an email was sent
   - `isActive`: Whether sender is enabled

2. **outreach_campaign_senders**: Junction table linking campaigns to senders
   - `campaignId`: Campaign ID
   - `senderId`: Sender account ID

### Key Functions

#### `selectAvailableSender(campaignId)`
Selects the best available sender for a campaign:
- Queries all senders configured for the campaign via Drizzle ORM
- Filters to active senders under their daily limit
- Returns sender with lowest usage (load balancing)
- Returns `null` if no senders available

#### `sendEmail(resend, contact, campaign, emailNumber, unsubscribeUrl)`
Enhanced email sending with sender rotation:
1. Selects available sender account
2. Returns error if no senders available:
   - "No senders configured for campaign"
   - "No available senders (daily limit reached)"
3. Uses selected sender's email and name
4. Sends email via Resend
5. Atomically increments sender's daily count
6. Updates sender's lastSentAt timestamp
7. Stores senderAccountId on contact record

#### `resetDailySenderCounts()`
Resets daily counters for all senders:
- Sets `emailsSentToday = 0` for all senders
- Should be called by midnight cron job
- Returns count of senders reset

### Query Functions

All database queries are isolated in `queries.ts` and use Drizzle ORM (`db` from `@/lib/db`):

- `getSenderAccount(id)`: Fetch sender by ID
- `getCampaignSenders(campaignId)`: Get all senders for campaign
- `getAvailableSenders(campaignId)`: Get active senders under limit
- `incrementSenderCount(id)`: Atomic increment of daily count
- `updateSenderLastSent(id, timestamp)`: Update last sent time
- `resetDailySenderCounts()`: Reset all daily counts

## Usage

### Basic Email Sending

```typescript
import { sendEmail } from '@/lib/outreach/sending'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const result = await sendEmail(
  resend,
  contact,
  campaign,
  1,
  unsubscribeUrl
)

if (result.success) {
  console.log('Email sent via sender:', contact.senderAccountId)
} else {
  console.error('Send failed:', result.error)
}
```

### Sender Selection

```typescript
import { selectAvailableSender } from '@/lib/outreach/sending'

const sender = await selectAvailableSender(campaignId)

if (!sender) {
  console.log('No available senders')
} else {
  console.log('Selected sender:', sender.email)
  console.log('Current usage:', sender.emailsSentToday, '/', sender.dailyLimit)
}
```

### Daily Reset Cron Job

```typescript
import { resetDailySenderCounts } from '@/lib/outreach/sending'

// Run at midnight UTC
export async function handler() {
  const resetCount = await resetDailySenderCounts()
  console.log(`Reset ${resetCount} sender accounts`)
}
```

## Error Handling

The system provides clear error messages:

### No Senders Configured
```typescript
{
  success: false,
  error: 'No senders configured for campaign'
}
```
**Solution**: Add sender accounts to the campaign via `outreach_campaign_senders` table.

### Daily Limit Reached
```typescript
{
  success: false,
  error: 'No available senders (daily limit reached)'
}
```
**Solution**: Wait for daily reset or increase sender daily limits.

## Performance Optimizations

### Atomic Increments
The system uses a PostgreSQL RPC function for atomic increments:

```sql
CREATE FUNCTION increment_sender_count(sender_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE outreach_sender_accounts
  SET emails_sent_today = emails_sent_today + 1,
      updated_at = NOW()
  WHERE id = sender_id;
END;
$$ LANGUAGE plpgsql;
```

If the RPC function is not available, the system falls back to a manual increment approach.

### Load Balancing
Senders are sorted by `emailsSentToday` ascending, ensuring even distribution:
```typescript
availableSenders.sort((a, b) => a.emailsSentToday - b.emailsSentToday)
```

### Parallel Updates
After sending, sender statistics are updated in parallel:
```typescript
await Promise.all([
  incrementSenderCount(sender.id),
  updateSenderLastSent(sender.id),
])
```

## Database Setup

### Apply Migration
```bash
# Apply the RPC function migration
npx supabase db push supabase/migrations/increment_sender_count_rpc.sql
```

> **Note:** All query functions use Drizzle ORM (`db` from `@/lib/db`) internally — see `queries.ts` for implementation details.

### Create Sender Accounts
```sql
INSERT INTO outreach_sender_accounts (email, name, domain, daily_limit)
VALUES
  ('noreply@example.com', 'Example Team', 'example.com', 100),
  ('hello@example.com', 'Example Support', 'example.com', 100);
```

### Link Senders to Campaign
```sql
INSERT INTO outreach_campaign_senders (campaign_id, sender_id)
VALUES
  ('campaign-uuid-1', 'sender-uuid-1'),
  ('campaign-uuid-1', 'sender-uuid-2');
```

## Testing

### Verify Sender Selection
```typescript
const sender = await selectAvailableSender(campaignId)
assert(sender !== null, 'Should select a sender')
assert(sender.emailsSentToday < sender.dailyLimit, 'Should be under limit')
```

### Verify Daily Limit Enforcement
```typescript
// Set sender to limit using Drizzle
await db
  .update(outreachSenderAccounts)
  .set({ emailsSentToday: 100, dailyLimit: 100 })
  .where(eq(outreachSenderAccounts.id, senderId))

const sender = await selectAvailableSender(campaignId)
assert(sender === null, 'Should not select sender at limit')
```

### Verify Load Balancing
```typescript
// Send multiple emails and verify distribution
const senderCounts = new Map()

for (let i = 0; i < 10; i++) {
  const result = await sendEmail(resend, contact, campaign, 1, url)
  const senderId = result.contact.senderAccountId
  senderCounts.set(senderId, (senderCounts.get(senderId) || 0) + 1)
}

// Verify emails distributed across multiple senders
assert(senderCounts.size > 1, 'Should use multiple senders')
```

## Monitoring

### Check Sender Usage
```sql
SELECT
  email,
  name,
  emails_sent_today,
  daily_limit,
  ROUND(100.0 * emails_sent_today / daily_limit, 1) as usage_percent
FROM outreach_sender_accounts
WHERE is_active = true
ORDER BY usage_percent DESC;
```

### Check Campaign Senders
```sql
SELECT
  c.name as campaign,
  s.email as sender,
  s.emails_sent_today,
  s.daily_limit,
  s.is_active
FROM outreach_campaigns c
JOIN outreach_campaign_senders cs ON c.id = cs.campaign_id
JOIN outreach_sender_accounts s ON cs.sender_id = s.id
WHERE c.id = 'campaign-uuid';
```

## Troubleshooting

### Issue: All emails failing with "No senders configured"
**Cause**: Campaign has no senders in `outreach_campaign_senders` table.
**Solution**: Add at least one sender to the campaign.

### Issue: Emails failing intermittently with "daily limit reached"
**Cause**: All senders have hit their daily limits.
**Solution**: Either increase daily limits or add more sender accounts.

### Issue: RPC function errors in logs
**Cause**: Database migration not applied.
**Solution**: Apply the migration or let system use manual fallback.

### Issue: Uneven sender distribution
**Cause**: Load balancing may need tuning.
**Solution**: Check that all senders have similar daily limits.

## Future Enhancements

Potential improvements for this system:

1. **Sender Reputation Tracking**: Track bounce rates per sender
2. **Intelligent Warm-up**: Gradually increase sender daily limits
3. **Domain Rotation**: Select senders from different domains
4. **Time-based Limits**: Add hourly limits in addition to daily
5. **Sender Pools**: Group senders by type (transactional, marketing, etc.)
6. **Health Checks**: Automatically disable senders with high bounce rates
7. **Priority Senders**: Allow marking certain senders as preferred
8. **Sender Scheduling**: Assign specific time windows to different senders

## Related Documentation

- [Email Threading](./threading.ts) - Email reply threading system
- [Email Processor](./processor.ts) - Batch email processing
- [Campaign Management](../campaigns/) - Campaign configuration
- [Contact Management](../contacts/) - Contact lifecycle
