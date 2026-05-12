/**
 * Email processor - processes due emails for cron job
 *
 * Enqueues individual sends to pg-boss with staggered delays.
 */

import { eq, and, isNotNull, lte } from "drizzle-orm";
import type { Resend } from "resend";
import { db } from "@/lib/db";
import { outreachContacts } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import type { BatchSendResult } from "./types";
import {
  getDueContacts,
  getEmail1SentTodayCount,
  getCampaignSentTodayCount,
  rescheduleContact,
} from "../contacts/queries";
import { updateContact } from "../contacts/actions";
import { getCampaign, getCampaignSchedule } from "../campaigns/queries";
import { isBusinessHour, scheduleToBusinessHours } from "../scheduling/business-hours";
import type { BusinessHoursConfig } from "../scheduling/types";
import { resetStaleSenderCounts } from "./queries";
import { getDeliverabilityStrategy, shouldThrottleDomain } from "./deliverability";
import { generateUnsubscribeToken } from "../lib/utils";
import { enqueueOutreachSendEmail } from "@/lib/queue";
import { DEFAULT_BATCH_SIZE } from "../types/config";
import {
  OUTREACH_DEFAULT_TIMEZONE,
  OUTREACH_MIN_SEND_INTERVAL_MINUTES,
  OUTREACH_RANDOM_SEND_INTERVAL_MINUTES,
  OUTREACH_DUE_SUMMARY_HOURS,
  OUTREACH_DOMAIN_THROTTLE_DELAY_MINUTES,
} from "@/lib/constants";

/**
 * Process due emails - main cron job function
 *
 * This function:
 * 1. Queries contacts with next_send_at <= NOW() and status = 'active'
 * 2. Filters for business hours in recipient's timezone
 * 3. Sends emails via Resend with proper threading
 * 4. Updates contact state and schedules next email
 *
 * @param resend - Resend client
 * @param options - Processing options
 * @returns Batch send result
 *
 * @example
 * ```typescript
 * // In your cron job handler:
 * const result = await processDueEmails(resend, {
 *   batchSize: 50,
 *   unsubscribeBaseUrl: 'https://example.com/unsubscribe'
 * })
 *
 * console.log(`Processed ${result.total}, sent ${result.sent}`)
 * ```
 */
export async function processDueEmails(
  resend: Resend,
  options: {
    batchSize?: number;
    unsubscribeBaseUrl: string;
    dryRun?: boolean;
  },
): Promise<BatchSendResult> {
  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
  const result: BatchSendResult = {
    total: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    results: [],
  };

  // Self-healing: reset sender counts from previous days
  await resetStaleSenderCounts();

  // Step 1: Get contacts due to send
  const dueContacts = await getDueContacts(batchSize);
  result.total = dueContacts.length;

  if (dueContacts.length === 0) {
    console.log("No contacts due to send");
    return result;
  }

  console.log(`Found ${dueContacts.length} contacts due to send`);

  // Step 2: Pre-fetch campaign schedules and filter by business hours
  // Cache schedule per campaign_id to avoid re-fetching for every contact
  const scheduleCache = new Map<string, { timezone: string; config: BusinessHoursConfig } | null>();

  async function getCachedSchedule(
    campaignId: string,
  ): Promise<{ timezone: string; config: BusinessHoursConfig } | null> {
    if (scheduleCache.has(campaignId)) {
      return scheduleCache.get(campaignId)!;
    }
    const schedule = await getCampaignSchedule(campaignId);
    if (schedule) {
      const resolved = {
        timezone: schedule.timezone,
        config: scheduleToBusinessHours(schedule),
      };
      scheduleCache.set(campaignId, resolved);
      return resolved;
    }
    scheduleCache.set(campaignId, null);
    return null;
  }

  const now = new Date();
  const readyToSend: typeof dueContacts = [];

  for (const contact of dueContacts) {
    const campaignSchedule = contact.campaign_id
      ? await getCachedSchedule(contact.campaign_id)
      : null;

    const timezone = contact.timezone || campaignSchedule?.timezone || OUTREACH_DEFAULT_TIMEZONE;
    const config = campaignSchedule?.config;
    const inBusinessHours = config
      ? isBusinessHour(now, timezone, config)
      : isBusinessHour(now, timezone);

    if (!inBusinessHours) {
      console.log(`Skipping ${contact.email} - outside business hours (${timezone})`);
      result.skipped++;
    } else {
      readyToSend.push(contact);
    }
  }

  const followUps = readyToSend.filter((c) => (c.current_step ?? 0) > 0).length;
  const newLeads = readyToSend.filter((c) => (c.current_step ?? 0) === 0).length;
  console.log(
    `${readyToSend.length} contacts in business hours: ${followUps} follow-ups, ${newLeads} new leads`,
  );

  if (readyToSend.length === 0) {
    return result;
  }

  // Track daily new leads per campaign for max_new_leads_per_day enforcement
  const dailyLeadCounts = new Map<string, { limit: number; sent: number }>();

  // Track campaign-level total daily sends (all email numbers) for hard cap enforcement
  // Uses max_new_leads_per_day as the campaign total daily cap across all senders
  const dailyCampaignTotals = new Map<string, { limit: number; sent: number }>();

  // Step 3: Send emails
  // sendIndex tracks position for staggered delays across the batch
  let sendIndex = 0;

  for (const contact of readyToSend) {
    // Defensive check: never send to opted-out contacts
    if (contact.opt_out === true) {
      console.warn(`Contact ${contact.id} has opt_out=true, skipping send`);
      result.skipped++;
      continue;
    }

    // Validate contact has campaign_id and current_step
    if (!contact.campaign_id || contact.current_step === null) {
      console.error(`Contact ${contact.id} missing campaign_id or current_step`);
      result.failed++;
      continue;
    }

    // Get campaign
    const campaign = await getCampaign(contact.campaign_id);
    if (!campaign) {
      console.error(`Campaign not found for contact ${contact.id}`);
      result.failed++;
      continue;
    }

    // Validate campaign is active
    if (campaign.status !== "active") {
      console.error(`Campaign ${campaign.id} is not active (status: ${campaign.status})`);
      result.failed++;
      continue;
    }

    // Enforce test_mode: skip actual sending but log
    if (campaign.test_mode === true) {
      const emailNum = contact.current_step + 1;
      console.log(`[TEST MODE] Skipping email ${emailNum} to ${contact.email}`);
      result.skipped++;
      continue;
    }

    // Determine which email to send based on current step
    const emailNumber = (contact.current_step + 1) as 1 | 2 | 3;
    if (emailNumber > 3) {
      console.error(
        `Invalid email number ${emailNumber} for contact ${contact.id}, auto-completing`,
      );
      await updateContact(contact.id, { status: "completed", next_send_at: null });
      result.failed++;
      continue;
    }

    // Enforce max_new_leads_per_day (only applies to email 1)
    // null = no limit, 0 = block all email 1s, N = allow N per day
    if (emailNumber === 1 && campaign.max_new_leads_per_day != null) {
      if (!dailyLeadCounts.has(campaign.id)) {
        const sentToday = await getEmail1SentTodayCount(campaign.id);
        dailyLeadCounts.set(campaign.id, {
          limit: campaign.max_new_leads_per_day,
          sent: sentToday,
        });
      }

      const tracker = dailyLeadCounts.get(campaign.id)!;
      if (tracker.sent >= tracker.limit) {
        console.log(
          `Skipping email 1 to ${contact.email} - daily new lead limit reached (${tracker.sent}/${tracker.limit})`,
        );
        result.skipped++;
        continue;
      }
    }

    // Enforce campaign-level total daily cap (all email numbers, all senders).
    // Intentionally reuses max_new_leads_per_day as the total daily send cap.
    // This means the same number caps both new leads (email 1) AND total sends
    // (email 1 + 2 + 3). Follow-ups are prioritized in the query ordering, so
    // they're processed first and won't be blocked by this cap in practice.
    if (campaign.max_new_leads_per_day != null) {
      if (!dailyCampaignTotals.has(campaign.id)) {
        const totalSentToday = await getCampaignSentTodayCount(campaign.id);
        dailyCampaignTotals.set(campaign.id, {
          limit: campaign.max_new_leads_per_day,
          sent: totalSentToday,
        });
      }

      const totalTracker = dailyCampaignTotals.get(campaign.id)!;
      if (totalTracker.sent >= totalTracker.limit) {
        console.log(
          `Skipping email ${emailNumber} to ${contact.email} - campaign daily total limit reached (${totalTracker.sent}/${totalTracker.limit})`,
        );
        result.skipped++;
        continue;
      }
    }

    // Security-aware deliverability strategy
    const strategy = getDeliverabilityStrategy(contact, campaign, emailNumber);

    // Domain throttling — also re-checked at send time inside the
    // outreach-send-email worker handler using fresh DB queries.
    if (shouldThrottleDomain(strategy.domainThrottleKey)) {
      console.log(
        `Throttling ${contact.email} - too many sends to ${strategy.domainThrottleKey}, rescheduling`,
      );
      const rescheduled = await rescheduleContact(
        contact.id,
        OUTREACH_DOMAIN_THROTTLE_DELAY_MINUTES,
      );
      if (!rescheduled) {
        console.warn(
          `Failed to reschedule throttled contact ${contact.id} - will retry next batch`,
        );
      }
      result.skipped++;
      continue;
    }

    // Generate signed unsubscribe URL
    const unsubscribeToken = generateUnsubscribeToken(contact.id);
    const unsubscribeUrl = `${options.unsubscribeBaseUrl}/${contact.id}?token=${unsubscribeToken}`;

    // Send email (unless dry run)
    if (options.dryRun) {
      console.log(`[DRY RUN] Would send email ${emailNumber} to ${contact.email}`);
      result.sent++;
      continue;
    }

    // pg-boss mode: enqueue individual send with staggered delay
    // Write sentinel BEFORE enqueue to prevent re-dispatch on concurrent cron runs.
    const minDelaySeconds =
      (campaign.min_send_interval_minutes ?? OUTREACH_MIN_SEND_INTERVAL_MINUTES) * 60;
    const randomDelaySeconds = Math.floor(
      Math.random() *
        (campaign.random_send_interval_minutes ?? OUTREACH_RANDOM_SEND_INTERVAL_MINUTES) *
        60,
    );
    const extraDelaySeconds = Math.ceil(strategy.extraDelayMs / 1000);
    const staggerDelay = sendIndex * (minDelaySeconds + randomDelaySeconds) + extraDelaySeconds;

    const sentinel = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // +1 year
    try {
      await db
        .update(outreachContacts)
        .set({ nextSendAt: sentinel, updatedAt: new Date().toISOString() })
        .where(eq(outreachContacts.id, contact.id));
    } catch (sentinelError) {
      console.error(`Failed to write sentinel for contact ${contact.id}:`, sentinelError);
      result.failed++;
      continue;
    }

    try {
      await enqueueOutreachSendEmail(
        {
          contactId: contact.id,
          campaignId: campaign.id,
          emailNumber,
          unsubscribeUrl,
          forceTextOnly: strategy.forceTextOnly,
        },
        { startAfter: staggerDelay },
      );
    } catch (enqueueError) {
      // Revert sentinel so the contact is retried on the next cron run
      const errMsg = enqueueError instanceof Error ? enqueueError.message : String(enqueueError);
      console.error(
        `pg-boss enqueue failed for contact ${contact.id}, reverting sentinel:`,
        enqueueError,
      );
      try {
        await db
          .update(outreachContacts)
          .set({ nextSendAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
          .where(eq(outreachContacts.id, contact.id));
      } catch (revertError) {
        // CRITICAL: Sentinel revert failed. The contact is now stuck with
        // next_send_at ~= now + 1 year and will never be picked up by cron
        // again until manually repaired.
        const revertMsg = revertError instanceof Error ? revertError.message : String(revertError);
        logger.error(
          "Sentinel revert failed after pg-boss enqueue error — contact is stuck with +1y next_send_at and requires manual repair",
          {
            contactId: contact.id,
            campaignId: campaign.id,
            emailNumber,
            stuckSentinel: sentinel,
            enqueueError: errMsg,
            revertError: revertMsg,
            repairHint: `UPDATE outreach_contacts SET next_send_at = NOW(), updated_at = NOW() WHERE id = '${contact.id}';`,
          },
        );
      }
      result.results.push({
        contactId: contact.id,
        emailNumber: emailNumber as 1 | 2 | 3,
        success: false,
        error: `pg-boss enqueue: ${errMsg}`,
      });
      result.failed++;
      continue;
    }

    result.sent++;
    sendIndex++;

    // Optimistically count against daily limits
    if (emailNumber === 1 && dailyLeadCounts.has(campaign.id)) {
      dailyLeadCounts.get(campaign.id)!.sent++;
    }
    if (dailyCampaignTotals.has(campaign.id)) {
      dailyCampaignTotals.get(campaign.id)!.sent++;
    }

    console.log(`Queued email ${emailNumber} to ${contact.email} (delay: ${staggerDelay}s)`);
  }

  console.log(
    `Processing complete: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`,
  );

  return result;
}

/**
 * Get summary of contacts due in next N hours
 * Useful for monitoring/reporting
 *
 * @param hours - Number of hours to look ahead
 * @returns Object with counts by timezone
 */
export async function getDueSummary(hours: number = OUTREACH_DUE_SUMMARY_HOURS): Promise<{
  total: number;
  byTimezone: Record<string, number>;
  byEmailNumber: Record<string, number>;
}> {
  try {
    const futureTime = new Date();
    futureTime.setHours(futureTime.getHours() + hours);

    const rows = await db
      .select({
        timezone: outreachContacts.timezone,
        currentStep: outreachContacts.currentStep,
      })
      .from(outreachContacts)
      .where(
        and(
          eq(outreachContacts.status, "active"),
          isNotNull(outreachContacts.nextSendAt),
          lte(outreachContacts.nextSendAt, futureTime.toISOString()),
        ),
      );

    const byTimezone: Record<string, number> = {};
    const byEmailNumber: Record<string, number> = {};

    for (const row of rows) {
      const tz = row.timezone || OUTREACH_DEFAULT_TIMEZONE;
      byTimezone[tz] = (byTimezone[tz] || 0) + 1;

      const emailNum = `email_${(row.currentStep ?? 0) + 1}`;
      byEmailNumber[emailNum] = (byEmailNumber[emailNum] || 0) + 1;
    }

    return {
      total: rows.length,
      byTimezone,
      byEmailNumber,
    };
  } catch (error) {
    console.error("Error fetching due summary:", error);
    return { total: 0, byTimezone: {}, byEmailNumber: {} };
  }
}
