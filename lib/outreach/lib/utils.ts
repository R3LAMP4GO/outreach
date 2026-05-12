/**
 * Utility functions for the outreach system
 */

import crypto from "crypto";
import { logger } from "@/lib/logger";

/**
 * Validates an email address format
 *
 * @param email - Email address to validate
 * @returns True if valid email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * @deprecated DO NOT USE FOR NEW SENDS. Outgoing emails MUST use the
 * sender's plain mailbox as Reply-To so replies land in the real inbox
 * and recipients don't see ugly `reply+UUID@...` addresses (which look
 * like spam / fake senders).
 *
 * Reply matching is now done via the In-Reply-To / References Message-ID
 * headers — see lib/outreach/webhooks/events/received.ts.
 *
 * This helper is kept ONLY so {@link extractContactIdFromReplyTo} below
 * can still match LEGACY inbound replies that were originally sent with
 * the old reply+UUID@ scheme. Once those legacy threads die out, both
 * functions can be deleted.
 */
export function generateReplyToAddress(contactId: string, domain: string): string {
  return `reply+${contactId}@${domain}`;
}

/**
 * Extracts contact ID from a legacy reply+UUID@ reply-to address.
 *
 * Used only as a backstop in the inbound webhook handler for replies to
 * emails that were sent BEFORE the Reply-To simplification. New sends do
 * not produce these addresses — see {@link generateReplyToAddress}.
 */
export function extractContactIdFromReplyTo(replyToAddress: string): string | null {
  const match = replyToAddress.match(/reply\+([a-f0-9-]+)@/);
  return match ? match[1] : null;
}

/**
 * Safely parses JSON with error handling
 *
 * @param json - JSON string to parse
 * @returns Parsed object or null if parsing fails
 */
export function safeJsonParse<T = unknown>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    console.error("JSON parse error:", error);
    return null;
  }
}

/**
 * Delays execution for a specified number of milliseconds
 *
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chunks an array into smaller arrays of specified size
 *
 * @param array - Array to chunk
 * @param size - Size of each chunk
 * @returns Array of chunks
 *
 * @example
 * ```typescript
 * const chunks = chunkArray([1, 2, 3, 4, 5], 2)
 * // Returns: [[1, 2], [3, 4], [5]]
 * ```
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Formats a full name from first and last name
 *
 * @param firstName - First name
 * @param lastName - Last name
 * @returns Full name or empty string
 */
export function formatFullName(firstName?: string | null, lastName?: string | null): string {
  const parts = [firstName, lastName].filter(Boolean);
  return parts.join(" ");
}

/**
 * Sanitizes HTML to prevent XSS attacks
 * This is a basic implementation - consider using a library like DOMPurify for production
 *
 * @param html - HTML string to sanitize
 * @returns Sanitized HTML
 */
export function sanitizeHtml(html: string): string {
  // Basic sanitization - remove script tags and event handlers
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/on\w+\s*=\s*[^\s>]*/gi, "");
}

/**
 * Generates a random string of specified length
 *
 * @param length - Length of random string
 * @returns Random string
 */
export function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generic email providers that should not be treated as companies
 * Used for company-wide reply stop feature
 */
const GENERIC_EMAIL_PROVIDERS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "protonmail.com",
  "proton.me",
  "aol.com",
  "mail.com",
  "zoho.com",
]);

/**
 * Extracts company domain from an email address
 * Returns null for generic email providers (gmail, outlook, etc.)
 *
 * @param email - Email address
 * @returns Company domain or null if generic provider
 *
 * @example
 * ```typescript
 * getCompanyDomain('john@acme.com') // Returns: 'acme.com'
 * getCompanyDomain('jane@gmail.com') // Returns: null (generic provider)
 * ```
 */
export function getCompanyDomain(email: string): string | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain || GENERIC_EMAIL_PROVIDERS.has(domain)) {
    return null;
  }
  return domain;
}

/**
 * Validates a list of email addresses
 *
 * @param emails - Array of email addresses
 * @returns Object with valid and invalid email arrays
 *
 * @example
 * ```typescript
 * const result = validateEmailList(['john@example.com', 'invalid-email', 'jane@company.com'])
 * // Returns: { valid: ['john@example.com', 'jane@company.com'], invalid: ['invalid-email'] }
 * ```
 */
export function validateEmailList(emails: string[]): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const email of emails) {
    const trimmed = email.trim();
    if (isValidEmail(trimmed)) {
      valid.push(trimmed);
    } else {
      invalid.push(trimmed);
    }
  }

  return { valid, invalid };
}

/**
 * Converts an HTML string to plain text
 *
 * Strips all HTML tags, converts line-break elements (`<br>`, `<br/>`, `<br />`)
 * and closing `</p>` tags to newlines, decodes common HTML entities, and trims
 * the result. Consecutive newlines are collapsed to a maximum of two.
 *
 * @param html - HTML string to convert
 * @returns Plain text representation of the HTML
 *
 * @example
 * ```typescript
 * htmlToPlainText('<p>Hello &amp; welcome</p><p>Line two</p>')
 * // Returns: 'Hello & welcome\n\nLine two'
 * ```
 */
export function htmlToPlainText(html: string): string {
  let text = html;

  // Convert <br>, <br/>, <br /> to newlines
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Convert block-level closing tags to newlines
  text = text.replace(/<\/p>/gi, "\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(/<\/(?:h[1-6]|div|tr)>/gi, "\n");

  // Preserve anchor tag URLs: <a href="url">text</a> → text: url
  text = text.replace(/<a\s[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, (_, url, linkText) => {
    const cleanText = linkText.replace(/<[^>]*>/g, "").trim();
    if (cleanText && cleanText !== url) {
      return `${cleanText}: ${url}`;
    }
    return url;
  });

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]*>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Collapse multiple consecutive newlines to max 2
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

/**
 * Generates a signed HMAC token for an unsubscribe URL
 * Prevents arbitrary contact IDs from being used to unsubscribe without a valid link
 */
export function generateUnsubscribeToken(contactId: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) {
    throw new Error("UNSUBSCRIBE_SECRET environment variable is not set");
  }
  return crypto.createHmac("sha256", secret).update(contactId).digest("hex").slice(0, 32);
}

/**
 * Verifies an unsubscribe token against a contact ID
 */
export function verifyUnsubscribeToken(contactId: string, token: string): boolean {
  if (!/^[0-9a-f]{32}$/i.test(token)) return false;
  try {
    const expected = generateUnsubscribeToken(contactId);
    return crypto.timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
  } catch (err) {
    logger.warn("verifyUnsubscribeToken failed for contact", contactId, err);
    return false;
  }
}
