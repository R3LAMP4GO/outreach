/**
 * Sending module types
 */

import type { Contact, Campaign } from "../types";

/**
 * Email to send
 */
export interface EmailToSend {
  contact: Contact;
  campaign: Campaign;
  emailNumber: 1 | 2 | 3;
  from: {
    email: string;
    name: string;
  };
  replyTo: string;
  subject: string;
  body: string;
}

/**
 * Send result
 */
export interface SendResult {
  success: boolean;
  contactId: string;
  emailNumber: number;
  resendId?: string;
  messageId?: string;
  error?: string;
}

/**
 * Batch send result
 */
export interface BatchSendResult {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  results: SendResult[];
}

/**
 * Email threading headers
 */
export interface ThreadingHeaders {
  "In-Reply-To"?: string;
  References?: string;
}
