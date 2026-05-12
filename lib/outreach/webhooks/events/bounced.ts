/**
 * Handle email.bounced event
 *
 * Distinguishes between hard and soft bounces:
 * - Hard bounce: immediately marks contact as bounced and adds to blocklist
 * - Soft bounce: increments bounce_count, reschedules for retry. After 3 soft
 *   bounces, escalates to hard bounce.
 *
 * Also checks campaign bounce rate and auto-pauses if it exceeds threshold.
 */

import { db } from "@/lib/db";
import { outreachEmailEvents } from "@/lib/db/schema";
import type { EmailBouncedEvent } from "../types";
import { markContactBounced, handleSoftBounce } from "../../contacts/actions";
import { updateCampaignStats, pauseCampaign } from "../../campaigns/actions";
import { getCampaign } from "../../campaigns/queries";
import {
  OUTREACH_BOUNCE_RATE_PAUSE_THRESHOLD,
  OUTREACH_BOUNCE_RATE_MIN_SAMPLE,
} from "@/lib/constants";

/** Bounce types that Resend classifies as hard bounces (compared lowercase).
 * Resend sends "Permanent" for hard bounces; we normalize to lowercase before lookup. */
const HARD_BOUNCE_TYPES = new Set([
  "permanent",
  "bounce",
  "hard_bounce",
  "hard",
  "spam_complaint",
  "api_failure",
  "suppressed",
]);

/**
 * Handle email bounced event
 *
 * @param event - Bounced event data
 * @param svixId - Svix event ID for idempotency
 * @returns True if handled successfully
 */
export async function handleEmailBounced(
  event: EmailBouncedEvent,
  svixId: string | null,
): Promise<boolean> {
  const { email_id, tags, bounce } = event.data;
  const contactId = tags?.contact_id;
  const campaignId = tags?.campaign_id;
  const emailNumber = parseInt(tags?.email_number || "1");

  if (!contactId) {
    console.warn("email.bounced event missing contact_id tag");
    return false;
  }

  const bounceType = bounce?.type || "unknown";
  const bounceMessage = bounce?.message || "";
  const isHardBounce = HARD_BOUNCE_TYPES.has(bounceType.toLowerCase());

  console.log(
    `Bounce event for contact ${contactId}: type="${bounceType}", hard=${isHardBounce}, message="${bounceMessage}"`,
  );

  // Log event
  try {
    await db.insert(outreachEmailEvents).values({
      contactId,
      emailNumber,
      eventType: "bounced",
      resendEmailId: email_id,
      svixId,
      bounceType,
      bounceMessage,
      createdAt: event.created_at,
    });
  } catch (error) {
    console.error("Error logging bounced event:", error);
  }

  // Handle based on bounce type
  if (isHardBounce) {
    // Hard bounce: immediately stop sequence and blocklist
    await markContactBounced(contactId, bounceType);
    console.log(`Hard bounce for contact ${contactId}: ${bounceType} - ${bounceMessage}`);
  } else {
    // Soft bounce: increment counter, reschedule or escalate
    const outcome = await handleSoftBounce(contactId, bounceType);
    console.log(
      `Soft bounce for contact ${contactId}: ${bounceType} - ${bounceMessage} (${outcome})`,
    );
  }

  // Update campaign stats
  if (campaignId) {
    await updateCampaignStats(campaignId, {
      total_bounced: 1,
    });

    // Check bounce rate and auto-pause if too high
    await checkBounceRateAndPause(campaignId);
  } else {
    console.warn(
      "email.bounced event missing campaign_id tag, skipping stats update and bounce rate check",
    );
  }

  return true;
}

/**
 * Check campaign bounce rate and auto-pause if it exceeds threshold
 */
async function checkBounceRateAndPause(campaignId: string): Promise<void> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return;

  const totalSent = campaign.total_sent ?? 0;
  const totalBounced = campaign.total_bounced ?? 0;

  // Only check if we have enough samples
  if (totalSent < OUTREACH_BOUNCE_RATE_MIN_SAMPLE) return;

  const bounceRate = (totalBounced / totalSent) * 100;

  if (bounceRate > OUTREACH_BOUNCE_RATE_PAUSE_THRESHOLD) {
    console.warn(
      `Campaign ${campaignId} bounce rate ${bounceRate.toFixed(1)}% exceeds threshold ${OUTREACH_BOUNCE_RATE_PAUSE_THRESHOLD}%, auto-pausing`,
    );
    await pauseCampaign(campaignId);
  }
}
