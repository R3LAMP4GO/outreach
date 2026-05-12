# Email Templates - Quick Start Guide

Get up and running with the React Email templates in 5 minutes.

## 1. Installation (Already Complete)

The following packages are already installed:
- `@react-email/components`
- `@react-email/render`
- `react` (dev dependency)
- `react-email` (dev dependency)

## 2. Import Templates

```typescript
// Import render utilities
import {
  renderConfirmationEmail,
  renderWelcomeEmail,
  renderCuratedBriefNewsletter,
} from '@/lib/newsletter/emails/utils';

// Or import components directly
import {
  ConfirmationEmail,
  WelcomeEmail,
  CuratedBriefNewsletter,
} from '@/lib/newsletter/emails';
```

## 3. Basic Usage

### Confirmation Email
```typescript
const html = await renderConfirmationEmail(
  'https://coastalprograms.com/verify?token=abc123',
  'user@example.com'
);
```

### Welcome Email
```typescript
const html = await renderWelcomeEmail({
  firstName: 'Sarah',
  businessName: 'TechStart Inc',  // optional
  industry: 'SaaS',              // optional
  email: 'sarah@techstart.com',
});
```

### Newsletter
```typescript
const html = await renderCuratedBriefNewsletter({
  firstName: 'Sarah',            // optional
  email: 'sarah@techstart.com',
  date: 'Tuesday, November 27, 2025',
  issueNumber: 42,               // optional
  stories: [
    {
      headline: 'AI Automation Saves SMBs 15 Hours Per Week',
      content: 'Study shows small businesses reclaiming nearly two full workdays...',
      whyItMatters: 'Automation is now accessible for all business sizes.',  // optional
      readMoreUrl: 'https://coastalprograms.com/blog/study',                 // optional
    },
    // ... more stories (3-5 recommended)
  ],
});
```

## 4. Send with Resend

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Render template
const html = await renderWelcomeEmail({
  firstName: 'Sarah',
  email: 'sarah@techstart.com',
});

// Send email
await resend.emails.send({
  from: 'Coastal Programs <newsletter@email.coastalprograms.com>',
  to: 'sarah@techstart.com',
  subject: 'Welcome to Coastal Programs, Sarah!',
  html,
});
```

## 5. Preview Templates Locally

```bash
cd packages/newsletter-core
npm run email:dev
```

This starts a local server where you can preview all templates in your browser.

## 6. Next.js API Route Example

```typescript
// app/api/newsletter/welcome/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { renderWelcomeEmail } from '@/lib/newsletter/emails/utils';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const { email, firstName, businessName, industry } = await request.json();

    const html = await renderWelcomeEmail({
      firstName,
      businessName,
      industry,
      email,
    });

    await resend.emails.send({
      from: 'Jake at Coastal Programs <newsletter@email.coastalprograms.com>',
      to: email,
      subject: `Welcome to Coastal Programs, ${firstName}!`,
      html,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
```

## 7. TypeScript Types

All templates have full TypeScript support:

```typescript
import type {
  ConfirmationEmailProps,
  WelcomeEmailProps,
  CuratedBriefNewsletterProps,
} from '@/lib/newsletter/emails';

// Type-safe props
const welcomeProps: WelcomeEmailProps = {
  firstName: 'Sarah',
  businessName: 'TechStart Inc',
  industry: 'SaaS',
  email: 'sarah@techstart.com',
};
```

## 8. Testing

```typescript
// Test rendering without sending
const html = await renderWelcomeEmail({
  firstName: 'Test',
  email: 'test@example.com',
});

console.log('HTML length:', html.length);
console.log('Contains name:', html.includes('Test'));
```

## Common Patterns

### Pattern 1: Onboarding Flow
```typescript
// 1. Send confirmation email
const confirmationToken = generateToken();
await sendConfirmationEmail(email, confirmationToken);

// 2. After user verifies, send welcome email
await sendWelcomeEmail({ firstName, email, businessName, industry });
```

### Pattern 2: Weekly Newsletter Batch
```typescript
const subscribers = await getActiveSubscribers();

for (const subscriber of subscribers) {
  const html = await renderCuratedBriefNewsletter({
    firstName: subscriber.firstName,
    email: subscriber.email,
    date: formatDate(new Date()),
    issueNumber: getCurrentIssueNumber(),
    stories: await getCuratedStories(),
  });

  await resend.emails.send({
    from: 'Coastal Programs <newsletter@email.coastalprograms.com>',
    to: subscriber.email,
    subject: `Weekly Automation Brief - Issue #${issueNumber}`,
    html,
  });
}
```

### Pattern 3: Personalized Content
```typescript
// Customize stories based on subscriber preferences
const stories = await getCuratedStories(subscriber.interests);

const html = await renderCuratedBriefNewsletter({
  firstName: subscriber.firstName,
  email: subscriber.email,
  date: formatDate(new Date()),
  stories: stories.map(story => ({
    headline: story.title,
    content: story.excerpt,
    whyItMatters: story.relevance,
    readMoreUrl: story.url,
  })),
});
```

## Environment Variables

Make sure these are set:

```env
RESEND_API_KEY=re_...
NEXT_PUBLIC_SITE_URL=https://coastalprograms.com
```

## Troubleshooting

### Issue: Templates not rendering
**Solution**: Ensure `@react-email/render` is installed:
```bash
npm install @react-email/render
```

### Issue: Styles not applying
**Solution**: All styles are inline - make sure you're using the render utilities, not React.createElement directly.

### Issue: Images not loading
**Solution**: Use absolute URLs for all image sources (https://...).

### Issue: Fonts not loading in email clients
**Solution**: Google Fonts are async - fallback fonts will display first, which is normal.

## Best Practices

1. **Always personalize**: Use `firstName` when available
2. **Keep it scannable**: 3-5 stories max for newsletters
3. **Test across clients**: Gmail, Outlook, Apple Mail
4. **Mobile-first**: Most subscribers read on mobile
5. **Clear CTAs**: One primary action per email
6. **Respect unsubscribe**: Always include unsubscribe link

## Need Help?

- Full documentation: `README.md` in this directory
- Usage examples: `examples/email-templates-usage.ts`
- React Email docs: https://react.email

---

**Ready to send your first email?** Start with the welcome email template - it has the highest engagement!
