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
 * Check if email should be threaded
 *
 * @param emailNumber - Which email to send
 * @returns True if should be threaded
 */
export function shouldThreadEmail(emailNumber: number): boolean {
  return emailNumber === 2;
}
