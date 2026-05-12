/**
 * Handle email.sent event
 */

import { db } from "@/lib/db";
import { outreachEmailEvents } from "@/lib/db/schema";
import type { EmailSentEvent } from "../types";

/**
 * Handle email sent event
 *
 * @param event - Sent event data
 * @param svixId - Svix event ID for idempotency (null if missing)
 * @returns True if handled successfully
 */
export async function handleEmailSent(
  event: EmailSentEvent,
  svixId: string | null,
): Promise<boolean> {
  const { email_id, tags } = event.data;
  const contactId = tags?.contact_id;
  const emailNumber = parseInt(tags?.email_number || "1");

  if (!contactId) {
    console.warn("email.sent event missing contact_id tag");
    return false;
  }

  try {
    // Log event
    await db.insert(outreachEmailEvents).values({
      contactId,
      emailNumber,
      eventType: "sent",
      resendEmailId: email_id,
      svixId,
      createdAt: event.created_at,
    });
  } catch (error) {
    console.error("Error logging sent event:", error);
    return false;
  }

  console.log(`Logged sent event for contact ${contactId}, email ${emailNumber}`);
  return true;
}
