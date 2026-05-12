/**
 * Generate Job Processor
 *
 * Processes newsletter generation jobs:
 * 1. Takes curated articles
 * 2. Generates HTML and text newsletter content
 * 3. Creates subject line variations
 * 4. Stores newsletter edition in database
 */

import { logger } from "../../logger";
import { GenerateJobData, GenerateJobResult } from "../types";
import { NewsletterGenerator } from "../../../modules/generation/template";

/**
 * Generate Job Processor
 *
 * Main processing function for generation jobs
 */
export async function processGenerateJob(data: GenerateJobData): Promise<GenerateJobResult> {
  const startTime = Date.now();
  const { campaignId, articles, templateId, userId } = data;

  logger.info(
    {
      campaignId,
      articleCount: articles.length,
      templateId,
      userId,
    },
    "Starting newsletter generation job",
  );

  try {
    // Step 1: Initialize template
    const template = new NewsletterGenerator({
      brandName: process.env.NEWSLETTER_BRAND_NAME || "Business Insights",
      brandColor: process.env.NEWSLETTER_BRAND_COLOR || "#0066CC",
      footerText: process.env.NEWSLETTER_FOOTER_TEXT,
    });

    // Step 2: Generate newsletter
    // Convert job data articles to full Article objects
    const fullArticles = articles.map((a) => ({
      id: a.id,
      title: a.title,
      url: a.url,
      content: a.summary || "",
      summary: a.summary,
      author: undefined,
      publishedAt: new Date(),
      source: a.source,
      engagement: undefined,
      metadata: undefined,
      enrichment: undefined,
      scores: undefined,
      status: "processed" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const newsletter = template.generate(fullArticles);

    // Step 3: Store newsletter
    // Generate newsletter ID
    const newsletterId = `newsletter_${campaignId}_${Date.now()}`;

    // In a real implementation, this would store to database
    // For now, we'll just return the data
    // await db.newsletters.create({
    //   id: newsletterId,
    //   campaignId,
    //   html: newsletter.html,
    //   text: newsletter.text,
    //   subject: newsletter.subject,
    //   articleIds: articles.map(a => a.id),
    //   createdAt: new Date(),
    //   userId,
    // });

    const result: GenerateJobResult = {
      success: true,
      newsletterId,
      html: newsletter.html,
      text: newsletter.text,
      subjectLines: [newsletter.subject], // Return as array for compatibility
      duration: Date.now() - startTime,
    };

    logger.info(
      {
        campaignId,
        newsletterId,
        duration: result.duration,
        htmlLength: result.html.length,
        textLength: result.text.length,
        subjectLineCount: result.subjectLines.length,
      },
      "Newsletter generation job completed successfully",
    );

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        campaignId,
        error: errorMessage,
        duration: Date.now() - startTime,
      },
      "Newsletter generation job failed",
    );

    return {
      success: false,
      newsletterId: "",
      html: "",
      text: "",
      subjectLines: [],
      duration: Date.now() - startTime,
      error: errorMessage,
    };
  }
}
