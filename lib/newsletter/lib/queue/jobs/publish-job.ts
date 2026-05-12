/**
 * Publish Job Processor
 *
 * Processes newsletter publishing jobs:
 * 1. Load newsletter content
 * 2. Get subscriber list (with optional industry filtering)
 * 3. Send personalized emails using React Email templates
 * 4. Track send progress and errors
 * 5. Update database stats
 */

import { Resend } from "resend";
import { CuratedBriefNewsletter } from "../../../emails";
import { logger } from "../../logger";
import { PublishJobData, PublishJobResult } from "../types";
import { db } from "@/lib/db/worker";
import { newsletterSubscribers, newsletterEditions } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

/**
 * Batch size for email sending
 * Resend recommends batching to avoid rate limits
 */
const DEFAULT_BATCH_SIZE = 100;

/**
 * Delay between batches (ms)
 * Helps avoid hitting rate limits
 */
const BATCH_DELAY = 1000; // 1 second

/**
 * Subscriber data structure
 */
interface Subscriber {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  business_name?: string;
  industry?: string;
}

/**
 * Newsletter story structure
 */
interface NewsletterStory {
  headline: string;
  content: string;
  whyItMatters?: string;
  readMoreUrl?: string;
}

/**
 * Newsletter content structure
 */
interface Newsletter {
  id: string;
  campaignName: string;
  issueNumber: number;
  stories: NewsletterStory[];
}

/**
 * Extended publish options
 */
interface PublishOptions {
  campaignId: string;
  newsletterId: string;
  subscriberIds?: string[];
  targetIndustries?: string[];
  testMode?: boolean;
  testEmails?: string[];
  batchSize?: number;
  userId?: string;
}

/**
 * Initialize Resend client (Fallback for backward compatibility)
 *
 * DEPRECATED: This fallback uses process.env.RESEND_API_KEY for backward compatibility.
 * New code should pass a Resend client from the integration system instead.
 *
 * The main app uses the integration system (Settings → Integrations) as the single source of truth.
 * Workers should fetch the client at startup via getResendClient() from integration-client.
 */
function getResendClientFallback(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY environment variable not set. " +
        "Configure Resend via Settings → Integrations, or pass a Resend client to processPublishJob().",
    );
  }
  return new Resend(apiKey);
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get target subscribers based on options
 */
async function getTargetSubscribers(options: PublishOptions): Promise<Subscriber[]> {
  const conditions = [
    eq(newsletterSubscribers.verified, true),
    eq(newsletterSubscribers.unsubscribed, false),
  ];

  if (options.subscriberIds && options.subscriberIds.length > 0) {
    conditions.push(inArray(newsletterSubscribers.id, options.subscriberIds));
  }

  if (options.targetIndustries && options.targetIndustries.length > 0) {
    conditions.push(inArray(newsletterSubscribers.industry, options.targetIndustries));
  }

  if (options.testMode && options.testEmails && options.testEmails.length > 0) {
    conditions.push(inArray(newsletterSubscribers.email, options.testEmails));
  }

  const rows = await db
    .select({
      id: newsletterSubscribers.id,
      email: newsletterSubscribers.email,
      first_name: newsletterSubscribers.firstName,
      last_name: newsletterSubscribers.lastName,
      business_name: newsletterSubscribers.businessName,
      industry: newsletterSubscribers.industry,
    })
    .from(newsletterSubscribers)
    .where(and(...conditions));

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    first_name: r.first_name ?? undefined,
    last_name: r.last_name ?? undefined,
    business_name: r.business_name ?? undefined,
    industry: r.industry ?? undefined,
  }));
}

/**
 * Load newsletter content from database
 *
 * Loads from newsletter_editions table and reconstructs
 * newsletter content structure for email rendering.
 */
async function getNewsletterContent(newsletterId: string): Promise<Newsletter> {
  const rows = await db
    .select()
    .from(newsletterEditions)
    .where(eq(newsletterEditions.id, newsletterId))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(`Newsletter ${newsletterId} not found`);
  }

  const edition = rows[0];

  // Parse stats JSON to extract stories if available
  const stats = edition.stats as Record<string, unknown> | null;
  const stories: NewsletterStory[] = (stats?.stories as NewsletterStory[]) || [];

  return {
    id: edition.id,
    campaignName: edition.subject,
    issueNumber: 1,
    stories,
  };
}

/**
 * Generate subject line with personalization
 */
function generateSubjectLine(campaignName: string, firstName?: string): string {
  if (firstName) {
    return `${firstName}, here's what you need to know this week`;
  }
  return campaignName;
}

/**
 * Send newsletter to a batch of subscribers
 */
async function sendNewsletterBatch(
  subscribers: Subscriber[],
  newsletter: Newsletter,
  campaignId: string,
  resend: Resend,
): Promise<Array<{ success: boolean; email: string; error?: string }>> {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const emailPromises = subscribers.map(async (subscriber) => {
    try {
      // Dynamic import to avoid Turbopack bundling issues with prettier
      const { render } = await import("@react-email/render");

      // Render personalized newsletter using React Email template
      const emailHtml = await render(
        CuratedBriefNewsletter({
          firstName: subscriber.first_name,
          stories: newsletter.stories,
          date,
          email: subscriber.email,
          issueNumber: newsletter.issueNumber,
        }),
      );

      // Send via Resend
      await resend.emails.send({
        from: "Jake at __YOUR_BRAND__ <newsletter@email.__YOUR_DOMAIN__>",
        to: subscriber.email,
        subject: generateSubjectLine(newsletter.campaignName, subscriber.first_name),
        html: emailHtml,
        headers: {
          "X-Campaign-ID": campaignId,
          "X-Subscriber-ID": subscriber.id,
          "X-Newsletter-ID": newsletter.id,
        },
      });

      return { success: true, email: subscriber.email };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error, email: subscriber.email }, "Failed to send newsletter");
      return { success: false, email: subscriber.email, error: errorMessage };
    }
  });

  return await Promise.all(emailPromises);
}

/**
 * Publish Job Processor
 *
 * Main processing function for publish jobs.
 *
 * @param data - Publish job data
 * @param resendClient - Optional Resend client from integration system (recommended).
 *                       If not provided, falls back to process.env.RESEND_API_KEY.
 */
export async function processPublishJob(
  data: PublishJobData,
  resendClient?: Resend,
): Promise<PublishJobResult> {
  const startTime = Date.now();
  const { campaignId, newsletterId, subscriberIds, batchSize = DEFAULT_BATCH_SIZE, userId } = data;

  logger.info(
    {
      campaignId,
      newsletterId,
      subscriberCount: subscriberIds?.length,
      batchSize,
      userId,
    },
    "Starting newsletter publish job",
  );

  try {
    // Step 1: Load newsletter content
    const newsletter = await getNewsletterContent(newsletterId);

    // Step 2: Get subscriber list
    const options: PublishOptions = {
      campaignId,
      newsletterId,
      subscriberIds,
      batchSize,
      userId,
      targetIndustries: undefined,
      testMode: undefined,
      testEmails: undefined,
    };

    const subscribers = await getTargetSubscribers(options);

    if (subscribers.length === 0) {
      logger.warn({ campaignId, newsletterId }, "No subscribers to send to");
      return {
        success: false,
        sent: 0,
        failed: 0,
        duration: Date.now() - startTime,
        errors: [{ subscriberId: "none", error: "No subscribers found" }],
      };
    }

    // Step 3: Send emails in batches
    // Use provided Resend client from integration system, or fallback to env var
    const resend = resendClient ?? getResendClientFallback();
    let sent = 0;
    let failed = 0;
    const errors: Array<{ subscriberId: string; error: string }> = [];

    // Split subscribers into batches
    const batches: Subscriber[][] = [];
    for (let i = 0; i < subscribers.length; i += batchSize) {
      batches.push(subscribers.slice(i, i + batchSize));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      // Send batch with React Email templates
      const batchResults = await sendNewsletterBatch(batch, newsletter, campaignId, resend);

      // Process results
      for (const result of batchResults) {
        if (result.success) {
          sent++;
        } else {
          failed++;
          const subscriber = batch.find((s) => s.email === result.email);
          errors.push({
            subscriberId: subscriber?.id || "unknown",
            error: result.error || "Unknown error",
          });
        }
      }

      // Delay between batches to avoid rate limits
      if (batchIndex < batches.length - 1) {
        await sleep(BATCH_DELAY);
      }
    }

    // Step 4: Update newsletter edition status in the database
    const editionStatus = sent > 0 ? "sent" : "failed";
    const now = new Date().toISOString();
    await db
      .update(newsletterEditions)
      .set({
        status: editionStatus,
        sentAt: now,
        stats: {
          totalRecipients: subscribers.length,
          totalSent: sent,
          totalDelivered: 0,
          totalOpens: 0,
          totalClicks: 0,
          totalBounces: 0,
          openRate: 0,
          clickRate: 0,
          ctor: 0,
        },
        updatedAt: now,
      })
      .where(eq(newsletterEditions.id, newsletterId));

    // Step 5: Prepare result
    const result: PublishJobResult = {
      success: failed === 0,
      sent,
      failed,
      duration: Date.now() - startTime,
      errors: errors.length > 0 ? errors : undefined,
    };

    logger.info(
      {
        campaignId,
        newsletterId,
        sent,
        failed,
        duration: result.duration,
      },
      "Newsletter publish job completed",
    );

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        campaignId,
        newsletterId,
        error: errorMessage,
        duration: Date.now() - startTime,
      },
      "Newsletter publish job failed",
    );

    return {
      success: false,
      sent: 0,
      failed: 0,
      duration: Date.now() - startTime,
      errors: [{ subscriberId: "all", error: errorMessage }],
    };
  }
}
