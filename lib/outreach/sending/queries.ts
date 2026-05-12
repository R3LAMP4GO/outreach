/**
 * Database queries for sender accounts
 */

import { eq, and, gt, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachSenderAccounts, outreachCampaignSenders } from "@/lib/db/schema";
import type { SenderAccount } from "../types";
import { toSnakeCase } from "../lib/drizzle-helpers";

/**
 * Get a sender account by ID
 *
 * @param id - Sender account ID
 * @returns Sender account or null if not found
 */
export async function getSenderAccount(id: string): Promise<SenderAccount | null> {
  try {
    const [row] = await db
      .select()
      .from(outreachSenderAccounts)
      .where(eq(outreachSenderAccounts.id, id))
      .limit(1);

    if (!row) return null;
    return toSnakeCase<SenderAccount>(row);
  } catch (error) {
    console.error("Error fetching sender account:", error);
    return null;
  }
}

/**
 * Get all sender accounts for a campaign
 *
 * @param campaignId - Campaign ID
 * @returns Array of sender accounts
 */
export async function getCampaignSenders(campaignId: string): Promise<SenderAccount[]> {
  try {
    const rows = await db
      .select({
        senderAccount: outreachSenderAccounts,
      })
      .from(outreachCampaignSenders)
      .innerJoin(
        outreachSenderAccounts,
        eq(outreachCampaignSenders.senderId, outreachSenderAccounts.id),
      )
      .where(eq(outreachCampaignSenders.campaignId, campaignId));

    return rows
      .map((row) => toSnakeCase<SenderAccount>(row.senderAccount))
      .filter((sender): sender is SenderAccount => sender !== null);
  } catch (error) {
    console.error("Error fetching campaign senders:", error);
    return [];
  }
}

/**
 * Increment sender's email count for today
 *
 * @param id - Sender account ID
 * @returns True if successful, false otherwise
 */
export async function incrementSenderCount(id: string): Promise<boolean> {
  try {
    await db.execute(sql`SELECT increment_sender_email_count(${id}, ${1})`);
    return true;
  } catch (error) {
    console.error("Error incrementing sender count:", error);
    return false;
  }
}

/**
 * Update sender's last sent timestamp
 *
 * @param id - Sender account ID
 * @param timestamp - Timestamp to set (defaults to now)
 * @returns True if successful, false otherwise
 */
export async function updateSenderLastSent(id: string, timestamp?: string): Promise<boolean> {
  try {
    await db
      .update(outreachSenderAccounts)
      .set({
        lastSentAt: timestamp || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(outreachSenderAccounts.id, id));
    return true;
  } catch (error) {
    console.error("Error updating sender last sent:", error);
    return false;
  }
}

/**
 * Reset daily email counts for all sender accounts
 * Should be called by a daily cron job at midnight
 *
 * @returns Number of senders reset
 */
export async function resetDailySenderCounts(): Promise<number> {
  try {
    const rows = await db
      .update(outreachSenderAccounts)
      .set({
        emailsSentToday: 0,
        updatedAt: new Date().toISOString(),
      })
      .where(gt(outreachSenderAccounts.emailsSentToday, 0))
      .returning({ id: outreachSenderAccounts.id });

    return rows.length;
  } catch (error) {
    console.error("Error resetting daily sender counts:", error);
    return 0;
  }
}

/**
 * Get available senders for a campaign
 * Filters to active senders under their daily limit
 *
 * @param campaignId - Campaign ID
 * @returns Array of available sender accounts
 */
export async function getAvailableSenders(campaignId: string): Promise<SenderAccount[]> {
  const senders = await getCampaignSenders(campaignId);

  // Filter to active senders under their daily limit
  return senders.filter(
    (sender) =>
      sender.is_active &&
      sender.emails_sent_today !== null &&
      sender.daily_limit !== null &&
      sender.emails_sent_today < sender.daily_limit,
  );
}

/**
 * Reset sender email counts where last_sent_at is from a previous day
 * Self-healing: ensures counts are reset even without a separate cron job
 */
export async function resetStaleSenderCounts(): Promise<number> {
  try {
    const rows = await db
      .update(outreachSenderAccounts)
      .set({
        emailsSentToday: 0,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          gt(outreachSenderAccounts.emailsSentToday, 0),
          lt(
            outreachSenderAccounts.lastSentAt,
            new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString(),
          ),
        ),
      )
      .returning({ id: outreachSenderAccounts.id });

    const count = rows.length;
    if (count > 0) {
      console.log(`Reset stale sender counts for ${count} sender(s)`);
    }
    return count;
  } catch (error) {
    console.error("Error resetting stale sender counts:", error);
    return 0;
  }
}
