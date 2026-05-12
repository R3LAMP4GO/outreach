# Newsletter Template Generation - Complete Usage Guide

This guide covers everything you need to know to generate psychology-optimized newsletter email templates.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Understanding the Template Structure](#understanding-the-template-structure)
3. [Customization Options](#customization-options)
4. [Subject Line Generation](#subject-line-generation)
5. [Integration Examples](#integration-examples)
6. [Testing & Preview](#testing--preview)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Basic Newsletter Generation

```typescript
import { generateNewsletter, Article } from './modules/generation';

const articles: Article[] = [
  {
    id: '1',
    title: 'The Psychology Behind User Engagement',
    url: 'https://example.com/article',
    content: 'Full article content...',
    summary: 'Key insights about user engagement',
    publishedAt: new Date(),
    source: 'blog'
  }
];

const newsletter = generateNewsletter(articles);

// Use the generated newsletter
console.log(newsletter.subject); // Auto-generated subject line
console.log(newsletter.html); // Full HTML email
console.log(newsletter.text); // Plain text version
```

### With Custom Branding

```typescript
const newsletter = generateNewsletter(articles, {
  brandName: 'Business Insights Weekly',
  brandColor: '#2563eb',
  logoUrl: 'https://example.com/logo.png',
  unsubscribeUrl: 'https://example.com/unsubscribe'
});
```

---

## Understanding the Template Structure

### Psychology-Optimized Sections

Based on research showing 40% higher retention, every newsletter includes these sections:

#### 1. Personal Opening (1-2 sentences)
- Conversational greeting
- Sets friendly, accessible tone
- Examples: "Hey there,", "Welcome back,"

#### 2. 🧠 The Insight
- Main psychology principle
- 100-150 words
- Includes key takeaways
- Most important content first

#### 3. 📖 The Story
- Real-world example
- Numbers and results
- 150-200 words
- Social proof when available

#### 4. ⚡ The Framework
- Actionable 3-step system
- Bullet points for scannability
- 150-200 words
- Practical implementation

#### 5. 🎯 One Action
- Single thing readers can do today
- No overwhelm, no paradox of choice
- 50-75 words
- Clear, specific call-to-action

#### 6. P.S. Section
- Bonus tip or additional resources
- Additional article links (if available)
- Engagement prompt

### Design Specifications

**Mobile-First Responsive:**
- Max width: 600px
- Single column layout
- 14-16px body text (minimum)
- 44x44px touch targets for buttons
- Automatically scales for all screen sizes

**Dark Mode Support:**
- Automatic color inversion
- Background: `#1f2937` (dark)
- Text: `#f3f4f6` (light)
- Maintains readability in both modes

**Cross-Client Compatible:**
- Gmail (web, iOS, Android)
- Outlook (Windows, Mac, 365)
- Apple Mail (iOS, macOS)
- Yahoo, AOL, and others
- Inline CSS only
- Table-based layout for maximum compatibility

---

## Customization Options

### Complete Configuration Interface

```typescript
interface GenerationOptions {
  brandName?: string;        // Default: 'Business Insights'
  brandColor?: string;        // Default: '#2563eb' (blue)
  logoUrl?: string;           // Optional logo image URL
  footerText?: string;        // Default: 'Curated insights...'
  unsubscribeUrl?: string;    // Default: '#'
  webVersionUrl?: string;     // Optional web version link
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
    website?: string;
  };
}
```

### Example Configurations

#### Minimal Setup
```typescript
const newsletter = generateNewsletter(articles, {
  brandName: 'My Newsletter',
  unsubscribeUrl: 'https://example.com/unsubscribe'
});
```

#### Full Customization
```typescript
const newsletter = generateNewsletter(articles, {
  brandName: 'Founder Weekly',
  brandColor: '#10b981',
  logoUrl: 'https://example.com/logo.png',
  footerText: 'Actionable insights for ambitious founders',
  unsubscribeUrl: 'https://founderweekly.com/unsubscribe',
  webVersionUrl: 'https://founderweekly.com/newsletter/2024-11-26',
  socialLinks: {
    twitter: 'https://twitter.com/founderweekly',
    linkedin: 'https://linkedin.com/company/founderweekly',
    website: 'https://founderweekly.com'
  }
});
```

#### Brand Color Examples
- Blue (Professional): `#2563eb`
- Green (Growth): `#10b981`
- Purple (Creative): `#8b5cf6`
- Red (Urgent): `#ef4444`
- Orange (Energetic): `#f97316`

---

## Subject Line Generation

### Psychological Formulas

The generator uses 5 proven formulas optimized for different psychological triggers:

#### 1. Question-Based (37% higher opens)
- Taps into curiosity gap
- Creates compulsion to find answer
- Examples:
  - "Why do customers ignore your CTA?"
  - "What if we've been thinking about growth all wrong?"
  - "Is your pricing strategy hurting conversions?"

#### 2. Urgency/Scarcity
- Creates FOMO (fear of missing out)
- Time-sensitive framing
- Examples:
  - "This pricing mistake costs you $10K/month"
  - "Before you launch, read this"
  - "You're missing out on this growth tactic"

#### 3. Benefit-Driven
- Clear value proposition
- Action-oriented language
- Examples:
  - "How to double your conversion rate in 3 steps"
  - "The framework that increased revenue by 47%"
  - "3 psychology tricks for better engagement"

#### 4. Curiosity Gap
- Reveals partial information
- Open loops that require clicking
- Examples:
  - "The surprising truth about viral content"
  - "What nobody tells you about customer retention"
  - "This insight went viral for a reason"

#### 5. Straightforward (60-87% opens)
- No gimmicks, just clarity
- Surprisingly effective
- Examples:
  - "Business Insights - Nov 26"
  - "This Week's Top Stories"
  - "Your Weekly Newsletter"

### Generating Subject Line Variations

```typescript
import { generateSubjectLines } from './modules/generation';

const subjects = generateSubjectLines(articles);

// Returns array of 5 variations:
// [0] Question-based (recommended default)
// [1] Urgency-driven
// [2] Benefit-focused
// [3] Curiosity gap
// [4] Straightforward

console.log(subjects[0]); // "Why do customers abandon your checkout?"
```

### A/B Testing Subject Lines

```typescript
const subjects = generateSubjectLines(articles);

// Test 20% of subscribers with each variation
subjects.forEach((subject, index) => {
  const segment = subscribers.slice(
    index * (subscribers.length / 5),
    (index + 1) * (subscribers.length / 5)
  );

  const testNewsletter = { ...newsletter, subject };
  sendToSegment(segment, testNewsletter);
});

// Track which subject line has highest open rate
// Use winner for future newsletters
```

---

## Integration Examples

### With Resend Email Service

```typescript
import { Resend } from 'resend';
import { generateNewsletter } from './modules/generation';

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendNewsletter(subscribers: string[], articles: Article[]) {
  const newsletter = generateNewsletter(articles, {
    brandName: 'Your Newsletter',
    unsubscribeUrl: 'https://yoursite.com/unsubscribe'
  });

  for (const email of subscribers) {
    await resend.emails.send({
      from: 'newsletter@yourdomain.com',
      to: email,
      subject: newsletter.subject,
      html: newsletter.html,
      text: newsletter.text,
      headers: {
        'X-Entity-Ref-ID': newsletter.metadata.generatedAt.toISOString()
      }
    });
  }

  console.log(`Newsletter sent to ${subscribers.length} subscribers`);
}
```

### With Mailchimp

```typescript
import mailchimp from '@mailchimp/mailchimp_marketing';
import { generateNewsletter } from './modules/generation';

mailchimp.setConfig({
  apiKey: process.env.MAILCHIMP_API_KEY,
  server: process.env.MAILCHIMP_SERVER_PREFIX
});

async function createMailchimpCampaign(articles: Article[]) {
  const newsletter = generateNewsletter(articles);

  const campaign = await mailchimp.campaigns.create({
    type: 'regular',
    recipients: {
      list_id: 'your-list-id'
    },
    settings: {
      subject_line: newsletter.subject,
      preview_text: newsletter.preheader,
      title: `Newsletter - ${newsletter.metadata.generatedAt.toISOString()}`,
      from_name: 'Your Newsletter',
      reply_to: 'hello@yourdomain.com'
    }
  });

  await mailchimp.campaigns.setContent(campaign.id, {
    html: newsletter.html,
    text: newsletter.text
  });

  return campaign;
}
```

### Saving to Database

```typescript
import { db } from '@/lib/db';
import { newsletterEditions } from '@/lib/db/schema';
import { generateNewsletter } from './modules/generation';

async function saveNewsletterToDatabase(articles: Article[]) {
  const newsletter = generateNewsletter(articles);

  const [edition] = await db.insert(newsletterEditions).values({
    subject: newsletter.subject,
    preheader: newsletter.preheader,
    contentHtml: newsletter.html,
    contentText: newsletter.text,
    articleCount: newsletter.metadata.articleCount,
    estimatedReadTime: newsletter.metadata.estimatedReadTime,
    status: 'draft'
  }).returning();

  console.log('Newsletter saved:', edition.id);
  return edition;
}
```

### Scheduling with BullMQ

```typescript
import { Queue } from 'bullmq';
import { generateNewsletter } from './modules/generation';

const newsletterQueue = new Queue('newsletter-sending', {
  connection: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT)
  }
});

async function scheduleNewsletter(
  articles: Article[],
  sendAt: Date,
  subscribers: string[]
) {
  const newsletter = generateNewsletter(articles);

  await newsletterQueue.add(
    'send-newsletter',
    {
      newsletter,
      subscribers
    },
    {
      delay: sendAt.getTime() - Date.now(),
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    }
  );

  console.log(`Newsletter scheduled for ${sendAt.toISOString()}`);
}
```

---

## Testing & Preview

### Generate Demo Files

```bash
# Run demo generator to create sample HTML files
npx ts-node src/modules/generation/demo.ts

# Opens demos/ directory with:
# - default.html
# - business-insights.html
# - founder-weekly.html
# - saas-growth.html
# - marketing-psychology.html
# - index.html (view all demos)
```

### Manual Testing Checklist

#### Visual Testing
- [ ] Open HTML in browser
- [ ] Check dark mode (browser settings)
- [ ] Test responsive design (resize browser)
- [ ] Verify colors and branding
- [ ] Check all links work
- [ ] Validate social links appear

#### Email Client Testing
- [ ] Gmail web
- [ ] Gmail iOS/Android app
- [ ] Outlook Windows
- [ ] Outlook Mac
- [ ] Outlook 365
- [ ] Apple Mail (macOS)
- [ ] Apple Mail (iOS)
- [ ] Yahoo Mail
- [ ] AOL Mail
- [ ] Thunderbird

#### Content Testing
- [ ] Subject line under 50 chars
- [ ] Preheader displays correctly
- [ ] All sections render properly
- [ ] Images load (if used)
- [ ] Buttons are touch-friendly
- [ ] Text version is readable
- [ ] Unsubscribe link works

### Automated Testing

```typescript
// Run test suite
npm test

// Watch mode for development
npm test:watch

// Coverage report
npm test:coverage
```

---

## Best Practices

### Content Guidelines

**Article Selection:**
- Use 3-5 articles per newsletter
- Lead with strongest/most relevant article
- Include variety: insight, story, framework
- Ensure articles have summaries

**Article Enrichment:**
- Add `keyInsights` for better scannability
- Include `psychologyPrinciple` when applicable
- Provide `actionableFramework` for practical value
- Include engagement metrics when available

**Length Guidelines:**
- Total: 800-1,200 words (3-5 min read)
- Summaries: 100-200 words
- Key insights: 3-5 bullets
- Keep paragraphs short (2-3 sentences)

### Subject Line Best Practices

**Do:**
- Keep under 50 characters
- A/B test every send
- Front-load important words
- Use personalization authentically
- Test different formulas

**Don't:**
- Use ALL CAPS
- Include spam trigger words
- Make false promises
- Use excessive punctuation!!!
- Rely on emojis alone

### Design Best Practices

**Colors:**
- Use brand color for accents
- Ensure sufficient contrast (WCAG AA)
- Test in dark mode
- Limit to 2-3 colors total

**Typography:**
- 14-16px body text minimum
- 1.6 line height for readability
- Use system fonts for reliability
- Bold for emphasis, not sentences

**Images:**
- Compress images (<100KB)
- Use absolute URLs
- Include alt text
- Test with images disabled

**CTAs:**
- Single primary CTA (371% higher clicks)
- Make buttons 44x44px minimum
- Use action-oriented text
- Ensure high contrast

### Sending Best Practices

**Timing:**
- Best days: Tuesday, Wednesday, Thursday
- Best time: 10-11 AM local time
- Avoid weekends and holidays
- Test with your audience

**Frequency:**
- Start with weekly
- Monitor unsubscribe rates
- Let subscribers choose frequency
- Be consistent with schedule

**Testing:**
- A/B test subject lines (biggest impact)
- Test send times
- Try different content formats
- Monitor metrics closely

---

## Troubleshooting

### Common Issues

#### Images Not Displaying

**Problem:** Logo or images don't show in email clients

**Solutions:**
- Use absolute URLs (not relative)
- Check image hosting allows hotlinking
- Verify images are under 100KB
- Include alt text for accessibility
- Test without images enabled

#### Outlook Rendering Issues

**Problem:** Layout breaks in Outlook

**Solutions:**
- Check MSO conditionals are present
- Use table-based layout (no flexbox)
- Avoid advanced CSS
- Test in Outlook.com and desktop
- Use inline styles only

#### Dark Mode Problems

**Problem:** Colors look wrong in dark mode

**Solutions:**
- Test in Apple Mail and Gmail
- Check `@media (prefers-color-scheme: dark)` styles
- Provide sufficient contrast
- Don't rely solely on colors for meaning
- Test background and text combinations

#### Mobile Rendering

**Problem:** Newsletter doesn't look good on mobile

**Solutions:**
- Verify viewport meta tag present
- Check max-width is 600px
- Test touch targets are 44x44px
- Ensure single-column layout
- Test on actual devices

#### Plain Text Issues

**Problem:** Plain text version is hard to read

**Solutions:**
- Check line breaks are appropriate
- Verify section dividers are present
- Ensure URLs are clickable
- Test in text-only email clients
- Remove any HTML remnants

### Performance Issues

#### Slow Generation

**Problem:** Newsletter takes too long to generate

**Solutions:**
- Reduce number of articles
- Simplify article enrichment
- Cache generated templates
- Use server-side generation
- Monitor template complexity

#### Large File Size

**Problem:** Email is too large

**Solutions:**
- Compress images more
- Minify HTML (remove whitespace)
- Reduce number of inline styles
- Limit content length
- Test gzip compression

### Getting Help

1. Check [README.md](./README.md) for overview
2. Review [example.ts](./example.ts) for usage patterns
3. Run [demo.ts](./demo.ts) to see visual examples
4. Check test suite in [tests/](../../../tests/generation.test.ts)
5. Review [ARCHITECTURE.md](../../../../newsletter-system/ARCHITECTURE.md) for system design

---

## Advanced Usage

### Custom Section Generation

If you need to customize specific sections:

```typescript
import { NewsletterGenerator } from './modules/generation';

class CustomNewsletterGenerator extends NewsletterGenerator {
  // Override specific section generation
  private generateInsightSection(article: Article): string {
    // Your custom implementation
    return `<div>Custom insight section</div>`;
  }
}

const generator = new CustomNewsletterGenerator(options);
const newsletter = generator.generate(articles);
```

### Dynamic Content Insertion

```typescript
const newsletter = generateNewsletter(articles, options);

// Add dynamic content
const personalizedHtml = newsletter.html
  .replace('{{SUBSCRIBER_NAME}}', subscriber.name)
  .replace('{{CUSTOM_RECOMMENDATION}}', getRecommendation(subscriber));
```

### Multi-Language Support

```typescript
const translations = {
  en: { insight: 'The Insight', story: 'The Story' },
  es: { insight: 'La Perspectiva', story: 'La Historia' }
};

function generateLocalizedNewsletter(
  articles: Article[],
  locale: string
) {
  const newsletter = generateNewsletter(articles);

  // Replace section titles with translations
  let localizedHtml = newsletter.html;
  Object.entries(translations[locale]).forEach(([key, value]) => {
    localizedHtml = localizedHtml.replace(
      translations.en[key],
      value
    );
  });

  return { ...newsletter, html: localizedHtml };
}
```

---

## Next Steps

1. **Generate Your First Newsletter**: Use the quick start example
2. **Preview the Output**: Run demo.ts to see visual examples
3. **Customize Branding**: Apply your colors and logo
4. **Test Subject Lines**: A/B test the 5 variations
5. **Integrate with Email Service**: Connect to Resend or Mailchimp
6. **Monitor Performance**: Track open and click rates
7. **Iterate and Improve**: Optimize based on metrics

## Resources

- [Full API Documentation](./README.md)
- [Usage Examples](./example.ts)
- [Test Suite](../../../tests/generation.test.ts)
- [Demo Generator](./demo.ts)
- [System Architecture](../../../../newsletter-system/ARCHITECTURE.md)
- [Newsletter Format Research](../../../../newsletter-system/research/newsletter-formats.md)
- [Psychology Principles](../../../../newsletter-system/research/psychology-principles.md)

---

**Questions or Issues?**

Open an issue on GitHub or contact the maintainers.

**License:** MIT

**Built with:** Claude Code • Anthropic AI
