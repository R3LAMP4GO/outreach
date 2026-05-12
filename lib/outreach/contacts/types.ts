/**
 * Contact module types
 */

import type { Contact, ContactInsert, ContactUpdate } from "../types";

/**
 * Contact import input from n8n
 */
export interface ImportContactInput {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  job_title?: string;
  seniority?: string;
  phone?: string;
  mobile?: string; // n8n compatibility - maps to phone field
  location?: string;
  website_url?: string;
  linkedin_url?: string;
  industry?: string;
  company_size?: string;
  company_revenue?: number;
  founded_year?: number;
  email_provider?: string;
  email_security_gateway?: string;
  security_tier?: string;
  security_level?: string;
  opt_out?: boolean;
  research_report?: string;
  email_1_subject: string;
  email_1_body: string;
  email_2_subject?: string; // Optional - defaults to "Re: {email_1_subject}" for email threading
  email_2_body: string;
  email_3_subject: string;
  email_3_body: string;
  sender_account_id?: string;
  timezone?: string;
  security_gateway?: string; // N8N alias for email_security_gateway
}

/**
 * Bulk import result
 */
export interface ImportResult {
  success: boolean;
  imported: number;
  duplicates: number;
  blocked: number;
  errors: ImportError[];
}

/**
 * Import error details
 */
export interface ImportError {
  email: string;
  reason: string;
  details?: string;
}

/**
 * Contact list filters
 */
export interface ContactFilters {
  campaign_id?: string;
  status?: Contact["status"] | Contact["status"][];
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Contact action types
 */
export type ContactAction = "pause" | "resume" | "mark_replied" | "unsubscribe";

export type { Contact, ContactInsert, ContactUpdate };
