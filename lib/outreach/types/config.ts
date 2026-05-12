/**
 * Configuration types for the outreach system
 */

import {
  OUTREACH_BUSINESS_HOURS_START,
  OUTREACH_BUSINESS_HOURS_END,
  OUTREACH_BUSINESS_DAYS,
  OUTREACH_DEFAULT_TIMEZONE,
  OUTREACH_EMAIL_2_DELAY_DAYS,
  OUTREACH_EMAIL_3_DELAY_DAYS,
  OUTREACH_SENDER_DAILY_LIMIT,
  OUTREACH_BATCH_SIZE,
} from "@/lib/constants";

/**
 * Database configuration
 */
export interface DatabaseConfig {
  databaseUrl: string;
}

/**
 * Resend configuration
 */
export interface ResendConfig {
  apiKey: string;
  webhookSecret?: string;
}

/**
 * Outreach system configuration
 */
export interface OutreachConfig {
  database: DatabaseConfig;
  resend: ResendConfig;
  apiKey?: string;
  cronSecret?: string;
}

/**
 * Business hours configuration
 */
export interface BusinessHoursConfig {
  start: number; // Fractional 24-hour format (e.g., 9 for 9:00 AM, 9.5 for 9:30 AM)
  end: number; // Fractional 24-hour format (e.g., 17 for 5:00 PM, 16.5 for 4:30 PM)
  days: number[]; // 0=Sunday, 1=Monday, etc.
  timezone?: string; // IANA timezone from campaign schedule (e.g., 'America/New_York')
}

/**
 * Default business hours: 9 AM - 5 PM, Monday-Friday
 */
export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  start: OUTREACH_BUSINESS_HOURS_START,
  end: OUTREACH_BUSINESS_HOURS_END,
  days: OUTREACH_BUSINESS_DAYS,
};

/**
 * Default timezone for contacts
 */
export const DEFAULT_TIMEZONE = OUTREACH_DEFAULT_TIMEZONE;

/**
 * Default email delays (in days)
 */
export const DEFAULT_EMAIL_2_DELAY = OUTREACH_EMAIL_2_DELAY_DAYS;
export const DEFAULT_EMAIL_3_DELAY = OUTREACH_EMAIL_3_DELAY_DAYS;

/**
 * Default sender daily limit
 */
export const DEFAULT_SENDER_DAILY_LIMIT = OUTREACH_SENDER_DAILY_LIMIT;

/**
 * Batch size for processing due emails
 */
export const DEFAULT_BATCH_SIZE = OUTREACH_BATCH_SIZE;
