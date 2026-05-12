/**
 * Campaign module types
 */

import type { Campaign, CampaignInsert, CampaignUpdate } from "../types";

/**
 * Campaign creation input
 */
export interface CreateCampaignInput {
  name: string;
  description?: string;
  from_email: string;
  from_name?: string;
  /** HTML/text template wrapping the AI-personalised email_1_body. Tokens: {{email_body}}, {{signature}}, {{unsubscribe_link}}. */
  email_1_template?: string;
  /** HTML/text template wrapping the AI-personalised email_2_body. */
  email_2_template?: string;
  /** HTML/text template wrapping the AI-personalised email_3_body. */
  email_3_template?: string;
  /** Optional campaign-level subject override for email 1 (falls back to contact.email_1_subject). */
  email_1_subject_template?: string;
  /** Optional campaign-level subject override for email 2 (falls back to contact.email_2_subject). */
  email_2_subject_template?: string;
  /** Optional campaign-level subject override for email 3 (falls back to contact.email_3_subject). */
  email_3_subject_template?: string;
  test_mode?: boolean;
  email_2_delay?: number;
  email_3_delay?: number;
  owner_id?: string;
}

/**
 * Campaign list filters
 */
export interface CampaignFilters {
  status?: Campaign["status"] | Campaign["status"][];
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Campaign statistics
 */
export interface CampaignStats {
  total_contacts: number;
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_replied: number;
  total_bounced: number;
  open_rate: number;
  reply_rate: number;
  bounce_rate: number;
}

/**
 * Campaign with computed stats
 */
export interface CampaignWithStats extends Campaign {
  stats: CampaignStats;
}

/**
 * Campaign list row — base Campaign plus a derived total_unsubscribed count
 * (no counter column exists on outreach_campaigns; aggregated from
 * outreach_contacts.unsubscribed_at by listCampaigns).
 */
export interface CampaignWithUnsubscribed extends Campaign {
  total_unsubscribed: number;
}

/**
 * Campaign stat field names for increments
 */
export type CampaignStatField =
  | "total_contacts"
  | "total_sent"
  | "total_delivered"
  | "total_opened"
  | "total_clicked"
  | "total_replied"
  | "total_bounced";

export type { Campaign, CampaignInsert, CampaignUpdate };
