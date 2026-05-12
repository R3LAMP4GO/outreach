/**
 * Campaign database queries
 */

import { eq, and, or, ilike, inArray, desc, sql, getTableColumns } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachCampaigns, outreachContacts, outreachSchedules } from "@/lib/db/schema";
import type { Campaign, CampaignFilters, CampaignStats, CampaignWithUnsubscribed } from "./types";
import type { OutreachSchedule } from "../types";
import { escapeForPostgresLike } from "@/lib/security/input-validation";
import { toSnakeCase, toSnakeCaseArray } from "../lib/drizzle-helpers";

/**
 * Get a campaign by ID
 *
 * @param id - Campaign ID
 * @returns Campaign or null if not found
 *
 * @example
 * ```typescript
 * const campaign = await getCampaign('550e8400-e29b-41d4-a716-446655440000')
 * ```
 */
export async function getCampaign(id: string): Promise<Campaign | null> {
  try {
    const [row] = await db
      .select()
      .from(outreachCampaigns)
      .where(eq(outreachCampaigns.id, id))
      .limit(1);

    if (!row) return null;
    return toSnakeCase<Campaign>(row);
  } catch (error) {
    console.error("Error fetching campaign:", error);
    return null;
  }
}

/**
 * List campaigns with optional filters
 *
 * @param filters - Optional filters for status, search, pagination
 * @returns Array of campaigns
 *
 * @example
 * ```typescript
 * const campaigns = await listCampaigns({
 *   status: 'active',
 *   limit: 10,
 *   offset: 0
 * })
 * ```
 */
export async function listCampaigns(
  filters: CampaignFilters = {},
): Promise<CampaignWithUnsubscribed[]> {
  try {
    const conditions = [];

    // Filter by status
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(inArray(outreachCampaigns.status, filters.status as string[]));
      } else {
        conditions.push(eq(outreachCampaigns.status, filters.status as string));
      }
    }

    // Search by name or description
    if (filters.search) {
      const sanitized = escapeForPostgresLike(filters.search);
      const pattern = `%${sanitized}%`;
      conditions.push(
        or(ilike(outreachCampaigns.name, pattern), ilike(outreachCampaigns.description, pattern)),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const limit = filters.limit || 10;
    const offset = filters.offset || 0;

    // Correlated subquery: count contacts where unsubscribed_at is set per campaign.
    // No total_unsubscribed counter exists on outreach_campaigns — we derive it
    // from outreach_contacts.unsubscribed_at.
    //
    // IMPORTANT: column refs are written as fully qualified literals here.
    // Drizzle's `sql` template emits bare identifiers when interpolating
    // columns (`${outreachContacts.campaignId}` → "campaign_id"), which inside
    // a correlated subquery resolve against the innermost table by Postgres
    // name resolution rules. That collapsed the correlation to
    // `outreach_contacts.campaign_id = outreach_contacts.id` (always false),
    // making the count always 0. Hardcoded "outreach_contacts.x" /
    // "outreach_campaigns.x" forces the right resolution.
    // Live total_contacts override: outreach_campaigns.total_contacts is a
    // stored counter, but it's only bumped by lib/outreach/contacts/import.ts.
    // Other insert paths (manual adds, older imports) leave it stale, causing
    // the list view (counter) to disagree with the detail view (live count).
    // Derive it live to keep both views consistent.
    const rows = await db
      .select({
        ...getTableColumns(outreachCampaigns),
        totalContacts: sql<number>`(
          SELECT COUNT(*)::int FROM outreach_contacts
          WHERE outreach_contacts.campaign_id = outreach_campaigns.id
        )`.as("total_contacts"),
        totalUnsubscribed: sql<number>`(
          SELECT COUNT(*)::int FROM outreach_contacts
          WHERE outreach_contacts.campaign_id = outreach_campaigns.id
            AND outreach_contacts.unsubscribed_at IS NOT NULL
        )`.as("total_unsubscribed"),
      })
      .from(outreachCampaigns)
      .where(whereClause)
      .orderBy(desc(outreachCampaigns.createdAt))
      .limit(limit)
      .offset(offset);

    return toSnakeCaseArray<CampaignWithUnsubscribed>(rows);
  } catch (error) {
    console.error("Error listing campaigns:", error);
    return [];
  }
}

/**
 * Get campaign statistics with computed rates
 *
 * @param campaign - Campaign object
 * @returns Campaign statistics with computed rates
 *
 * @example
 * ```typescript
 * const stats = getCampaignStats(campaign)
 * console.log(`Open rate: ${stats.open_rate}%`)
 * ```
 */
export function getCampaignStats(campaign: Campaign): CampaignStats {
  const {
    total_contacts,
    total_sent,
    total_delivered,
    total_opened,
    total_clicked,
    total_replied,
    total_bounced,
  } = campaign;

  // Default null values to 0 for calculations
  const safeContacts = total_contacts ?? 0;
  const safeSent = total_sent ?? 0;
  const safeDelivered = total_delivered ?? 0;
  const safeOpened = total_opened ?? 0;
  const safeClicked = total_clicked ?? 0;
  const safeReplied = total_replied ?? 0;
  const safeBounced = total_bounced ?? 0;

  return {
    total_contacts: safeContacts,
    total_sent: safeSent,
    total_delivered: safeDelivered,
    total_opened: safeOpened,
    total_clicked: safeClicked,
    total_replied: safeReplied,
    total_bounced: safeBounced,
    open_rate: safeSent > 0 ? (safeOpened / safeSent) * 100 : 0,
    reply_rate: safeSent > 0 ? (safeReplied / safeSent) * 100 : 0,
    bounce_rate: safeSent > 0 ? (safeBounced / safeSent) * 100 : 0,
  };
}

/**
 * Count total campaigns
 *
 * @param filters - Optional filters
 * @returns Total count
 */
export async function countCampaigns(filters: CampaignFilters = {}): Promise<number> {
  try {
    const conditions = [];

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(inArray(outreachCampaigns.status, filters.status as string[]));
      } else {
        conditions.push(eq(outreachCampaigns.status, filters.status as string));
      }
    }

    if (filters.search) {
      const sanitized = escapeForPostgresLike(filters.search);
      const pattern = `%${sanitized}%`;
      conditions.push(
        or(ilike(outreachCampaigns.name, pattern), ilike(outreachCampaigns.description, pattern)),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(outreachCampaigns)
      .where(whereClause);

    return Number(result?.count ?? 0);
  } catch (error) {
    console.error("Error counting campaigns:", error);
    return 0;
  }
}

/**
 * Check if campaign exists
 *
 * @param id - Campaign ID
 * @returns True if exists
 */
export async function campaignExists(id: string): Promise<boolean> {
  try {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(outreachCampaigns)
      .where(eq(outreachCampaigns.id, id));

    return Number(result?.count ?? 0) > 0;
  } catch (error) {
    console.error("Error checking campaign existence:", error);
    return false;
  }
}

/**
 * Get the active schedule for a campaign
 *
 * @param campaignId - Campaign ID
 * @returns Active schedule or null if none found (falls back to defaults)
 */
export async function getCampaignSchedule(campaignId: string): Promise<OutreachSchedule | null> {
  try {
    const [row] = await db
      .select()
      .from(outreachSchedules)
      .where(
        and(eq(outreachSchedules.campaignId, campaignId), eq(outreachSchedules.isActive, true)),
      )
      .limit(1);

    if (!row) return null;
    return toSnakeCase<OutreachSchedule>(row);
  } catch {
    // No active schedule — caller should fall back to defaults
    return null;
  }
}
