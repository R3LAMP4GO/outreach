# React Email Templates

Production-ready email templates built with React Email, applying psychology principles for maximum engagement.

## Overview

This directory contains three core email templates optimized for subscriber engagement and conversion:

1. **Confirmation Email** - Double opt-in verification
2. **Welcome Email** - Personalized onboarding experience
3. **Curated Brief Newsletter** - Weekly content digest (Morning Brew style)

## Psychology Principles Applied

### Personalization (+37% open rates)
- Dynamic `{{firstName}}` insertion
- Business name and industry customization
- Context-aware messaging

### Loss Aversion
- "Don't miss" framing in CTAs
- Emphasis on exclusive content and resources
- Time-sensitive messaging

### Social Proof
- Subscriber counts (47,000+ business owners)
- Industry-specific relevance
- Real case studies and results

### Curiosity Gap
- Teaser headlines that don't reveal everything
- "Why it matters" sections
- Strategic information reveals

### Scarcity/Urgency
- Limited-time consultation offers
- Exclusive resources
- "First newsletter arrives Tuesday" deadlines

## Template Details

### 1. Confirmation Email

**Purpose**: Verify subscriber email address (double opt-in)

**Key Features**:
- Clear, actionable CTA button
- 24-hour expiration notice
- Safe to ignore messaging for non-subscribers

**Props**:
```typescript
interface ConfirmationEmailProps {
  verificationUrl: string;
  email: string;
}
```

**Usage**:
```typescript
import { renderConfirmationEmail } from './utils';

const html = await renderConfirmationEmail(
  'https://coastalprograms.com/verify?token=abc123',
  'user@example.com'
);
```

---

### 2. Welcome Email

**Purpose**: Onboard new subscribers after confirmation

**Key Features**:
- Personalized greeting with first name
- Industry-specific callout (if provided)
- Clear value proposition (what to expect)
- Social proof (subscriber count)
- CTA for consultation booking

**Props**:
```typescript
interface WelcomeEmailProps {
  firstName: string;
  businessName?: string;
  industry?: string;
  email: string;
}
```

**Usage**:
```typescript
import { renderWelcomeEmail } from './utils';

const html = await renderWelcomeEmail({
  firstName: 'Sarah',
  businessName: 'TechStart Inc',
  industry: 'SaaS',
  email: 'sarah@techstart.com'
});
```

**Psychology Applied**:
- Loss aversion: "Don't miss" framing for weekly content
- Social proof: "47,000+ business owners"
- Personalization: Name, business, industry
- Authority: Expertise positioning
- Scarcity: "First newsletter arrives Tuesday"

---

### 3. Curated Brief Newsletter

**Purpose**: Weekly content digest (3-5 stories, Morning Brew style)

**Key Features**:
- Scannable, mobile-friendly format
- Story component with "Why it matters" sections
- Personalized greeting
- Issue number and date
- Engagement closer (forward/reply prompts)

**Props**:
```typescript
interface NewsletterStory {
  headline: string;
  content: string;
  whyItMatters?: string;
  readMoreUrl?: string;
}

interface CuratedBriefNewsletterProps {
  firstName?: string;
  stories: NewsletterStory[];
  date: string;
  email: string;
  issueNumber?: number;
}
```

**Usage**:
```typescript
import { renderCuratedBriefNewsletter } from './utils';

const html = await renderCuratedBriefNewsletter({
  firstName: 'Sarah',
  date: 'Tuesday, November 27, 2025',
  issueNumber: 42,
  email: 'sarah@techstart.com',
  stories: [
    {
      headline: 'AI Automation Saves SMBs 15 Hours/Week',
      content: 'New study reveals that small businesses implementing AI-powered workflow automation are reclaiming nearly two full workdays per week...',
      whyItMatters: 'This shows automation isn\'t just for enterprise anymore – it\'s accessible and practical for businesses of all sizes.',
      readMoreUrl: 'https://coastalprograms.com/blog/ai-automation-study'
    },
    // ... more stories
  ]
});
```

**Psychology Applied**:
- Curiosity gap: Headlines that intrigue without revealing all
- Personalization: First name in greeting
- Social proof: Story selection signals popularity
- Scarcity: Weekly cadence creates anticipation

---

## Components

### EmailWrapper
Base layout wrapper providing:
- 600px centered container
- Gray background (#f9fafb)
- Rounded corners, shadow
- Mobile-responsive design
- Inter font family

### EmailHeader
Logo header component:
- Centered logo placement
- Configurable dimensions
- Alt text for accessibility

### EmailFooter
Comprehensive footer with:
- Social media icons (LinkedIn, X, GitHub, Website)
- Company name and copyright
- ABN and business registration
- Action links (Contact, Book Call, Services)
- Unsubscribe link

### Story
Newsletter story component:
- Headline (18px, bold)
- Content (16px, readable)
- "Why it matters" section (italic)
- Optional "Read more" link

---

## Design System

### Colors
- **Primary Blue**: #3B82F6 (buttons, links)
- **Text Dark**: #1a1a1a (headings)
- **Text Medium**: #666 (body text)
- **Text Light**: #999 (disclaimers)
- **Gray Background**: #f9fafb
- **Border**: #e5e7eb
- **Callout**: #f0f9ff (light blue)

### Typography
- **Font**: Inter (Google Fonts)
- **Heading**: 24px, weight 300-500
- **Subheading**: 18px, weight 500
- **Body**: 16px, weight 400
- **Small**: 14px, weight 300

### Spacing
- **Container**: 600px max width
- **Padding**: 32px inside container
- **Section margins**: 24px between elements
- **Line height**: 1.6 for readability

### Mobile Responsiveness
- Fluid layout (max-width, not fixed)
- Touch-friendly button sizing (min 44px)
- Readable font sizes (min 14px)
- Adequate padding for thumbs
- Images scale to container width

---

## Testing

Preview templates locally:
```bash
cd packages/newsletter-core
npm run email:dev
```

Send test emails:
```typescript
// In your API route
import { renderConfirmationEmail } from '@/lib/newsletter/emails/utils';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const html = await renderConfirmationEmail(verificationUrl, email);

await resend.emails.send({
  from: 'Coastal Programs <newsletter@email.coastalprograms.com>',
  to: email,
  subject: 'Confirm your subscription',
  html,
});
```

---

## Performance Considerations

### Email Client Compatibility
- Inline styles (not CSS classes)
- Table-based layouts where needed
- Fallback fonts specified
- Alt text for images
- Safe colors (web-safe palette)

### Loading Speed
- Minimal external resources
- Optimized image sizes
- Lazy-loaded images where possible
- CDN for icon assets

### Accessibility
- Semantic HTML structure
- Alt text on all images
- Sufficient color contrast (WCAG AA)
- Clear link text (no "click here")
- Logical tab order

---

## Future Enhancements

### Planned Templates
- Re-engagement campaign (win-back inactive subscribers)
- Product announcement
- Event invitation
- Survey/feedback request
- Birthday/anniversary personalization

### A/B Testing Opportunities
- Subject line variations
- CTA button colors
- Personalization depth
- Story count (3 vs 5)
- Send time optimization

### Advanced Personalization
- Behavioral triggers (clicked link, opened email)
- Content preferences (topics of interest)
- Engagement score adaptation
- Dynamic content blocks
- Geographic/timezone customization

---

## Files Structure

```
emails/
├── components/
│   ├── EmailWrapper.tsx      # Base layout wrapper
│   ├── EmailHeader.tsx        # Logo header
│   ├── EmailFooter.tsx        # Footer with social links
│   └── Story.tsx              # Newsletter story component
├── confirmation-email.tsx     # Double opt-in verification
├── welcome-email.tsx          # Post-confirmation onboarding
├── curated-brief-newsletter.tsx # Weekly digest
├── utils.ts                   # Render utilities
├── index.ts                   # Public exports
└── README.md                  # This file
```

---

## Resources

- [React Email Documentation](https://react.email)
- [Email Design Best Practices](https://www.campaignmonitor.com/resources/guides/email-design/)
- [Psychology of Email Marketing](https://www.nngroup.com/articles/email-newsletter-design/)
- [WCAG Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

**Maintained by**: Coastal Programs Development Team
**Last Updated**: November 27, 2025
