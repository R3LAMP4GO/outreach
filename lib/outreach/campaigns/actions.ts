/**
 * Campaign actions (create, update, delete)
 */

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachCampaigns } from "@/lib/db/schema";
import type { Campaign, CampaignUpdate, CreateCampaignInput, CampaignStatField } from "./types";
import { DEFAULT_EMAIL_2_DELAY, DEFAULT_EMAIL_3_DELAY } from "../types/config";
import { toSnakeCase, toCamelCase } from "../lib/drizzle-helpers";

/**
 * Create a new campaign
 *
 * @param input - Campaign creation input
 * @returns Created campaign or null if error
 *
 * @example
 * ```typescript
 * const campaign = await createCampaign({
 *   name: 'Retail WA Outreach',
 *   description: 'Target retail businesses in Western Australia',
 *   from_email: 'sender@email.__YOUR_DOMAIN__',
 *   from_name: 'Your Name',
 *   email_2_delay: 2,
 *   email_3_delay: 5
 * })
 * ```
 */
export async function createCampaign(input: CreateCampaignInput): Promise<Campaign | null> {
  try {
    const [row] = await db
      .insert(outreachCampaigns)
      .values({
        name: input.name,
        description: input.description || null,
        fromEmail: input.from_email,
        fromName: input.from_name || null,
        emailSubject: input.email_subject || null,
        emailBody: input.email_body || null,
        testMode: input.test_mode !== undefined ? input.test_mode : true,
        email2Delay: input.email_2_delay || DEFAULT_EMAIL_2_DELAY,
        email3Delay: input.email_3_delay || DEFAULT_EMAIL_3_DELAY,
        ownerId: input.owner_id || null,
        status: "draft",
        totalContacts: 0,
        totalSent: 0,
        totalDelivered: 0,
        totalOpened: 0,
        totalClicked: 0,
        totalReplied: 0,
        totalBounced: 0,
      })
      .returning();

    if (!row) return null;
    return toSnakeCase<Campaign>(row);
  } catch (error) {
    console.error("Error creating campaign:", error);
    return null;
  }
}

/**
 * Update campaign
 *
 * @param id - Campaign ID
 * @param updates - Fields to update (snake_case keys)
 * @returns Updated campaign or null if error
 *
 * @example
 * ```typescript
 * const campaign = await updateCampaign(campaignId, {
 *   status: 'active',
 *   name: 'Updated Campaign Name'
 * })
 * ```
 */
export async function updateCampaign(
  id: string,
  updates: CampaignUpdate,
): Promise<Campaign | null> {
  try {
    // Convert snake_case update keys to camelCase for Drizzle
    const camelUpdates = toCamelCase({
      ...updates,
      updated_at: new Date().toISOString(),
    });

    const [row] = await db
      .update(outreachCampaigns)
      .set(camelUpdates)
      .where(eq(outreachCampaigns.id, id))
      .returning();

    if (!row) return null;
    return toSnakeCase<Campaign>(row);
  } catch (error) {
    console.error("Error updating campaign:", error);
    return null;
  }
}

/**
 * Pause a campaign
 *
 * @param id - Campaign ID
 * @returns Updated campaign or null if error
 */
export async function pauseCampaign(id: string): Promise<Campaign | null> {
  return updateCampaign(id, { status: "paused" });
}

/**
 * Complete a campaign
 *
 * @param id - Campaign ID
 * @returns Updated campaign or null if error
 */
export async function completeCampaign(id: string): Promise<Campaign | null> {
  return updateCampaign(id, { status: "completed" });
}

/**
 * Delete a campaign and all associated contacts
 *
 * @param id - Campaign ID
 * @returns True if successful
 *
 * @example
 * ```typescript
 * const success = await deleteCampaign(campaignId)
 * ```
 */
export async function deleteCampaign(id: string): Promise<boolean> {
  try {
    await db.delete(outreachCampaigns).where(eq(outreachCampaigns.id, id));
    return true;
  } catch (error) {
    console.error("Error deleting campaign:", error);
    return false;
  }
}

/**
 * Increment a campaign statistic
 *
 * @param id - Campaign ID
 * @param field - Stat field to increment
 * @param amount - Amount to increment by (default: 1)
 * @returns True if successful
 *
 * @example
 * ```typescript
 * await incrementCampaignStat(campaignId, 'total_sent')
 * await incrementCampaignStat(campaignId, 'total_opened', 5)
 * ```
 */
export async function incrementCampaignStat(
  id: string,
  field: CampaignStatField,
  amount: number = 1,
): Promise<boolean> {
  try {
    await db.execute(sql`SELECT increment_campaign_stat(${id}, ${field}, ${amount})`);
    return true;
  } catch (error) {
    console.error("Error incrementing campaign stat:", error);
    return false;
  }
}

/**
 * Update multiple campaign statistics at once
 *
 * @param id - Campaign ID
 * @param stats - Object with stat fields and values to increment
 * @returns True if successful
 *
 * @example
 * ```typescript
 * await updateCampaignStats(campaignId, {
 *   total_sent: 1,
 *   total_delivered: 1
 * })
 * ```
 */
export async function updateCampaignStats(
  id: string,
  stats: Partial<Record<CampaignStatField, number>>,
): Promise<boolean> {
  try {
    await db.execute(sql`SELECT increment_campaign_stats(${id}, ${JSON.stringify(stats)}::jsonb)`);
    return true;
  } catch (error) {
    console.error("Error updating campaign stats:", error);
    return false;
  }
}
