/**
 * Handle email.delivered event
 */

import { db } from "@/lib/db";
import { outreachEmailEvents } from "@/lib/db/schema";
import type { EmailDeliveredEvent } from "../types";
import { updateCampaignStats } from "../../campaigns/actions";

/**
 * Handle email delivered event
 *
 * @param event - Delivered event data
 * @param svixId - Svix event ID for idempotency
 * @returns True if handled successfully
 */
export async function handleEmailDelivered(
  event: EmailDeliveredEvent,
  svixId: string | null,
): Promise<boolean> {
  const { email_id, tags } = event.data;
  const contactId = tags?.contact_id;
  const campaignId = tags?.campaign_id;
  const emailNumber = parseInt(tags?.email_number || "1");

  if (!contactId) {
    console.warn("email.delivered event missing contact_id tag");
    return false;
  }

  try {
    // Log event
    await db.insert(outreachEmailEvents).values({
      contactId,
      emailNumber,
      eventType: "delivered",
      resendEmailId: email_id,
      svixId,
      createdAt: event.created_at,
    });
  } catch (error) {
    console.error("Error logging delivered event:", error);
    return false;
  }

  // Update campaign stats
  if (campaignId) {
    await updateCampaignStats(campaignId, {
      total_delivered: 1,
    });
  } else {
    console.warn("email.delivered event missing campaign_id tag, skipping stats update");
  }

  console.log(`Logged delivered event for contact ${contactId}, email ${emailNumber}`);
  return true;
}
