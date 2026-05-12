# Email Publisher Module

Production-ready email sending using Resend API with rate limiting, retry logic, and comprehensive tracking.

## Features

- **Resend Integration**: Full Resend API integration for reliable email delivery
- **Rate Limiting**: Token bucket algorithm respects Resend API limits
- **Retry Logic**: Exponential backoff for transient failures
- **Batch Processing**: Efficient batch sending with configurable concurrency
- **CAN-SPAM Compliance**: Automatic unsubscribe link handling
- **Email Validation**: Validates emails and detects common typos
- **Database Tracking**: Full integration with newsletter_send_queue table
- **Error Handling**: Comprehensive error handling and logging
- **TypeScript**: Fully typed with Zod schemas

## Installation

The module is part of `@/lib/newsletter`:

```typescript
import {
  EmailPublisher,
  createEmailPublisher,
  type EmailRecipient,
  type EmailTemplate,
} from '@/lib/newsletter/modules/publishing';
```

## Quick Start

### Basic Usage

```typescript
import { createEmailPublisher } from '@/lib/newsletter/modules/publishing';

// Create publisher
const publisher = createEmailPublisher(process.env.RESEND_API_KEY!);

// Define recipient
const recipient: EmailRecipient = {
  id: 'sub_123',
  email: 'user@example.com',
  name: 'John Doe',
};

// Define email template
const template: EmailTemplate = {
  subject: 'Welcome to our Newsletter',
  preheader: 'Get the latest insights delivered to your inbox',
  html: '<h1>Welcome!</h1><p>Thanks for subscribing.</p>',
  text: 'Welcome! Thanks for subscribing.',
};

// Send options
const options: EmailSendOptions = {
  from: {
    email: 'newsletter@example.com',
    name: 'My Newsletter',
  },
  replyTo: 'reply@example.com',
};

// Unsubscribe link for CAN-SPAM compliance
const unsubscribeLink: UnsubscribeLink = {
  url: `https://example.com/unsubscribe/${recipient.id}`,
  text: 'Unsubscribe',
};

// Send email
const result = await publisher.sendToRecipient(
  recipient,
  template,
  options,
  unsubscribeLink
);

if (result.success) {
  console.log('Email sent:', result.resendId);
} else {
  console.error('Failed to send:', result.error);
}
```

### Batch Sending

```typescript
import { createEmailPublisher } from '@/lib/newsletter/modules/publishing';

const publisher = createEmailPublisher(process.env.RESEND_API_KEY!);

// Multiple recipients
const recipients: EmailRecipient[] = [
  { id: 'sub_1', email: 'user1@example.com' },
  { id: 'sub_2', email: 'user2@example.com' },
  { id: 'sub_3', email: 'user3@example.com' },
  // ... up to thousands
];

// Generate unsubscribe link per recipient
const unsubscribeFn = (recipient: EmailRecipient) => ({
  url: `https://example.com/unsubscribe/${recipient.id}`,
  text: 'Unsubscribe',
});

// Send batch
const batchResult = await publisher.sendBatch(
  recipients,
  template,
  options,
  unsubscribeFn,
  {
    batchSize: 100,           // Process 100 at a time
    concurrency: 5,           // 5 concurrent requests
    delayBetweenBatches: 1000, // 1 second delay between batches
    stopOnError: false,       // Continue on errors
  }
);

console.log(`
  Total: ${batchResult.total}
  Sent: ${batchResult.sent}
  Failed: ${batchResult.failed}
  Duration: ${batchResult.duration}ms
`);

// Handle errors
batchResult.errors.forEach(error => {
  console.error(`${error.email}: ${error.error}`);
});
```

## Configuration

### Publisher Configuration

```typescript
const publisher = new EmailPublisher({
  apiKey: process.env.RESEND_API_KEY!,

  // Rate limiting
  enableRateLimiting: true,
  rateLimitConfig: {
    maxRequestsPerSecond: 10,   // 10 emails/second
    maxRequestsPerHour: 1000,   // 1000 emails/hour
    burstSize: 20,              // Allow bursts up to 20
  },

  // Retry logic
  enableRetry: true,
  retryConfig: {
    maxRetries: 3,
    initialDelay: 1000,         // 1 second
    maxDelay: 30000,            // 30 seconds
    backoffMultiplier: 2,       // Exponential backoff
    retryableStatusCodes: [429, 500, 502, 503, 504],
  },
});
```

### Rate Limiting

The module uses a token bucket algorithm to respect Resend's rate limits:

```typescript
import { createResendRateLimiter } from '@/lib/newsletter/modules/publishing';

const limiter = createResendRateLimiter({
  maxRequestsPerSecond: 10,
  maxRequestsPerHour: 1000,
  burstSize: 20,
});

// Acquire token (wait if necessary)
await limiter.acquire();

// Try to acquire without waiting
const acquired = limiter.tryAcquire();

// Get stats
const stats = limiter.getStats();
console.log(`Tokens: ${stats.tokens}/${stats.maxTokens}`);
console.log(`Hourly: ${stats.hourlyCount}/${stats.hourlyLimit}`);
```

### Retry Logic

Exponential backoff with jitter for transient failures:

```typescript
import { retryWithBackoff, createDefaultRetryConfig } from '@/lib/newsletter/modules/publishing';

const config = createDefaultRetryConfig();

const result = await retryWithBackoff(
  async () => {
    // Your operation here
    return await someApiCall();
  },
  config,
  { context: 'additional-logging-data' }
);
```

## Database Integration

### Queue Emails for Sending

```typescript
import { queueEmailsForSend } from '@/lib/newsletter/modules/publishing';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Queue emails for an edition
await queueEmailsForSend(
  supabase,
  'edition_id',
  ['subscriber_1', 'subscriber_2', 'subscriber_3'],
  new Date() // Schedule for immediate send
);
```

### Process Queued Emails

```typescript
import {
  getPendingSends,
  saveSendResult,
} from '@/lib/newsletter/modules/publishing';

// Get pending sends
const pending = await getPendingSends(supabase, 'edition_id', 100);

// Send each email
for (const send of pending) {
  const result = await publisher.sendToRecipient(
    { id: send.subscriber_id, email: send.to_email },
    template,
    { from: { email: send.from_email, name: send.from_name } }
  );

  // Save result to database
  await saveSendResult(supabase, 'edition_id', result);
}
```

### Track Email Events (Webhooks)

```typescript
import { updateSendStatus } from '@/lib/newsletter/modules/publishing';

// Handle Resend webhook
app.post('/api/webhooks/resend', async (req, res) => {
  const event = req.body;

  switch (event.type) {
    case 'email.delivered':
      await updateSendStatus(
        supabase,
        event.data.email_id,
        'delivered',
        new Date(event.created_at)
      );
      break;

    case 'email.opened':
      await updateSendStatus(
        supabase,
        event.data.email_id,
        'opened',
        new Date(event.created_at)
      );
      break;

    case 'email.clicked':
      await updateSendStatus(
        supabase,
        event.data.email_id,
        'clicked',
        new Date(event.created_at)
      );
      break;
  }

  res.json({ success: true });
});
```

## Email Templates

### HTML Email with Unsubscribe Footer

The module automatically adds CAN-SPAM compliant unsubscribe footer:

```typescript
const template: EmailTemplate = {
  subject: 'Your Weekly Newsletter',
  preheader: 'Top insights from this week',
  html: `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: sans-serif; }
          .header { background: #1e40af; color: white; padding: 20px; }
          .content { padding: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Weekly Newsletter</h1>
        </div>
        <div class="content">
          <h2>Top Insights</h2>
          <p>Here are this week's top insights...</p>
        </div>
        <!-- Unsubscribe footer added automatically -->
      </body>
    </html>
  `,
  text: 'Weekly Newsletter\n\nTop Insights\n\nHere are this week\'s top insights...',
  replyTo: 'reply@example.com',
};
```

### Personalization

```typescript
// Add personalization in your template
const template: EmailTemplate = {
  subject: `Hi {{name}}, your weekly insights`,
  html: `
    <h1>Hi {{name}}!</h1>
    <p>Here are your personalized insights...</p>
  `,
  text: 'Hi {{name}}!\n\nHere are your personalized insights...',
};

// Replace tokens before sending
function personalizeTemplate(
  template: EmailTemplate,
  recipient: EmailRecipient
): EmailTemplate {
  return {
    ...template,
    subject: template.subject.replace('{{name}}', recipient.name || 'there'),
    html: template.html.replace('{{name}}', recipient.name || 'there'),
    text: template.text.replace('{{name}}', recipient.name || 'there'),
  };
}

const personalizedTemplate = personalizeTemplate(template, recipient);
await publisher.sendToRecipient(recipient, personalizedTemplate, options);
```

## Error Handling

### Individual Send Errors

```typescript
const result = await publisher.sendToRecipient(recipient, template, options);

if (!result.success) {
  // Log error details
  console.error('Send failed:', {
    recipientId: result.recipientId,
    email: result.email,
    error: result.error,
    errorCode: result.errorCode,
  });

  // Handle specific errors
  switch (result.errorCode) {
    case 'INVALID_EMAIL':
      // Update subscriber status
      await markSubscriberInvalid(result.recipientId);
      break;

    case '429': // Rate limit
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, 60000));
      break;

    case 'SEND_FAILED':
      // Log for investigation
      await logSendFailure(result);
      break;
  }
}
```

### Batch Send Errors

```typescript
const batchResult = await publisher.sendBatch(recipients, template, options);

// Calculate error rate
const errorRate = batchResult.failed / batchResult.total;

if (errorRate > 0.05) { // More than 5% failed
  console.error('High error rate detected:', errorRate);

  // Analyze errors
  const errorsByCode = batchResult.errors.reduce((acc, error) => {
    const code = error.code || 'unknown';
    acc[code] = (acc[code] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('Errors by code:', errorsByCode);
}

// Retry failed sends
const failedRecipients = batchResult.results
  .filter(r => !r.success)
  .map(r => recipients.find(rec => rec.id === r.recipientId)!)
  .filter(Boolean);

if (failedRecipients.length > 0) {
  console.log(`Retrying ${failedRecipients.length} failed sends...`);
  await publisher.sendBatch(failedRecipients, template, options);
}
```

## Monitoring

### Rate Limiter Stats

```typescript
// Check rate limiter status
const stats = publisher.getRateLimiterStats();

if (stats) {
  console.log(`
    Tokens: ${stats.tokens}/${stats.maxTokens}
    Hourly: ${stats.hourlyCount}/${stats.hourlyLimit}
    Remaining: ${stats.hourlyRemaining}
  `);

  // Alert if approaching limits
  if (stats.hourlyRemaining < 100) {
    await sendAlert('Approaching hourly email limit');
  }
}
```

### Send Performance

```typescript
const startTime = Date.now();

const batchResult = await publisher.sendBatch(recipients, template, options);

const duration = Date.now() - startTime;
const throughput = batchResult.sent / (duration / 1000); // Emails per second

console.log(`
  Throughput: ${throughput.toFixed(2)} emails/second
  Success Rate: ${(batchResult.sent / batchResult.total * 100).toFixed(2)}%
  Average Time: ${(duration / batchResult.total).toFixed(2)}ms per email
`);
```

## Testing

### Mock Resend API

```typescript
import { vi } from 'vitest';
import { EmailPublisher } from '../email';

describe('Email Publisher', () => {
  it('should send email', async () => {
    const publisher = new EmailPublisher({
      apiKey: 'test_key',
      enableRateLimiting: false,
      enableRetry: false,
    });

    // Mock Resend send
    const mockSend = vi.fn().mockResolvedValue({
      data: { id: 'msg_123' },
      error: null,
    });

    (publisher as any).resend.emails.send = mockSend;

    const result = await publisher.sendToRecipient(
      recipient,
      template,
      options
    );

    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalled();
  });
});
```

## Best Practices

1. **Always include unsubscribe links** for CAN-SPAM compliance
2. **Use batch sending** for large recipient lists
3. **Enable rate limiting** in production to respect API limits
4. **Enable retry logic** to handle transient failures
5. **Validate emails** before sending to reduce bounces
6. **Monitor error rates** and investigate patterns
7. **Track sends in database** for analytics and debugging
8. **Use appropriate batch sizes** (100-1000 depending on content size)
9. **Configure concurrency** based on your rate limits
10. **Test thoroughly** with mock data before production

## Resend Limits

Default Resend limits (adjust based on your plan):

- **Free Tier**: 100 emails/day
- **Paid Tier**: Based on plan, typically:
  - 10-50 emails/second
  - 50,000+ emails/month
  - Burst up to 100 emails

Configure rate limits accordingly:

```typescript
// Free tier
const publisher = createEmailPublisher(apiKey, {
  rateLimitConfig: {
    maxRequestsPerSecond: 1,
    maxRequestsPerHour: 100,
    burstSize: 5,
  },
});

// Paid tier (Growth plan)
const publisher = createEmailPublisher(apiKey, {
  rateLimitConfig: {
    maxRequestsPerSecond: 10,
    maxRequestsPerHour: 10000,
    burstSize: 50,
  },
});
```

## License

MIT
