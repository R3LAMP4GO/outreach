/**
 * Newsletter Email Template Generator
 *
 * Creates psychology-optimized newsletter emails with:
 * - Mobile-first responsive HTML design
 * - Dark mode support
 * - Gmail/Outlook compatibility
 * - Plain text versions
 * - Engaging subject lines
 */

// ============================================================================
// Types
// ============================================================================

export interface Article {
  id: string;
  title: string;
  url: string;
  content: string;
  author?: string;
  publishedAt: Date;
  source: string;
  engagement?: {
    upvotes?: number;
    comments?: number;
    shares?: number;
  };
  metadata?: Record<string, unknown>;

  // AI enrichment
  summary?: string;
  keyInsights?: string[];
  psychologyPrinciple?: string;
  actionableFramework?: string;

  // Scoring
  scores?: {
    relevance: number;
    engagement: number;
    quality: number;
    final: number;
  };
}

export interface NewsletterTemplate {
  subject: string;
  preheader: string;
  html: string;
  text: string;
  metadata: {
    articleCount: number;
    estimatedReadTime: string;
    generatedAt: Date;
  };
}

export interface GenerationOptions {
  brandName?: string;
  brandColor?: string;
  logoUrl?: string;
  footerText?: string;
  unsubscribeUrl?: string;
  webVersionUrl?: string;
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
    website?: string;
  };
}

// ============================================================================
// Subject Line Generator
// ============================================================================

export class SubjectLineGenerator {
  /**
   * Generate curiosity-driven subject lines based on psychological principles
   * Research shows: 47% of users decide to open based on subject line alone
   */
  static generate(articles: Article[]): string[] {
    if (articles.length === 0) return ["Your Weekly Business Insights"];

    const topArticle = articles[0];
    const variations: string[] = [];

    // Formula 1: Question-Based (37% higher open rates)
    variations.push(this.generateQuestion(topArticle));

    // Formula 2: Urgency/Scarcity
    variations.push(this.generateUrgency(topArticle));

    // Formula 3: Benefit-Driven
    variations.push(this.generateBenefit(topArticle));

    // Formula 4: Curiosity Gap
    variations.push(this.generateCuriosity(topArticle));

    // Formula 5: Boring/Straightforward (surprisingly effective: 60-87% open rates)
    variations.push(this.generateStraightforward());

    return variations;
  }

  private static generateQuestion(article: Article): string {
    const patterns = [
      `Why do ${this.extractTopic(article)}?`,
      `What if ${this.extractInsight(article)}?`,
      `Is ${this.extractTopic(article)} finally here?`,
      `How do top performers ${this.extractAction(article)}?`,
      `What's behind ${this.extractTopic(article)}?`,
    ];
    return this.selectRandom(patterns).substring(0, 50);
  }

  private static generateUrgency(article: Article): string {
    const patterns = [
      `This ${this.extractTopic(article)} changes everything`,
      `You're missing out on ${this.extractTopic(article)}`,
      `The ${this.extractTopic(article)} mistake costing you`,
      `Before you ${this.extractAction(article)}, read this`,
      `${this.extractTopic(article)}: What you need to know`,
    ];
    return this.selectRandom(patterns).substring(0, 50);
  }

  private static generateBenefit(article: Article): string {
    const patterns = [
      `How to ${this.extractAction(article)} in 3 steps`,
      `The framework that doubled ${this.extractTopic(article)}`,
      `3 ways to improve your ${this.extractTopic(article)}`,
      `Master ${this.extractTopic(article)} this week`,
      `The secret to ${this.extractAction(article)}`,
    ];
    return this.selectRandom(patterns).substring(0, 50);
  }

  private static generateCuriosity(article: Article): string {
    const patterns = [
      `The surprising truth about ${this.extractTopic(article)}`,
      `What nobody tells you about ${this.extractTopic(article)}`,
      `${this.extractTopic(article)}: The untold story`,
      `The psychology behind ${this.extractTopic(article)}`,
      `This ${this.extractTopic(article)} insight went viral`,
    ];
    return this.selectRandom(patterns).substring(0, 50);
  }

  private static generateStraightforward(): string {
    const date = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const patterns = [
      `Business Insights - ${date}`,
      `This Week's Top Stories`,
      `Weekly Newsletter - ${date}`,
      `Your Business Brief`,
      `Today's Must-Read Insights`,
    ];
    return this.selectRandom(patterns);
  }

  private static extractTopic(article: Article): string {
    // Extract key topic from title or summary
    const text = article.summary || article.title;
    const keywords = text
      .toLowerCase()
      .match(
        /\b(growth|marketing|sales|leadership|strategy|ai|productivity|conversion|customer|business|startup|revenue|automation|psychology)\b/gi,
      );

    if (keywords && keywords.length > 0) {
      return keywords[0];
    }

    return "business strategy";
  }

  private static extractInsight(article: Article): string {
    if (article.psychologyPrinciple) {
      return article.psychologyPrinciple.toLowerCase().substring(0, 30);
    }
    return "you changed your approach";
  }

  private static extractAction(_article: Article): string {
    const actionWords = ["grow", "scale", "improve", "optimize", "increase", "boost"];
    return this.selectRandom(actionWords);
  }

  private static selectRandom<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }
}

// ============================================================================
// Newsletter Template Generator
// ============================================================================

export class NewsletterGenerator {
  private options: GenerationOptions;

  constructor(options: GenerationOptions = {}) {
    this.options = {
      brandName: options.brandName || "Business Insights",
      brandColor: options.brandColor || "#2563eb",
      logoUrl: options.logoUrl,
      footerText: options.footerText || "Curated insights for ambitious business owners",
      unsubscribeUrl: options.unsubscribeUrl || "#",
      webVersionUrl: options.webVersionUrl,
      socialLinks: options.socialLinks || {},
    };
  }

  /**
   * Generate complete newsletter from articles
   * Following psychology-optimized structure from ARCHITECTURE.md
   */
  generate(articles: Article[]): NewsletterTemplate {
    if (articles.length === 0) {
      throw new Error("At least one article is required to generate a newsletter");
    }

    // Generate subject line variations (return best one)
    const subjectVariations = SubjectLineGenerator.generate(articles);
    const subject = subjectVariations[0]; // Use first (question-based for highest open rates)

    // Generate preheader (first 100 chars of top insight)
    const preheader = this.generatePreheader(articles[0]);

    // Calculate estimated read time
    const estimatedReadTime = this.calculateReadTime(articles);

    // Generate HTML and plain text versions
    const html = this.generateHTML(articles, subject);
    const text = this.generatePlainText(articles, subject);

    return {
      subject,
      preheader,
      html,
      text,
      metadata: {
        articleCount: articles.length,
        estimatedReadTime,
        generatedAt: new Date(),
      },
    };
  }

  private generatePreheader(article: Article): string {
    const text = article.summary || article.keyInsights?.[0] || article.title;
    return text.substring(0, 100).trim() + (text.length > 100 ? "..." : "");
  }

  private calculateReadTime(articles: Article[]): string {
    // Average reading speed: 200-250 words per minute
    const totalWords = articles.reduce((count, article) => {
      const words = (article.summary || article.content || "").split(/\s+/).length;
      return count + words;
    }, 0);

    const minutes = Math.ceil(totalWords / 225);
    return `${minutes} min read`;
  }

  // ============================================================================
  // HTML Email Generation
  // ============================================================================

  private generateHTML(articles: Article[], subject: string): string {
    const date = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${subject}</title>

  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->

  <style>
    /* Reset styles */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }

    /* Base styles */
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';
      font-size: 16px;
      line-height: 1.6;
      color: #1f2937;
      background-color: #f3f4f6;
    }

    /* Container */
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }

    /* Typography */
    h1, h2, h3, h4, h5, h6 {
      margin: 0;
      padding: 0;
      line-height: 1.3;
      font-weight: 700;
    }

    h1 { font-size: 28px; margin-bottom: 16px; }
    h2 { font-size: 24px; margin-bottom: 14px; }
    h3 { font-size: 20px; margin-bottom: 12px; }

    p {
      margin: 0 0 16px 0;
      font-size: 16px;
      line-height: 1.6;
    }

    a {
      color: ${this.options.brandColor};
      text-decoration: underline;
    }

    /* Sections */
    .header {
      padding: 32px 24px 24px 24px;
      background-color: #ffffff;
      border-bottom: 3px solid ${this.options.brandColor};
    }

    .content {
      padding: 32px 24px;
    }

    .section {
      margin-bottom: 32px;
      padding-bottom: 32px;
      border-bottom: 1px solid #e5e7eb;
    }

    .section:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }

    .section-icon {
      font-size: 24px;
      margin-right: 8px;
      vertical-align: middle;
    }

    .section-title {
      font-size: 20px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 16px;
      display: inline-block;
    }

    /* Buttons */
    .button {
      display: inline-block;
      padding: 14px 28px;
      background-color: ${this.options.brandColor};
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
      margin: 16px 0;
      text-align: center;
    }

    /* Lists */
    ul, ol {
      margin: 0 0 16px 0;
      padding-left: 24px;
    }

    li {
      margin-bottom: 8px;
      line-height: 1.6;
    }

    /* Footer */
    .footer {
      padding: 24px;
      background-color: #f9fafb;
      border-top: 1px solid #e5e7eb;
      font-size: 14px;
      color: #6b7280;
      text-align: center;
    }

    .footer a {
      color: #6b7280;
      text-decoration: underline;
    }

    .social-links {
      margin: 16px 0;
    }

    .social-links a {
      display: inline-block;
      margin: 0 8px;
      color: #6b7280;
      text-decoration: none;
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      body {
        background-color: #111827 !important;
        color: #f3f4f6 !important;
      }

      .email-container {
        background-color: #1f2937 !important;
      }

      .header {
        background-color: #1f2937 !important;
        color: #f3f4f6 !important;
      }

      .content {
        background-color: #1f2937 !important;
        color: #f3f4f6 !important;
      }

      .section {
        border-bottom-color: #374151 !important;
      }

      .section-title {
        color: #f3f4f6 !important;
      }

      .footer {
        background-color: #111827 !important;
        border-top-color: #374151 !important;
        color: #9ca3af !important;
      }

      h1, h2, h3, h4, h5, h6, p {
        color: #f3f4f6 !important;
      }
    }

    /* Mobile responsiveness */
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
      }

      .header,
      .content {
        padding: 24px 16px !important;
      }

      .footer {
        padding: 16px !important;
      }

      h1 { font-size: 24px !important; }
      h2 { font-size: 20px !important; }
      h3 { font-size: 18px !important; }

      .button {
        display: block !important;
        width: 100% !important;
        padding: 16px !important;
      }
    }
  </style>
</head>

<body style="margin: 0; padding: 0; width: 100%; background-color: #f3f4f6;">
  <!-- Preheader text (hidden but read by email clients) -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    ${this.generatePreheader(articles[0])}
  </div>

  <!-- Email wrapper -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6;">
    <tr>
      <td style="padding: 20px 0;">
        <!-- Email container -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" class="email-container" align="center" style="max-width: 600px; width: 100%; background-color: #ffffff;">

          <!-- Header -->
          <tr>
            <td class="header">
              ${
                this.options.webVersionUrl
                  ? `
              <div style="text-align: center; font-size: 12px; color: #6b7280; margin-bottom: 16px;">
                <a href="${this.options.webVersionUrl}" style="color: #6b7280;">View this email in your browser</a>
              </div>
              `
                  : ""
              }

              ${
                this.options.logoUrl
                  ? `
              <div style="text-align: center; margin-bottom: 16px;">
                <img src="${this.options.logoUrl}" alt="${this.options.brandName}" style="max-width: 150px; height: auto;" />
              </div>
              `
                  : ""
              }

              <h1 style="text-align: center; color: #111827; margin: 0 0 8px 0;">
                ${this.options.brandName}
              </h1>

              <p style="text-align: center; color: #6b7280; font-size: 14px; margin: 0;">
                ${date}
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td class="content">
              ${this.generatePersonalOpening()}

              ${this.generateInsightSection(articles[0])}

              ${articles.length > 1 ? this.generateStorySection(articles[1]) : ""}

              ${articles.length > 2 ? this.generateFrameworkSection(articles[2]) : ""}

              ${this.generateActionSection(articles[0])}

              ${this.generatePSSection(articles)}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="footer">
              <p style="margin: 0 0 16px 0;">
                ${this.options.footerText}
              </p>

              ${this.generateSocialLinks()}

              <p style="margin: 16px 0 0 0; font-size: 12px;">
                <a href="${this.options.unsubscribeUrl}">Unsubscribe</a> |
                <a href="#">Manage preferences</a>
              </p>

              <p style="margin: 8px 0 0 0; font-size: 12px; color: #9ca3af;">
                Generated with Claude Code<br>
                This newsletter was carefully curated for you
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private generatePersonalOpening(): string {
    const openings = [
      "Hey there,",
      "Happy to see you here,",
      "Welcome back,",
      "Good to have you,",
      "Here's what caught my attention this week:",
    ];

    const greetings = [
      "I've been digging through the latest insights and found something you'll love.",
      "This week's discoveries are too good not to share.",
      "I found some fascinating patterns worth your attention.",
      "Here's what the smartest business minds are talking about.",
      "Let's dive into what matters this week.",
    ];

    const greeting = openings[Math.floor(Math.random() * openings.length)];
    const intro = greetings[Math.floor(Math.random() * greetings.length)];

    return `
      <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
        ${greeting} ${intro}
      </p>
    `;
  }

  private generateInsightSection(article: Article): string {
    return `
      <div class="section">
        <h2 style="color: #111827;">
          <span class="section-icon">🧠</span>
          <span class="section-title">The Insight</span>
        </h2>

        <h3 style="color: #1f2937; margin-bottom: 12px;">
          ${article.title}
        </h3>

        <p style="font-size: 16px; line-height: 1.6; color: #374151;">
          ${article.summary || this.truncateText(article.content, 150)}
        </p>

        ${
          article.psychologyPrinciple
            ? `
        <p style="font-size: 16px; line-height: 1.6; color: #374151;">
          <strong>The Psychology:</strong> ${article.psychologyPrinciple}
        </p>
        `
            : ""
        }

        ${
          article.keyInsights && article.keyInsights.length > 0
            ? `
        <p style="margin-bottom: 8px; font-weight: 600;">Key Takeaways:</p>
        <ul style="margin: 0 0 16px 0; padding-left: 24px;">
          ${article.keyInsights
            .slice(0, 3)
            .map(
              (insight) => `
            <li style="margin-bottom: 8px; line-height: 1.6;">${insight}</li>
          `,
            )
            .join("")}
        </ul>
        `
            : ""
        }
      </div>
    `;
  }

  private generateStorySection(article: Article): string {
    return `
      <div class="section">
        <h2 style="color: #111827;">
          <span class="section-icon">📖</span>
          <span class="section-title">The Story</span>
        </h2>

        <h3 style="color: #1f2937; margin-bottom: 12px;">
          ${article.title}
        </h3>

        <p style="font-size: 16px; line-height: 1.6; color: #374151;">
          ${article.summary || this.truncateText(article.content, 200)}
        </p>

        ${
          article.engagement && (article.engagement.upvotes || article.engagement.comments)
            ? `
        <p style="font-size: 14px; color: #6b7280; margin-top: 12px;">
          ${article.engagement.upvotes ? `👍 ${article.engagement.upvotes} upvotes` : ""}
          ${article.engagement.upvotes && article.engagement.comments ? " • " : ""}
          ${article.engagement.comments ? `💬 ${article.engagement.comments} comments` : ""}
        </p>
        `
            : ""
        }

        <a href="${article.url}" class="button" style="background-color: ${this.options.brandColor}; color: #ffffff; text-decoration: none; display: inline-block; padding: 14px 28px; border-radius: 6px; font-weight: 600; margin-top: 16px;">
          Read the full story
        </a>
      </div>
    `;
  }

  private generateFrameworkSection(article: Article): string {
    return `
      <div class="section">
        <h2 style="color: #111827;">
          <span class="section-icon">⚡</span>
          <span class="section-title">The Framework</span>
        </h2>

        <h3 style="color: #1f2937; margin-bottom: 12px;">
          ${article.actionableFramework ? "How to Apply This" : article.title}
        </h3>

        ${
          article.actionableFramework
            ? `
        <p style="font-size: 16px; line-height: 1.6; color: #374151; margin-bottom: 16px;">
          ${article.actionableFramework}
        </p>
        `
            : `
        <p style="font-size: 16px; line-height: 1.6; color: #374151;">
          ${article.summary || this.truncateText(article.content, 200)}
        </p>
        `
        }

        ${
          article.keyInsights && article.keyInsights.length > 0
            ? `
        <ol style="margin: 16px 0; padding-left: 24px; color: #374151;">
          ${article.keyInsights
            .map(
              (insight) => `
            <li style="margin-bottom: 12px; line-height: 1.6;">${insight}</li>
          `,
            )
            .join("")}
        </ol>
        `
            : ""
        }

        <a href="${article.url}" style="color: ${this.options.brandColor}; text-decoration: underline; font-weight: 600;">
          Learn more about this framework →
        </a>
      </div>
    `;
  }

  private generateActionSection(_article: Article): string {
    const actions = [
      `Read the full article and identify one insight you can apply today.`,
      `Share this with your team and discuss how it applies to your business.`,
      `Bookmark this for your next strategy session.`,
      `Take 5 minutes to implement the framework outlined above.`,
      `Reflect on how this insight changes your current approach.`,
    ];

    const action = actions[Math.floor(Math.random() * actions.length)];

    return `
      <div class="section">
        <h2 style="color: #111827;">
          <span class="section-icon">🎯</span>
          <span class="section-title">One Action</span>
        </h2>

        <p style="font-size: 16px; line-height: 1.6; color: #374151; background-color: #f9fafb; padding: 16px; border-left: 4px solid ${this.options.brandColor}; margin: 0;">
          ${action}
        </p>
      </div>
    `;
  }

  private generatePSSection(articles: Article[]): string {
    const bonusTips = [
      "Bookmark this newsletter for future reference - these insights age well.",
      "Want more content like this? Reply and tell me what topics interest you most.",
      "Share this newsletter with a colleague who would find it valuable.",
      "Follow up on any of these articles - the full reads are worth your time.",
      'Save this email to your "business insights" folder for easy access later.',
    ];

    const tip = bonusTips[Math.floor(Math.random() * bonusTips.length)];

    // Get additional articles if available
    const additionalArticles = articles.slice(3, 6);

    return `
      <div style="margin-top: 32px; padding-top: 32px; border-top: 2px solid #e5e7eb;">
        <p style="font-size: 16px; line-height: 1.6; color: #374151; margin-bottom: 16px;">
          <strong>P.S.</strong> ${tip}
        </p>

        ${
          additionalArticles.length > 0
            ? `
        <p style="font-size: 14px; font-weight: 600; color: #6b7280; margin-bottom: 12px;">
          More Worth Reading:
        </p>
        <ul style="margin: 0; padding-left: 24px; font-size: 14px; color: #6b7280;">
          ${additionalArticles
            .map(
              (article) => `
            <li style="margin-bottom: 8px;">
              <a href="${article.url}" style="color: #6b7280; text-decoration: underline;">
                ${article.title}
              </a>
            </li>
          `,
            )
            .join("")}
        </ul>
        `
            : ""
        }
      </div>
    `;
  }

  private generateSocialLinks(): string {
    const links = this.options.socialLinks || {};

    if (!links.twitter && !links.linkedin && !links.website) {
      return "";
    }

    return `
      <div class="social-links" style="margin: 16px 0;">
        ${
          links.twitter
            ? `
        <a href="${links.twitter}" style="display: inline-block; margin: 0 8px; color: #6b7280; text-decoration: none;">
          Twitter
        </a>
        `
            : ""
        }

        ${
          links.linkedin
            ? `
        <a href="${links.linkedin}" style="display: inline-block; margin: 0 8px; color: #6b7280; text-decoration: none;">
          LinkedIn
        </a>
        `
            : ""
        }

        ${
          links.website
            ? `
        <a href="${links.website}" style="display: inline-block; margin: 0 8px; color: #6b7280; text-decoration: none;">
          Website
        </a>
        `
            : ""
        }
      </div>
    `;
  }

  // ============================================================================
  // Plain Text Generation
  // ============================================================================

  private generatePlainText(articles: Article[], _subject: string): string {
    const date = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const sections: string[] = [];

    // Header
    sections.push(`${this.options.brandName}`);
    sections.push(`${"=".repeat(this.options.brandName?.length ?? 0)}`);
    sections.push(date);
    sections.push("");

    if (this.options.webVersionUrl) {
      sections.push(`View this email in your browser: ${this.options.webVersionUrl}`);
      sections.push("");
    }

    // Personal opening
    sections.push("Hey there,");
    sections.push("I've been digging through the latest insights and found something you'll love.");
    sections.push("");

    // Main sections
    sections.push("━".repeat(60));
    sections.push("🧠 THE INSIGHT");
    sections.push("━".repeat(60));
    sections.push("");
    sections.push(articles[0].title);
    sections.push("");
    sections.push(articles[0].summary || this.truncateText(articles[0].content, 150));
    sections.push("");

    if (articles[0].psychologyPrinciple) {
      sections.push(`The Psychology: ${articles[0].psychologyPrinciple}`);
      sections.push("");
    }

    if (articles[0].keyInsights && articles[0].keyInsights.length > 0) {
      sections.push("Key Takeaways:");
      articles[0].keyInsights.slice(0, 3).forEach((insight) => {
        sections.push(`• ${insight}`);
      });
      sections.push("");
    }

    // Story section
    if (articles.length > 1) {
      sections.push("");
      sections.push("━".repeat(60));
      sections.push("📖 THE STORY");
      sections.push("━".repeat(60));
      sections.push("");
      sections.push(articles[1].title);
      sections.push("");
      sections.push(articles[1].summary || this.truncateText(articles[1].content, 200));
      sections.push("");
      sections.push(`Read more: ${articles[1].url}`);
      sections.push("");
    }

    // Framework section
    if (articles.length > 2) {
      sections.push("");
      sections.push("━".repeat(60));
      sections.push("⚡ THE FRAMEWORK");
      sections.push("━".repeat(60));
      sections.push("");
      sections.push(articles[2].title);
      sections.push("");

      if (articles[2].actionableFramework) {
        sections.push(articles[2].actionableFramework);
        sections.push("");
      }

      if (articles[2].keyInsights && articles[2].keyInsights.length > 0) {
        articles[2].keyInsights.forEach((insight, index) => {
          sections.push(`${index + 1}. ${insight}`);
        });
        sections.push("");
      }

      sections.push(`Learn more: ${articles[2].url}`);
      sections.push("");
    }

    // Action section
    sections.push("");
    sections.push("━".repeat(60));
    sections.push("🎯 ONE ACTION");
    sections.push("━".repeat(60));
    sections.push("");
    sections.push("Read the full article and identify one insight you can apply today.");
    sections.push("");

    // P.S. section
    sections.push("");
    sections.push("━".repeat(60));
    sections.push("");
    sections.push("P.S. Bookmark this newsletter for future reference - these insights age well.");
    sections.push("");

    // Additional articles
    const additionalArticles = articles.slice(3, 6);
    if (additionalArticles.length > 0) {
      sections.push("More Worth Reading:");
      sections.push("");
      additionalArticles.forEach((article) => {
        sections.push(`• ${article.title}`);
        sections.push(`  ${article.url}`);
        sections.push("");
      });
    }

    // Footer
    sections.push("");
    sections.push("━".repeat(60));
    sections.push("");
    sections.push(this.options.footerText || "");
    sections.push("");

    if (this.options.socialLinks?.twitter) {
      sections.push(`Twitter: ${this.options.socialLinks.twitter}`);
    }
    if (this.options.socialLinks?.linkedin) {
      sections.push(`LinkedIn: ${this.options.socialLinks.linkedin}`);
    }
    if (this.options.socialLinks?.website) {
      sections.push(`Website: ${this.options.socialLinks.website}`);
    }

    sections.push("");
    sections.push(`Unsubscribe: ${this.options.unsubscribeUrl}`);
    sections.push("");
    sections.push("Generated with Claude Code");
    sections.push("This newsletter was carefully curated for you");

    return sections.join("\n");
  }

  // ============================================================================
  // Utility Functions
  // ============================================================================

  private truncateText(text: string, maxLength: number): string {
    if (!text) return "";

    const cleaned = text.replace(/<[^>]*>/g, "").trim();

    if (cleaned.length <= maxLength) {
      return cleaned;
    }

    const truncated = cleaned.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");

    return (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + "...";
  }
}

// ============================================================================
// Export convenience function
// ============================================================================

/**
 * Generate a complete newsletter template from articles
 *
 * @example
 * ```typescript
 * const template = generateNewsletter(articles, {
 *   brandName: 'Daily Business Insights',
 *   brandColor: '#2563eb',
 *   unsubscribeUrl: 'https://example.com/unsubscribe'
 * });
 *
 * console.log(template.subject); // "Why do customers ignore your CTA?"
 * console.log(template.html); // Full HTML email
 * console.log(template.text); // Plain text version
 * ```
 */
export function generateNewsletter(
  articles: Article[],
  options?: GenerationOptions,
): NewsletterTemplate {
  const generator = new NewsletterGenerator(options);
  return generator.generate(articles);
}

/**
 * Generate multiple subject line variations for A/B testing
 *
 * @example
 * ```typescript
 * const subjects = generateSubjectLines(articles);
 * // Returns 5 variations:
 * // 1. Question-based
 * // 2. Urgency-driven
 * // 3. Benefit-focused
 * // 4. Curiosity gap
 * // 5. Straightforward
 * ```
 */
export function generateSubjectLines(articles: Article[]): string[] {
  return SubjectLineGenerator.generate(articles);
}
