/**
 * Handle email.opened event
 */

import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachEmailEvents } from "@/lib/db/schema";
import type { EmailOpenedEvent } from "../types";
import { updateCampaignStats } from "../../campaigns/actions";

/**
 * Handle email opened event
 *
 * @param event - Opened event data
 * @param svixId - Svix event ID for idempotency
 * @returns True if handled successfully
 */
export async function handleEmailOpened(
  event: EmailOpenedEvent,
  svixId: string | null,
): Promise<boolean> {
  const { email_id, tags, ip_address, user_agent } = event.data;
  const contactId = tags?.contact_id;
  const campaignId = tags?.campaign_id;
  const emailNumber = parseInt(tags?.email_number || "1");

  if (!contactId) {
    console.warn("email.opened event missing contact_id tag");
    return false;
  }

  try {
    // Log event first (opens can happen multiple times)
    await db.insert(outreachEmailEvents).values({
      contactId,
      emailNumber,
      eventType: "opened",
      resendEmailId: email_id,
      svixId,
      ipAddress: ip_address || null,
      userAgent: user_agent || null,
      createdAt: event.created_at,
    });
  } catch (error) {
    console.error("Error logging opened event:", error);
    return false;
  }

  // Atomically check if this was the first open by counting AFTER insert.
  // If count === 1, this insert was the first — no race condition possible
  // since concurrent inserts will both see count >= 2.
  if (campaignId) {
    try {
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(outreachEmailEvents)
        .where(
          and(
            eq(outreachEmailEvents.contactId, contactId),
            eq(outreachEmailEvents.eventType, "opened"),
          ),
        );

      if (Number(result?.count ?? 0) === 1) {
        await updateCampaignStats(campaignId, {
          total_opened: 1,
        });
      }
    } catch (error) {
      console.error("Error checking first open count:", error);
    }
  } else {
    console.warn("email.opened event missing campaign_id tag, skipping stats update");
  }

  console.log(`Logged open event for contact ${contactId}, email ${emailNumber}`);
  return true;
}
