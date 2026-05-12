/**
 * Handle email.clicked event
 */

import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachEmailEvents } from "@/lib/db/schema";
import type { EmailClickedEvent } from "../types";
import { updateCampaignStats } from "../../campaigns/actions";

/**
 * Handle email clicked event
 *
 * @param event - Clicked event data
 * @param svixId - Svix event ID for idempotency
 * @returns True if handled successfully
 */
export async function handleEmailClicked(
  event: EmailClickedEvent,
  svixId: string | null,
): Promise<boolean> {
  const { email_id, tags, click } = event.data;
  const linkUrl = click?.link ?? event.data.link ?? null;
  const ipAddress = click?.ipAddress ?? event.data.ip_address ?? null;
  const userAgent = click?.userAgent ?? event.data.user_agent ?? null;
  const contactId = tags?.contact_id;
  const campaignId = tags?.campaign_id;
  const emailNumber = parseInt(tags?.email_number || "1");

  if (!contactId) {
    console.warn("email.clicked event missing contact_id tag");
    return false;
  }

  try {
    // Log event first (clicks can happen multiple times)
    await db.insert(outreachEmailEvents).values({
      contactId,
      emailNumber,
      eventType: "clicked",
      resendEmailId: email_id,
      svixId,
      linkUrl: linkUrl || null,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      createdAt: event.created_at,
    });
  } catch (error) {
    console.error("Error logging clicked event:", error);
    return false;
  }

  // Atomically check if this was the first click by counting AFTER insert.
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
            eq(outreachEmailEvents.eventType, "clicked"),
          ),
        );

      if (Number(result?.count ?? 0) === 1) {
        await updateCampaignStats(campaignId, {
          total_clicked: 1,
        });
      }
    } catch (error) {
      console.error("Error checking first click count:", error);
    }
  } else {
    console.warn("email.clicked event missing campaign_id tag, skipping stats update");
  }

  console.log(
    `Logged click event for contact ${contactId}, email ${emailNumber}: ${linkUrl || "unknown"}`,
  );
  return true;
}
