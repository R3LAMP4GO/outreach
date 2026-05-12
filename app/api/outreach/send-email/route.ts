/**
 * Manual/debug endpoint: sends a single outreach email.
 *
 * In production, emails are dispatched directly by the pg-boss worker process.
 * This endpoint exists for manual testing and is secured with a CRON_SECRET
 * bearer token.
 *
 * Body: { contactId, campaignId, emailNumber, unsubscribeUrl, forceTextOnly? }
 */

import { NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { Resend } from "resend";
import { sendEmail } from "@/lib/outreach/sending/sender";
import {
  getContact,
  getDomainSentLastHour,
  rescheduleContact,
} from "@/lib/outreach/contacts/queries";
import { getCampaign, getCampaignSchedule } from "@/lib/outreach/campaigns/queries";
import { isBusinessHour, scheduleToBusinessHours } from "@/lib/outreach/scheduling/business-hours";
import { getDeliverabilityStrategy } from "@/lib/outreach/sending/deliverability";
import { compareBearerToken } from "@/lib/auth/compare-api-keys";
import {
  OUTREACH_DEFAULT_TIMEZONE,
  OUTREACH_MAX_EMAILS_PER_DOMAIN_PER_HOUR,
  OUTREACH_DOMAIN_THROTTLE_DELAY_MINUTES,
} from "@/lib/constants";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    // Authenticate with CRON_SECRET
    const authHeader = request.headers.get("authorization");
    const expectedToken = process.env.OUTREACH_CRON_SECRET || process.env.CRON_SECRET;
    if (!authHeader || !expectedToken || !compareBearerToken(authHeader, expectedToken)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { contactId, campaignId, emailNumber, unsubscribeUrl, forceTextOnly } = body;

    // Validate required fields
    if (!contactId || !campaignId || !emailNumber || !unsubscribeUrl) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (![1, 2, 3].includes(emailNumber)) {
      return Response.json({ error: "Invalid email number" }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
    }

    const resend = new Resend(apiKey);

    // Fetch contact
    const contact = await getContact(contactId);
    if (!contact) {
      logger.error(`Contact ${contactId} not found`);
      return Response.json({ success: true, skipped: true, reason: "not_found" });
    }

    if (contact.status !== "active") {
      logger.debug(`Contact ${contactId} status is ${contact.status}, skipping`);
      return Response.json({ success: true, skipped: true, reason: `status: ${contact.status}` });
    }
    if (contact.opt_out === true) {
      logger.debug(`Contact ${contactId} has opt_out=true, skipping`);
      return Response.json({ success: true, skipped: true, reason: "opt_out" });
    }

    // Idempotency: skip if this email was already sent
    if ((contact.current_step ?? 0) >= emailNumber) {
      logger.debug(
        `Contact ${contactId} already at step ${contact.current_step}, email ${emailNumber} already sent`,
      );
      return Response.json({ success: true, skipped: true, reason: "already_sent" });
    }

    // Fetch campaign
    const campaign = await getCampaign(campaignId);
    if (!campaign) {
      logger.error(`Campaign ${campaignId} not found`);
      return Response.json({ success: true, skipped: true, reason: "not_found" });
    }

    if (campaign.status !== "active") {
      logger.debug(`Campaign ${campaignId} is ${campaign.status}, skipping`);
      return Response.json({ success: true, skipped: true, reason: `campaign ${campaign.status}` });
    }

    // Business hours check
    const schedule = await getCampaignSchedule(campaignId);
    const businessHours = schedule ? scheduleToBusinessHours(schedule) : undefined;
    if (businessHours) {
      const timezone = contact.timezone || schedule?.timezone || OUTREACH_DEFAULT_TIMEZONE;
      if (!isBusinessHour(new Date(), timezone, businessHours)) {
        logger.debug(
          `Contact ${contactId} outside business hours at send time (${timezone}), rescheduling`,
        );
        await rescheduleContact(contactId, 60);
        return Response.json({ success: true, skipped: true, reason: "outside_business_hours" });
      }
    }

    if (campaign.test_mode === true) {
      logger.debug(`[TEST MODE] Would send email ${emailNumber} to ${contact.email}`);
      return Response.json({ success: true, skipped: true, reason: "test_mode" });
    }

    // Deliverability strategy
    const strategy = getDeliverabilityStrategy(contact, campaign, emailNumber);

    // Domain throttling
    const domain = contact.email.split("@")[1]?.toLowerCase() || "";
    if (domain) {
      const domainSentCount = await getDomainSentLastHour(domain);
      if (domainSentCount >= OUTREACH_MAX_EMAILS_PER_DOMAIN_PER_HOUR) {
        logger.debug(
          `Throttling ${contact.email} — ${domainSentCount} sends to ${domain} in last hour, rescheduling`,
        );
        await rescheduleContact(contactId, OUTREACH_DOMAIN_THROTTLE_DELAY_MINUTES);
        return Response.json({ success: true, skipped: true, reason: "domain_throttled" });
      }
    }

    // Send the email
    const result = await sendEmail(
      resend,
      contact,
      campaign,
      emailNumber as 1 | 2 | 3,
      unsubscribeUrl,
      { forceTextOnly: forceTextOnly ?? strategy.forceTextOnly, businessHours },
    );

    if (result.success) {
      logger.debug(`Sent email ${emailNumber} to ${contact.email}`);
      return Response.json({ success: true, resendId: result.resendId });
    } else {
      logger.error(`Failed to send email ${emailNumber} to ${contact.email}: ${result.error}`);
      return Response.json({ success: false, error: result.error }, { status: 500 });
    }
  } catch (error) {
    logger.error("Error in send-email handler:", error);
    return Response.json(
      { error: "Internal error", message: error instanceof Error ? error.message : "Unknown" },
      { status: 500 },
    );
  }
}
