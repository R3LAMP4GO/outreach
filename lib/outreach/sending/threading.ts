/**
 * Email threading utilities
 */

import type { Contact } from "../types";
import type { ThreadingHeaders } from "./types";

/**
 * Generate threading headers for Email 2 to appear as reply to Email 1
 *
 * @param contact - Contact with email 1 message ID
 * @returns Threading headers or empty object
 *
 * @example
 * ```typescript
 * const headers = getThreadingHeaders(contact, 2)
 * // Returns { 'In-Reply-To': '<message-id>', 'References': '<message-id>' }
 * ```
 */
export function getThreadingHeaders(contact: Contact, emailNumber: number): ThreadingHeaders {
  // Only Email 2 should thread as reply to Email 1
  if (emailNumber !== 2 || !contact.email_1_message_id) {
    return {};
  }

  const messageId = `<${contact.email_1_message_id}>`;

  return {
    "In-Reply-To": messageId,
    References: messageId,
  };
}

/**
 * Get the subject line for an email, handling "Re:" prefix for threaded emails
 *
 * @param contact - Contact with email subjects
 * @param emailNumber - Which email to send (1, 2, or 3)
 * @returns Subject line
 *
 * @example
 * ```typescript
 * const subject = getEmailSubject(contact, 2)
 * // Returns "Re: Quick question" if email_2_subject is not set
 * ```
 */
export function getEmailSubject(contact: Contact, emailNumber: number): string {
  switch (emailNumber) {
    case 1:
      return contact.email_1_subject;

    case 2:
      // Use custom subject if provided, otherwise prepend "Re:" to email 1 subject
      return contact.email_2_subject || `Re: ${contact.email_1_subject}`;

    case 3:
      return contact.email_3_subject;

    default:
      throw new Error(`Invalid email number: ${emailNumber}`);
  }
}

/**
 * Get the email body for a specific email number
 *
 * @param contact - Contact with email bodies
 * @param emailNumber - Which email to send (1, 2, or 3)
 * @returns Email body HTML
 */
export function getEmailBody(contact: Contact, emailNumber: number): string {
  switch (emailNumber) {
    case 1:
      return contact.email_1_body;

    case 2:
      return contact.email_2_body;

    case 3:
      return contact.email_3_body;

    default:
      throw new Error(`Invalid email number: ${emailNumber}`);
  }
}

/**
 * Check if email should be threaded
 *
 * @param emailNumber - Which email to send
 * @returns True if should be threaded
 */
export function shouldThreadEmail(emailNumber: number): boolean {
  return emailNumber === 2;
}
