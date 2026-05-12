/**
 * Contact database queries
 */

import { eq, and, or, ilike, inArray, desc, asc, sql, isNotNull, lte, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachContacts, outreachBlocklist } from "@/lib/db/schema";
import type { Contact, ContactFilters } from "./types";
import { escapeForPostgresLike } from "@/lib/security/input-validation";
import { toSnakeCase, toSnakeCaseArray } from "../lib/drizzle-helpers";

/**
 * Get a contact by ID
 *
 * @param id - Contact ID
 * @returns Contact or null if not found
 */
export async function getContact(id: string): Promise<Contact | null> {
  try {
    const [row] = await db
      .select()
      .from(outreachContacts)
      .where(eq(outreachContacts.id, id))
      .limit(1);

    if (!row) return null;
    return toSnakeCase<Contact>(row);
  } catch (error) {
    console.error("Error fetching contact:", error);
    return null;
  }
}

/**
 * List contacts with optional filters
 *
 * @param filters - Filters for campaign, status, search, pagination
 * @returns Array of contacts
 */
export async function listContacts(filters: ContactFilters = {}): Promise<Contact[]> {
  try {
    const conditions = [];

    // Filter by campaign
    if (filters.campaign_id) {
      conditions.push(eq(outreachContacts.campaignId, filters.campaign_id));
    }

    // Filter by status
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(inArray(outreachContacts.status, filters.status as string[]));
      } else {
        conditions.push(eq(outreachContacts.status, filters.status as string));
      }
    }

    // Search by name, email, or company
    if (filters.search) {
      const sanitized = escapeForPostgresLike(filters.search);
      const pattern = `%${sanitized}%`;
      conditions.push(
        or(
          ilike(outreachContacts.email, pattern),
          ilike(outreachContacts.firstName, pattern),
          ilike(outreachContacts.lastName, pattern),
          ilike(outreachContacts.company, pattern),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const limit = filters.limit || 10;
    const offset = filters.offset || 0;

    const rows = await db
      .select()
      .from(outreachContacts)
      .where(whereClause)
      .orderBy(desc(outreachContacts.createdAt))
      .limit(limit)
      .offset(offset);

    return toSnakeCaseArray<Contact>(rows);
  } catch (error) {
    console.error("Error listing contacts:", error);
    return [];
  }
}

/**
 * Get contacts that are due to send
 *
 * @param limit - Maximum number of contacts to retrieve
 * @returns Array of contacts due to send
 */
export async function getDueContacts(limit: number = 50): Promise<Contact[]> {
  try {
    const now = new Date().toISOString();

    const rows = await db
      .select()
      .from(outreachContacts)
      .where(
        and(
          eq(outreachContacts.status, "active"),
          eq(outreachContacts.optOut, false),
          isNotNull(outreachContacts.nextSendAt),
          lte(outreachContacts.nextSendAt, now),
        ),
      )
      .orderBy(desc(outreachContacts.currentStep), asc(outreachContacts.nextSendAt))
      .limit(limit);

    return toSnakeCaseArray<Contact>(rows);
  } catch (error) {
    console.error("Error fetching due contacts:", error);
    return [];
  }
}

/**
 * Find contact by Resend email ID
 *
 * @param resendId - Resend email ID
 * @returns Contact and email number, or null if not found
 */
export async function findContactByResendId(
  resendId: string,
): Promise<{ contact: Contact; emailNumber: number } | null> {
  try {
    const [row] = await db
      .select()
      .from(outreachContacts)
      .where(
        or(
          eq(outreachContacts.email1ResendId, resendId),
          eq(outreachContacts.email2ResendId, resendId),
          eq(outreachContacts.email3ResendId, resendId),
        ),
      )
      .limit(1);

    if (!row) return null;

    const contact = toSnakeCase<Contact>(row);

    // Determine which email this ID belongs to
    let emailNumber = 1;
    if (row.email2ResendId === resendId) emailNumber = 2;
    else if (row.email3ResendId === resendId) emailNumber = 3;

    return { contact, emailNumber };
  } catch (error) {
    console.error("Error finding contact by Resend ID:", error);
    return null;
  }
}

/**
 * Check if email exists in campaign
 *
 * @param campaignId - Campaign ID
 * @param email - Email address
 * @returns True if exists
 */
export async function emailExistsInCampaign(campaignId: string, email: string): Promise<boolean> {
  try {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(outreachContacts)
      .where(and(eq(outreachContacts.campaignId, campaignId), eq(outreachContacts.email, email)));

    return Number(result?.count ?? 0) > 0;
  } catch (error) {
    console.error("Error checking email existence:", error);
    return false;
  }
}

/**
 * Count contacts for a campaign
 *
 * @param campaignId - Campaign ID
 * @param filters - Optional status filters
 * @returns Contact count
 */
export async function countContacts(
  campaignId: string,
  filters: Pick<ContactFilters, "status"> = {},
): Promise<number> {
  try {
    const conditions = [eq(outreachContacts.campaignId, campaignId)];

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(inArray(outreachContacts.status, filters.status as string[]));
      } else {
        conditions.push(eq(outreachContacts.status, filters.status as string));
      }
    }

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(outreachContacts)
      .where(and(...conditions));

    return Number(result?.count ?? 0);
  } catch (error) {
    console.error("Error counting contacts:", error);
    return 0;
  }
}

/**
 * Check if email is in blocklist
 *
 * @param email - Email address
 * @returns True if blocked
 */
export async function isEmailBlocked(email: string): Promise<boolean> {
  try {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(outreachBlocklist)
      .where(eq(outreachBlocklist.email, email.toLowerCase()));

    return Number(result?.count ?? 0) > 0;
  } catch (error) {
    console.error("Error checking blocklist:", error);
    return false;
  }
}

/**
 * Get blocked emails from a list
 *
 * @param emails - Array of email addresses
 * @returns Set of blocked emails
 */
export async function getBlockedEmails(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) {
    return new Set();
  }

  try {
    const normalizedEmails = emails.map((e) => e.toLowerCase());

    const rows = await db
      .select({ email: outreachBlocklist.email })
      .from(outreachBlocklist)
      .where(inArray(outreachBlocklist.email, normalizedEmails));

    return new Set(rows.map((row) => row.email));
  } catch (error) {
    console.error("Error fetching blocked emails:", error);
    return new Set();
  }
}

/**
 * Count how many email 1s have been sent today for a campaign
 * Used to enforce max_new_leads_per_day limit
 *
 * Uses UTC midnight as the day boundary. This may differ from the campaign
 * operator's local day (e.g. Australia/Perth = UTC+8), meaning sends between
 * 16:00-00:00 UTC could straddle boundaries. Acceptable for current volume.
 */
export async function getEmail1SentTodayCount(campaignId: string): Promise<number> {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(outreachContacts)
      .where(
        and(
          eq(outreachContacts.campaignId, campaignId),
          gte(outreachContacts.email1SentAt, todayStart.toISOString()),
        ),
      );

    return Number(result?.count ?? 0);
  } catch (error) {
    // Fail-open: returns 0, allowing sends to proceed uncapped during transient DB errors.
    // This is intentional — a brief over-send is less harmful than blocking an entire batch.
    // Note: this also means max_new_leads_per_day=0 ("block all") is bypassed on DB error.
    console.warn("Error counting email 1 sent today (fail-open, sends uncapped):", error);
    return 0;
  }
}

/**
 * Count total emails (any email number) sent today for a campaign
 * Used to enforce campaign-level daily total cap across all senders
 *
 * Counts total emails sent today for a campaign by summing separate counts for
 * email_1_sent_at, email_2_sent_at, and email_3_sent_at (each >= today midnight UTC).
 * A contact who received both email_1 and email_2 today counts as 2, not 1.
 *
 * Uses UTC midnight as the day boundary (same caveat as getEmail1SentTodayCount).
 */
export async function getCampaignSentTodayCount(campaignId: string): Promise<number> {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const [r1, r2, r3] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(outreachContacts)
        .where(
          and(
            eq(outreachContacts.campaignId, campaignId),
            gte(outreachContacts.email1SentAt, todayISO),
          ),
        )
        .then(([r]) => Number(r?.count ?? 0)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(outreachContacts)
        .where(
          and(
            eq(outreachContacts.campaignId, campaignId),
            gte(outreachContacts.email2SentAt, todayISO),
          ),
        )
        .then(([r]) => Number(r?.count ?? 0)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(outreachContacts)
        .where(
          and(
            eq(outreachContacts.campaignId, campaignId),
            gte(outreachContacts.email3SentAt, todayISO),
          ),
        )
        .then(([r]) => Number(r?.count ?? 0)),
    ]);

    return r1 + r2 + r3;
  } catch (error) {
    // Fail-open: same rationale as getEmail1SentTodayCount
    console.warn("Error counting campaign sent today (fail-open, sends uncapped):", error);
    return 0;
  }
}

/**
 * Count emails sent to a domain in the last hour
 * Used for cross-invocation domain throttling (works across serverless instances)
 *
 * Checks email_1_sent_at, email_2_sent_at, and email_3_sent_at columns
 * to count any email sent to the domain within the rolling 1-hour window.
 */
export async function getDomainSentLastHour(domain: string): Promise<number> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const escapedDomain = escapeForPostgresLike(domain);

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(outreachContacts)
      .where(
        and(
          ilike(outreachContacts.email, `%@${escapedDomain}`),
          or(
            gte(outreachContacts.email1SentAt, oneHourAgo),
            gte(outreachContacts.email2SentAt, oneHourAgo),
            gte(outreachContacts.email3SentAt, oneHourAgo),
          ),
        ),
      );

    return Number(result?.count ?? 0);
  } catch (error) {
    // Fail-open: allows sends to proceed during transient DB errors
    console.warn("Error checking domain send rate:", error);
    return 0;
  }
}

/**
 * Reschedule a contact's next send time
 * Used for domain throttling and soft bounce delays
 */
export async function rescheduleContact(contactId: string, delayMinutes: number): Promise<boolean> {
  try {
    const nextSendAt = new Date(Date.now() + delayMinutes * 60 * 1000);

    await db
      .update(outreachContacts)
      .set({
        nextSendAt: nextSendAt.toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(outreachContacts.id, contactId));

    return true;
  } catch (error) {
    console.error("Error rescheduling contact:", error);
    return false;
  }
}
