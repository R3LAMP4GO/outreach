/**
 * Email Publisher
 *
 * Core email sending functionality using Resend API.
 * Supports individual sends, batch processing, rate limiting, and retry logic.
 */

import { Resend } from "resend";
import pino from "pino";
import type {
  EmailRecipient,
  EmailTemplate,
  EmailSendOptions,
  SendResult,
  BatchSendResult,
  RateLimitConfig,
  RetryConfig,
  UnsubscribeLink,
  BatchProcessingOptions,
  EmailValidationResult,
} from "./types";
import { RateLimiter, createResendRateLimiter } from "./rate-limiter";
import { retryWithBackoff, createDefaultRetryConfig } from "./retry";

const logger = pino({ name: "email-publisher" });

/**
 * Email publisher configuration
 */
export interface EmailPublisherConfig {
  apiKey: string;
  rateLimitConfig?: Partial<RateLimitConfig>;
  retryConfig?: Partial<RetryConfig>;
  enableRateLimiting?: boolean;
  enableRetry?: boolean;
}

/**
 * Email Publisher
 *
 * Production-ready email sending with:
 * - Resend API integration
 * - Rate limiting (respects API limits)
 * - Retry logic (exponential backoff)
 * - Batch processing
 * - CAN-SPAM compliance (unsubscribe links)
 * - Error handling and logging
 */
export class EmailPublisher {
  private readonly resend: Resend;
  private readonly rateLimiter?: RateLimiter;
  private readonly retryConfig: RetryConfig;
  private readonly enableRateLimiting: boolean;
  private readonly enableRetry: boolean;

  constructor(config: EmailPublisherConfig) {
    this.resend = new Resend(config.apiKey);
    this.enableRateLimiting = config.enableRateLimiting ?? true;
    this.enableRetry = config.enableRetry ?? true;

    // Initialize rate limiter
    if (this.enableRateLimiting) {
      this.rateLimiter = createResendRateLimiter(config.rateLimitConfig);
    }

    // Initialize retry config
    this.retryConfig = {
      ...createDefaultRetryConfig(),
      ...config.retryConfig,
    };

    logger.info(
      {
        enableRateLimiting: this.enableRateLimiting,
        enableRetry: this.enableRetry,
      },
      "Email publisher initialized",
    );
  }

  /**
   * Send email to single recipient
   *
   * @param recipient - Recipient information
   * @param template - Email template
   * @param options - Send options
   * @param unsubscribeLink - Unsubscribe link for CAN-SPAM compliance
   * @returns Send result
   */
  async sendToRecipient(
    recipient: EmailRecipient,
    template: EmailTemplate,
    options: EmailSendOptions,
    unsubscribeLink?: UnsubscribeLink,
  ): Promise<SendResult> {
    const startTime = Date.now();

    try {
      logger.debug(
        { recipientId: recipient.id, email: recipient.email },
        "Sending email to recipient",
      );

      // Validate email
      const validation = this.validateEmail(recipient.email);
      if (!validation.valid) {
        return {
          success: false,
          recipientId: recipient.id,
          email: recipient.email,
          error: validation.reason || "Invalid email address",
          errorCode: "INVALID_EMAIL",
          timestamp: new Date(),
        };
      }

      // Apply rate limiting
      if (this.enableRateLimiting && this.rateLimiter) {
        await this.rateLimiter.acquire();
      }

      // Prepare email content
      const html = unsubscribeLink
        ? this.addUnsubscribeFooter(template.html, unsubscribeLink)
        : template.html;

      // Send with retry logic
      const sendFn = async () => {
        const response = await this.resend.emails.send({
          from: `${options.from.name} <${options.from.email}>`,
          to: recipient.email,
          replyTo: template.replyTo || options.replyTo,
          subject: template.subject,
          html,
          text: template.text,
          headers: {
            ...options.headers,
            ...(unsubscribeLink && {
              "List-Unsubscribe": `<${unsubscribeLink.url}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }),
          },
          tags: options.tags,
          attachments: options.attachments,
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        return response;
      };

      const response = this.enableRetry
        ? await retryWithBackoff(sendFn, this.retryConfig, {
            recipientId: recipient.id,
            email: recipient.email,
          })
        : await sendFn();

      const duration = Date.now() - startTime;

      logger.info(
        {
          recipientId: recipient.id,
          email: recipient.email,
          resendId: response.data?.id,
          duration,
        },
        "Email sent successfully",
      );

      return {
        success: true,
        recipientId: recipient.id,
        email: recipient.email,
        resendId: response.data?.id,
        messageId: response.data?.id,
        timestamp: new Date(),
      };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const err = error as { message?: string; statusCode?: number };

      logger.error(
        {
          recipientId: recipient.id,
          email: recipient.email,
          error: err.message,
          statusCode: err.statusCode,
          duration,
        },
        "Failed to send email",
      );

      return {
        success: false,
        recipientId: recipient.id,
        email: recipient.email,
        error: err.message,
        errorCode: err.statusCode?.toString() || "SEND_FAILED",
        timestamp: new Date(),
      };
    }
  }

  /**
   * Send emails to multiple recipients (batch processing)
   *
   * Processes recipients in batches with rate limiting and error handling.
   * Continues processing even if individual sends fail.
   *
   * @param recipients - Array of recipients
   * @param template - Email template
   * @param options - Send options
   * @param unsubscribeLink - Unsubscribe link generator function
   * @param batchOptions - Batch processing options
   * @returns Batch send result
   */
  async sendBatch(
    recipients: EmailRecipient[],
    template: EmailTemplate,
    options: EmailSendOptions,
    unsubscribeLink?: (recipient: EmailRecipient) => UnsubscribeLink,
    batchOptions?: Partial<BatchProcessingOptions>,
  ): Promise<BatchSendResult> {
    const startedAt = new Date();
    const config: BatchProcessingOptions = {
      batchSize: 100,
      concurrency: 5,
      delayBetweenBatches: 1000,
      stopOnError: false,
      ...batchOptions,
    };

    logger.info(
      {
        recipientCount: recipients.length,
        batchSize: config.batchSize,
        concurrency: config.concurrency,
      },
      "Starting batch email send",
    );

    const results: SendResult[] = [];
    const errors: Array<{ email: string; error: string; code?: string }> = [];

    // Process in batches
    const batches = this.chunkArray(recipients, config.batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      logger.debug(
        { batchIndex: i + 1, totalBatches: batches.length, batchSize: batch.length },
        "Processing batch",
      );

      // Process batch with concurrency limit
      const batchResults = await this.processBatchConcurrently(
        batch,
        template,
        options,
        unsubscribeLink,
        config.concurrency,
      );

      results.push(...batchResults);

      // Collect errors
      batchResults.forEach((result) => {
        if (!result.success && result.error) {
          errors.push({
            email: result.email,
            error: result.error,
            code: result.errorCode,
          });
        }
      });

      // Stop on error if configured
      if (config.stopOnError && errors.length > 0) {
        logger.warn({ errorsCount: errors.length }, "Stopping batch processing due to errors");
        break;
      }

      // Delay between batches (except for last batch)
      if (i < batches.length - 1 && config.delayBetweenBatches > 0) {
        await this.sleep(config.delayBetweenBatches);
      }
    }

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    const sent = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const skipped = recipients.length - results.length;

    logger.info(
      {
        total: recipients.length,
        sent,
        failed,
        skipped,
        duration,
        errorRate: failed / recipients.length,
      },
      "Batch email send completed",
    );

    return {
      total: recipients.length,
      sent,
      failed,
      skipped,
      results,
      errors,
      startedAt,
      completedAt,
      duration,
    };
  }

  /**
   * Process batch of recipients concurrently
   */
  private async processBatchConcurrently(
    recipients: EmailRecipient[],
    template: EmailTemplate,
    options: EmailSendOptions,
    unsubscribeLink?: (recipient: EmailRecipient) => UnsubscribeLink,
    concurrency: number = 5,
  ): Promise<SendResult[]> {
    const results: SendResult[] = [];

    // Process in chunks of concurrent requests
    for (let i = 0; i < recipients.length; i += concurrency) {
      const chunk = recipients.slice(i, i + concurrency);

      const chunkResults = await Promise.all(
        chunk.map((recipient) =>
          this.sendToRecipient(
            recipient,
            template,
            options,
            unsubscribeLink ? unsubscribeLink(recipient) : undefined,
          ),
        ),
      );

      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * Validate email address
   */
  private validateEmail(email: string): EmailValidationResult {
    // Basic email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return {
        valid: false,
        email,
        reason: "Invalid email format",
      };
    }

    // Check for common typos
    const commonTypos = [".con", ".cmo", "@gmial", "@yahooo", "@gmai.com"];
    if (commonTypos.some((typo) => email.includes(typo))) {
      return {
        valid: false,
        email,
        reason: "Possible email typo detected",
      };
    }

    return {
      valid: true,
      email,
    };
  }

  /**
   * Add unsubscribe footer to email HTML (CAN-SPAM compliance)
   */
  private addUnsubscribeFooter(html: string, unsubscribeLink: UnsubscribeLink): string {
    const footer = `
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center;">
        <p style="margin: 0 0 8px 0;">
          You're receiving this because you subscribed to our newsletter.
        </p>
        <p style="margin: 0;">
          <a href="${unsubscribeLink.url}" style="color: #6b7280; text-decoration: underline;">
            ${unsubscribeLink.text}
          </a>
        </p>
      </div>
    `;

    // Insert footer before closing body tag, or append if no body tag
    if (html.includes("</body>")) {
      return html.replace("</body>", `${footer}</body>`);
    }

    return html + footer;
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get rate limiter stats (if enabled)
   */
  getRateLimiterStats() {
    return this.rateLimiter?.getStats();
  }

  /**
   * Reset rate limiter (useful for testing)
   */
  resetRateLimiter(): void {
    this.rateLimiter?.reset();
  }
}

/**
 * Create email publisher with default configuration
 */
export function createEmailPublisher(
  apiKey: string,
  config?: Partial<EmailPublisherConfig>,
): EmailPublisher {
  return new EmailPublisher({
    apiKey,
    ...config,
  });
}
