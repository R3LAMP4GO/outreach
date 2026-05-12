# Newsletter Generation Module

Generate psychology-optimized newsletter email templates with mobile-first responsive design, dark mode support, and cross-client compatibility.

## Features

- **Psychology-Optimized Structure**: Based on research from ARCHITECTURE.md
  - Personal opening (1-2 sentences)
  - 🧠 The Insight section
  - 📖 The Story section
  - ⚡ The Framework section
  - 🎯 One Action section
  - P.S. bonus tip

- **Mobile-First Responsive Design**
  - Single column layout (600px max width)
  - 14-16px minimum text size
  - Touch-friendly buttons (44x44px)
  - Optimized for all screen sizes

- **Cross-Client Compatible**
  - Gmail (web, iOS, Android)
  - Outlook (Windows, Mac, 365)
  - Apple Mail (iOS, macOS)
  - Yahoo, AOL, and others
  - Dark mode support

- **Subject Line Generator**
  - 5 psychological formulas
  - Curiosity-driven (37% higher open rates)
  - Urgency-based
  - Benefit-focused
  - Curiosity gap
  - Straightforward (60-87% open rates)

- **Dual Format Output**
  - HTML version (fully styled)
  - Plain text version (text-only clients)

## Quick Start

```typescript
import { generateNewsletter } from './modules/generation';

const articles = [
  {
    id: '1',
    title: 'The Psychology Behind Viral Content',
    url: 'https://example.com/article',
    content: 'Full article content here...',
    summary: 'A fascinating look at why some content spreads...',
    keyInsights: [
      'Social proof increases sharing by 32%',
      'Emotional content performs 2x better',
      'Timing matters more than you think'
    ],
    psychologyPrinciple: 'Social proof and reciprocity drive viral behavior',
    publishedAt: new Date(),
    source: 'hacker-news'
  }
];

const template = generateNewsletter(articles, {
  brandName: 'Business Insights Weekly',
  brandColor: '#2563eb',
  unsubscribeUrl: 'https://example.com/unsubscribe',
  webVersionUrl: 'https://example.com/newsletter/2024-11-26',
  socialLinks: {
    twitter: 'https://twitter.com/yourhandle',
    linkedin: 'https://linkedin.com/company/yourcompany'
  }
});

console.log(template.subject); // "Why do customers ignore your CTA?"
console.log(template.preheader); // First 100 chars preview
console.log(template.html); // Full HTML email
console.log(template.text); // Plain text version
console.log(template.metadata); // Article count, read time, etc.
```

## API Reference

### `generateNewsletter(articles, options)`

Generate a complete newsletter template.

**Parameters:**
- `articles: Article[]` - Array of articles (minimum 1 required)
- `options?: GenerationOptions` - Customization options

**Returns:** `NewsletterTemplate`

### `generateSubjectLines(articles)`

Generate 5 subject line variations for A/B testing.

**Parameters:**
- `articles: Article[]` - Articles to base subject lines on

**Returns:** `string[]` - Array of 5 subject line variations

### Types

#### `Article`

```typescript
interface Article {
  id: string;
  title: string;
  url: string;
  content: string;
  author?: string;
  publishedAt: Date;
  source: string;

  // Optional AI enrichment
  summary?: string;
  keyInsights?: string[];
  psychologyPrinciple?: string;
  actionableFramework?: string;

  // Optional engagement metrics
  engagement?: {
    upvotes?: number;
    comments?: number;
    shares?: number;
  };
}
```

#### `GenerationOptions`

```typescript
interface GenerationOptions {
  brandName?: string;        // Default: 'Business Insights'
  brandColor?: string;        // Default: '#2563eb'
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

#### `NewsletterTemplate`

```typescript
interface NewsletterTemplate {
  subject: string;            // Generated subject line
  preheader: string;          // Preview text (100 chars)
  html: string;               // Full HTML email
  text: string;               // Plain text version
  metadata: {
    articleCount: number;
    estimatedReadTime: string;  // e.g., "5 min read"
    generatedAt: Date;
  };
}
```

## Subject Line Formulas

The generator uses 5 proven psychological formulas:

1. **Question-Based** (37% higher opens)
   - "Why do [topic]?"
   - "What if [insight]?"
   - "How do top performers [action]?"

2. **Urgency/Scarcity**
   - "This [topic] changes everything"
   - "The [topic] mistake costing you"

3. **Benefit-Driven**
   - "How to [action] in 3 steps"
   - "The framework that doubled [topic]"

4. **Curiosity Gap**
   - "The surprising truth about [topic]"
   - "What nobody tells you about [topic]"

5. **Straightforward** (60-87% opens)
   - "Business Insights - Nov 26"
   - "This Week's Top Stories"

## Newsletter Structure

Based on research showing 40% higher retention with 6 distinct sections:

1. **Personal Opening**: Conversational 1-2 sentence greeting
2. **The Insight**: Main psychology principle and key takeaways
3. **The Story**: Real-world example with numbers and results
4. **The Framework**: Actionable 3-step system (bullet points)
5. **One Action**: Single thing they can do today
6. **P.S.**: Bonus tip or additional resources

## Design Specifications

### Mobile-First
- Max width: 600px
- Single column layout
- 14-16px body text (minimum)
- 44x44px touch targets for buttons
- Responsive images
- Adequate padding and whitespace

### Dark Mode
- Automatic color inversion
- Background: `#1f2937` (dark)
- Text: `#f3f4f6` (light)
- Borders: `#374151` (medium)
- Tested in Apple Mail and Gmail

### Cross-Client Compatible
- Inline CSS (no external stylesheets)
- Table-based layout
- MSO conditionals for Outlook
- No advanced CSS (flexbox, grid)
- Tested in 10+ email clients

### Typography
- Font stack: System fonts (Apple, Segoe, Roboto)
- Line height: 1.6 (optimal readability)
- Headers: 1.3 line height
- Contrast: WCAG AA compliant

## Performance Metrics

Based on industry research and testing:

- **Target Open Rate**: 35-45% (vs 17-25% industry avg)
- **Subject Line Impact**: 47% of opens depend on subject
- **Single CTA**: 371% increase in clicks
- **Mobile Optimization**: 80% delete non-responsive emails
- **Read Time**: 3-5 minutes (optimal for business owners)

## Examples

### Basic Newsletter

```typescript
const template = generateNewsletter([
  {
    id: '1',
    title: 'How to Double Your Conversion Rate',
    url: 'https://example.com/article',
    content: 'Article content...',
    summary: 'Learn the framework that doubled our conversions',
    publishedAt: new Date(),
    source: 'blog'
  }
]);
```

### Customized Branding

```typescript
const template = generateNewsletter(articles, {
  brandName: 'Founder Weekly',
  brandColor: '#10b981',
  logoUrl: 'https://example.com/logo.png',
  footerText: 'Insights for ambitious founders',
  unsubscribeUrl: 'https://example.com/unsubscribe',
  socialLinks: {
    twitter: 'https://twitter.com/founderweekly',
    linkedin: 'https://linkedin.com/company/founderweekly',
    website: 'https://founderweekly.com'
  }
});
```

### A/B Testing Subject Lines

```typescript
const subjects = generateSubjectLines(articles);

// Send 20% of subscribers each variation
subjects.forEach((subject, index) => {
  sendToSegment(
    subscribers.slice(index * 0.2, (index + 1) * 0.2),
    { ...template, subject }
  );
});
```

## Best Practices

### Content
- Use 3-5 articles per newsletter
- Lead with strongest/most relevant article
- Include actionable frameworks
- Keep paragraphs short (2-3 sentences)
- Use bullet points for scannability

### Subject Lines
- Keep under 50 characters
- A/B test every send
- Avoid spam trigger words
- Front-load important words
- Use personalization authentically

### Design
- Test in dark mode
- Validate HTML (W3C)
- Test on 5+ email clients
- Compress images (<100KB)
- Include plain text version

### Timing
- Best days: Tuesday, Wednesday, Thursday
- Best time: 10-11 AM local time
- Test with your audience
- Consider send time optimization

## Troubleshooting

### Images Not Displaying
- Use absolute URLs
- Include alt text
- Test image hosting
- Consider inline base64 for small images

### Outlook Issues
- Check MSO conditionals
- Use table-based layout
- Avoid advanced CSS
- Test in Outlook.com and desktop app

### Dark Mode Problems
- Test in Apple Mail and Gmail
- Use `@media (prefers-color-scheme: dark)`
- Provide sufficient contrast
- Don't rely solely on dark mode styles

### Mobile Rendering
- Test on actual devices
- Use viewport meta tag
- Ensure touch targets are 44x44px
- Test loading speed

## Resources

- [ARCHITECTURE.md](../../../newsletter-system/ARCHITECTURE.md) - Full system architecture
- [newsletter-formats.md](../../../newsletter-system/research/newsletter-formats.md) - Format research
- [psychology-principles.md](../../../newsletter-system/research/psychology-principles.md) - Psychology research

## License

Part of the `@/lib/newsletter` package.
