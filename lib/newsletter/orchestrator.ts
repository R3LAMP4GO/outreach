/**
 * Newsletter Orchestrator
 *
 * Coordinates the full newsletter generation workflow:
 * 1. Fetch articles from RSS feeds
 * 2. Deduplicate and score articles
 * 3. Summarize top articles with Claude AI
 * 4. Generate newsletter HTML/text templates
 * 5. Store in database
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db/worker";
import { newsletterEditions } from "@/lib/db/schema";
import Parser from "rss-parser";
import crypto from "crypto";

// Types
interface OrchestratorConfig {
  anthropicApiKey: string;
}

interface GenerateOptions {
  campaignId?: string;
  manual?: boolean;
  userId: string;
  campaignConfig?: CampaignConfig;
}

export interface CampaignConfig {
  id: string;
  name: string;
  sources: Array<{
    type: string;
    config: Record<string, unknown>;
  }>;
  article_limit: number;
  summarizer_model: string;
  psychology_mode: string;
}

interface Article {
  id: string;
  title: string;
  url: string;
  content: string;
  publishedAt: Date;
  source: string;
  score?: number;
}

interface EnrichedArticle extends Article {
  summary: string;
  keyInsights: string[];
  psychologyPrinciple: string;
}

interface NewsletterResult {
  newsletterId: string;
  subject: string;
  html: string;
  articleCount: number;
}

// Default RSS sources
const DEFAULT_RSS_SOURCES = [
  { name: "Harvard Business Review", url: "https://feeds.hbr.org/harvardbusiness", type: "rss" },
  { name: "MIT Sloan Management Review", url: "https://sloanreview.mit.edu/feed/", type: "rss" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/", type: "rss" },
  { name: "Fast Company", url: "https://www.fastcompany.com/latest/rss", type: "rss" },
];

/**
 * Newsletter orchestrator class
 */
class NewsletterOrchestrator {
  private anthropic: Anthropic;
  private rssParser: Parser;

  constructor(config: OrchestratorConfig) {
    this.anthropic = new Anthropic({
      apiKey: config.anthropicApiKey,
    });

    this.rssParser = new Parser({
      timeout: 10000,
      headers: {
        "User-Agent": "CoastalPrograms-Newsletter/1.0",
      },
    });
  }

  /**
   * Generate a complete newsletter
   */
  async generateNewsletter(options: GenerateOptions): Promise<NewsletterResult> {
    console.log("Starting newsletter generation workflow...");

    // 1. Fetch articles from sources
    const articles = await this.fetchArticles(options);
    console.log(`Fetched ${articles.length} articles`);

    if (articles.length === 0) {
      throw new Error("No articles found from sources");
    }

    // 2. Deduplicate and score articles
    const scoredArticles = await this.scoreArticles(articles);
    console.log(`Scored articles, top score: ${scoredArticles[0]?.score || 0}`);

    // 3. Select top articles
    const topArticles = scoredArticles.slice(0, 15);
    console.log(`Selected top ${topArticles.length} articles for summarization`);

    // 4. Summarize articles with AI
    const enrichedArticles = await this.summarizeArticles(
      topArticles,
      options.campaignConfig?.summarizer_model || "claude-3-5-sonnet-20241022",
    );
    console.log(`Enriched ${enrichedArticles.length} articles with AI summaries`);

    // 5. Generate newsletter content
    const newsletter = await this.generateNewsletterContent(
      enrichedArticles,
      options.campaignConfig?.psychology_mode || "curiosity-driven",
    );
    console.log("Generated newsletter content");

    // 6. Store in database
    const newsletterId = await this.storeNewsletter(
      newsletter,
      options.campaignId,
      enrichedArticles,
    );
    console.log(`Stored newsletter with ID: ${newsletterId}`);

    return {
      newsletterId,
      subject: newsletter.subject,
      html: newsletter.html,
      articleCount: enrichedArticles.length,
    };
  }

  /**
   * Fetch articles from RSS feeds
   */
  private async fetchArticles(options: GenerateOptions): Promise<Article[]> {
    const sources =
      options.campaignConfig?.sources ||
      DEFAULT_RSS_SOURCES.map((s) => ({ type: "rss", config: { url: s.url, name: s.name } }));

    const allArticles: Article[] = [];
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const source of sources) {
      try {
        if (source.type === "rss" && source.config.url) {
          const feed = await this.rssParser.parseURL(source.config.url as string);

          for (const item of feed.items) {
            if (!item.title || !item.link) continue;

            const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();

            // Only include articles from the last 24 hours
            if (publishedAt < oneDayAgo) continue;

            const article: Article = {
              id: this.generateArticleId(item.link),
              title: item.title,
              url: item.link,
              content: item.contentSnippet || item.content || "",
              publishedAt,
              source: (source.config.name as string) || "RSS",
            };

            allArticles.push(article);
          }
        }
      } catch (error) {
        console.error(`Failed to fetch from ${source.config.url}:`, error);
        // Continue with other sources
      }
    }

    return allArticles;
  }

  /**
   * Score and rank articles
   */
  private async scoreArticles(articles: Article[]): Promise<Article[]> {
    const now = Date.now();

    // Simple scoring algorithm
    const scoredArticles = articles.map((article) => {
      const recencyHours = (now - article.publishedAt.getTime()) / (1000 * 60 * 60);
      const recencyScore = Math.max(0, 1 - recencyHours / 24); // 0-1 based on age

      const contentLength = article.content.length;
      const contentScore = Math.min(1, contentLength / 1000); // 0-1 based on content length

      const titleLength = article.title.length;
      const titleScore = titleLength >= 30 && titleLength <= 100 ? 1 : 0.5;

      // Weighted final score
      const finalScore = recencyScore * 0.4 + contentScore * 0.4 + titleScore * 0.2;

      return {
        ...article,
        score: finalScore,
      };
    });

    // Sort by score descending
    return scoredArticles.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  /**
   * Summarize articles with Claude AI
   */
  private async summarizeArticles(articles: Article[], model: string): Promise<EnrichedArticle[]> {
    const enrichedArticles: EnrichedArticle[] = [];

    for (const article of articles) {
      try {
        const response = await this.anthropic.messages.create({
          model,
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: `Analyze this article and provide:
1. A concise 2-3 sentence summary
2. 3 key insights (each max 15 words)
3. One psychology principle that explains why this matters

Article:
Title: ${article.title}
Content: ${article.content.slice(0, 2000)}

Respond in JSON format:
{
  "summary": "...",
  "keyInsights": ["...", "...", "..."],
  "psychologyPrinciple": "..."
}`,
            },
          ],
        });

        const content = response.content[0];
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);

          enrichedArticles.push({
            ...article,
            summary: parsed.summary,
            keyInsights: parsed.keyInsights,
            psychologyPrinciple: parsed.psychologyPrinciple,
          });
        }
      } catch (error) {
        console.error(`Failed to summarize article ${article.id}:`, error);
        // Include article without enrichment
        enrichedArticles.push({
          ...article,
          summary: article.content.slice(0, 200),
          keyInsights: [],
          psychologyPrinciple: "",
        });
      }

      // Rate limiting: wait 500ms between API calls
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return enrichedArticles;
  }

  /**
   * Generate newsletter HTML and text content
   */
  private async generateNewsletterContent(
    articles: EnrichedArticle[],
    psychologyMode: string,
  ): Promise<{ subject: string; preheader: string; html: string; text: string }> {
    // Generate subject line with AI
    const subjectResponse = await this.anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Generate 3 compelling newsletter subject lines based on these article titles:
${articles
  .slice(0, 5)
  .map((a) => `- ${a.title}`)
  .join("\n")}

Psychology mode: ${psychologyMode}
Each subject should be 40-60 characters and use ${psychologyMode} principles.

Respond in JSON format:
{
  "subjects": ["...", "...", "..."]
}`,
        },
      ],
    });

    const subjectContent = subjectResponse.content[0];
    let subject = "This Week in Business & Technology";

    if (subjectContent.type === "text") {
      const parsed = JSON.parse(subjectContent.text);
      subject = parsed.subjects[0];
    }

    // Generate preheader
    const preheader = `${articles.length} curated insights to transform your business thinking`;

    // Generate HTML content
    const html = this.generateHTML(subject, preheader, articles);

    // Generate text content
    const text = this.generateText(subject, articles);

    return { subject, preheader, html, text };
  }

  /**
   * Generate HTML email template
   */
  private generateHTML(subject: string, preheader: string, articles: EnrichedArticle[]): string {
    const articlesHTML = articles
      .map(
        (article, index) => `
      <div style="margin-bottom: 32px; padding-bottom: 32px; border-bottom: 1px solid #e5e7eb;">
        <h2 style="color: #1a1a1a; font-size: 20px; font-weight: 600; margin: 0 0 12px 0;">
          ${index + 1}. ${article.title}
        </h2>
        <p style="color: #666; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
          ${article.summary}
        </p>
        ${
          article.keyInsights.length > 0
            ? `
        <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <strong style="color: #374151; font-size: 14px;">Key Insights:</strong>
          <ul style="margin: 8px 0 0 0; padding-left: 20px;">
            ${article.keyInsights.map((insight) => `<li style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">${insight}</li>`).join("")}
          </ul>
        </div>
        `
            : ""
        }
        <a href="${article.url}" style="color: #3B82F6; text-decoration: none; font-weight: 500; font-size: 14px;">
          Read full article →
        </a>
      </div>
    `,
      )
      .join("");

    return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(to bottom, #f9fafb, #ffffff); border: 3px solid #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <h1 style="color: #1a1a1a; font-size: 28px; font-weight: 300; margin: 0 0 16px 0;">${subject}</h1>

      <p style="color: #666; font-size: 16px; margin: 0 0 32px 0; font-style: italic;">
        ${preheader}
      </p>

      <p style="color: #666; font-size: 16px; margin: 0 0 32px 0;">
        Hi {{first_name}},
      </p>

      <p style="color: #666; font-size: 16px; margin: 0 0 32px 0;">
        This week's curated insights to help you think differently about business, technology, and innovation.
      </p>

      ${articlesHTML}

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">

      <div style="text-align: center;">
        <p style="color: #374151; font-size: 14px; margin: 0 0 16px 0;">
          __YOUR_BRAND__ - Business Automation & AI Solutions
        </p>
        <p style="color: #6B7280; font-size: 12px; margin: 0 0 16px 0;">
          © ${new Date().getFullYear()} __YOUR_BRAND__ • Australian Business • All rights reserved
        </p>
        <p style="color: #6B7280; font-size: 10px; margin: 0;">
          <a href="{{unsubscribe_url}}" style="color: #3B82F6; text-decoration: none;">Unsubscribe</a>
        </p>
      </div>
    </div>
  </body>
</html>
    `.trim();
  }

  /**
   * Generate plain text email template
   */
  private generateText(subject: string, articles: EnrichedArticle[]): string {
    const articlesText = articles
      .map((article, index) =>
        `
${index + 1}. ${article.title}

${article.summary}

${article.keyInsights.length > 0 ? `Key Insights:\n${article.keyInsights.map((i) => `- ${i}`).join("\n")}\n` : ""}
Read more: ${article.url}

${"=".repeat(60)}
    `.trim(),
      )
      .join("\n\n");

    return `
${subject}

Hi {{first_name}},

This week's curated insights to help you think differently about business, technology, and innovation.

${articlesText}

---

__YOUR_BRAND__ - Business Automation & AI Solutions
© ${new Date().getFullYear()} __YOUR_BRAND__

Unsubscribe: {{unsubscribe_url}}
    `.trim();
  }

  /**
   * Store newsletter in database
   */
  private async storeNewsletter(
    newsletter: { subject: string; preheader: string; html: string; text: string },
    campaignId: string | undefined,
    articles: EnrichedArticle[],
  ): Promise<string> {
    const result = await db
      .insert(newsletterEditions)
      .values({
        campaignId: campaignId || null,
        subject: newsletter.subject,
        preheader: newsletter.preheader,
        contentHtml: newsletter.html,
        contentText: newsletter.text,
        articleCount: articles.length,
        curatedArticles: articles.map((a) => a.id),
        status: "draft",
      })
      .returning({ id: newsletterEditions.id });

    if (result.length === 0) {
      throw new Error("Failed to store newsletter in database");
    }

    return result[0].id;
  }

  /**
   * Generate consistent article ID from URL
   */
  private generateArticleId(url: string): string {
    return crypto.createHash("sha256").update(url).digest("hex").slice(0, 16);
  }
}

/**
 * Factory function to create orchestrator
 */
export function createNewsletterOrchestrator(config: OrchestratorConfig): NewsletterOrchestrator {
  return new NewsletterOrchestrator(config);
}
