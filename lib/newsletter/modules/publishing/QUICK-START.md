# Email Publisher - Quick Start Guide

Get started with the newsletter email publisher in 5 minutes.

## Installation

```bash
npm install @/lib/newsletter
```

## Setup

```typescript
import { createEmailPublisher } from '@/lib/newsletter/modules/publishing';

const publisher = createEmailPublisher(process.env.RESEND_API_KEY!);
```

## Send Single Email

```typescript
import type {
  EmailRecipient,
  EmailTemplate,
  EmailSendOptions,
} from '@/lib/newsletter/modules/publishing';

// Define recipient
const recipient: EmailRecipient = {
  id: 'subscriber_123',
  email: 'user@example.com',
};

// Define template
const template: EmailTemplate = {
  subject: 'Your Newsletter',
  html: '<h1>Hello!</h1><p>Newsletter content here...</p>',
  text: 'Hello! Newsletter content here...',
};

// Send options
const options: EmailSendOptions = {
  from: {
    email: 'newsletter@example.com',
    name: 'My Newsletter',
  },
};

// Send
const result = await publisher.sendToRecipient(recipient, template, options);

if (result.success) {
  console.log('Sent! Resend ID:', result.resendId);
} else {
  console.error('Failed:', result.error);
}
```

## Send Batch

```typescript
// Multiple recipients
const recipients: EmailRecipient[] = [
  { id: '1', email: 'user1@example.com' },
  { id: '2', email: 'user2@example.com' },
  // ... more recipients
];

// Batch send
const batchResult = await publisher.sendBatch(
  recipients,
  template,
  options,
  undefined, // No unsubscribe link
  {
    batchSize: 100,
    concurrency: 5,
  }
);

console.log(`Sent: ${batchResult.sent}/${batchResult.total}`);
```

## Add Unsubscribe Link

```typescript
// Per-recipient unsubscribe link
const unsubscribeFn = (recipient: EmailRecipient) => ({
  url: `https://example.com/unsubscribe/${recipient.id}`,
  text: 'Unsubscribe',
});

await publisher.sendBatch(recipients, template, options, unsubscribeFn);
```

## Configuration

### Rate Limiting

```typescript
const publisher = createEmailPublisher(apiKey, {
  enableRateLimiting: true,
  rateLimitConfig: {
    maxRequestsPerSecond: 10,
    maxRequestsPerHour: 1000,
    burstSize: 20,
  },
});
```

### Retry Logic

```typescript
const publisher = createEmailPublisher(apiKey, {
  enableRetry: true,
  retryConfig: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  },
});
```

## Database Integration

### Queue Emails

```typescript
import { queueEmailsForSend } from '@/lib/newsletter/modules/publishing';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, key);

await queueEmailsForSend(
  supabase,
  'edition_id',
  ['subscriber_1', 'subscriber_2'],
  new Date() // Schedule time
);
```

### Process Queue

```typescript
import { getPendingSends, saveSendResult } from '@/lib/newsletter/modules/publishing';

// Get pending sends
const pending = await getPendingSends(supabase, 'edition_id', 100);

// Send each
for (const send of pending) {
  const result = await publisher.sendToRecipient(
    { id: send.subscriber_id, email: send.to_email },
    template,
    options
  );

  // Save result
  await saveSendResult(supabase, 'edition_id', result);
}
```

## Error Handling

```typescript
const result = await publisher.sendToRecipient(recipient, template, options);

if (!result.success) {
  switch (result.errorCode) {
    case 'INVALID_EMAIL':
      // Mark subscriber as invalid
      break;
    case '429':
      // Rate limited - wait and retry
      break;
    default:
      // Log error
      console.error(result.error);
  }
}
```

## Monitoring

```typescript
// Check rate limiter
const stats = publisher.getRateLimiterStats();
console.log(`Remaining: ${stats?.hourlyRemaining}`);

// Batch results
console.log(`
  Total: ${batchResult.total}
  Sent: ${batchResult.sent}
  Failed: ${batchResult.failed}
  Duration: ${batchResult.duration}ms
`);
```

## Testing

```typescript
import { vi } from 'vitest';

// Mock Resend
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({
        data: { id: 'msg_123' },
        error: null,
      }),
    },
  })),
}));

// Test
const publisher = createEmailPublisher('test_key', {
  enableRateLimiting: false,
  enableRetry: false,
});
```

## Environment Variables

```env
# Required
RESEND_API_KEY=re_123abc...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Optional
FROM_EMAIL=newsletter@example.com
FROM_NAME=My Newsletter
PUBLIC_URL=https://example.com
```

## Common Patterns

### Newsletter Send

```typescript
async function sendNewsletter(editionId: string) {
  // 1. Get edition and subscribers
  const edition = await getEdition(editionId);
  const subscribers = await getActiveSubscribers();

  // 2. Queue emails
  await queueEmailsForSend(supabase, editionId, subscribers.map(s => s.id));

  // 3. Process queue in batches
  while (true) {
    const pending = await getPendingSends(supabase, editionId, 100);
    if (pending.length === 0) break;

    const batchResult = await publisher.sendBatch(/* ... */);

    // Save results
    for (const result of batchResult.results) {
      await saveSendResult(supabase, editionId, result);
    }
  }
}
```

### Test Send

```typescript
async function sendTest(emails: string[]) {
  const recipients = emails.map((email, i) => ({
    id: `test_${i}`,
    email,
  }));

  const results = await publisher.sendBatch(recipients, template, options);

  return results.results.map(r => ({
    email: r.email,
    success: r.success,
    error: r.error,
  }));
}
```

## Next Steps

- Read full [README.md](./README.md) for detailed documentation
- See [examples/](./examples/) for complete workflows
- Check [__tests__/](./__tests__/) for usage examples
- Review [types.ts](./types.ts) for all available types

## Support

- Issues: [GitHub Issues](https://github.com/coastalprograms/newsletter-core/issues)
- Docs: [Full Documentation](./README.md)
- Examples: [examples/send-newsletter.example.ts](./examples/send-newsletter.example.ts)
