/**
 * Email sending via Resend
 */

import DOMPurify from "isomorphic-dompurify";
import { eq } from "drizzle-orm";
import type { Resend } from "resend";
import { db } from "@/lib/db";
import { outreachCampaignSenders } from "@/lib/db/schema";
import type { Contact, Campaign, SenderAccount } from "../types";
import type { SendResult } from "./types";
import { htmlToPlainText } from "../lib/utils";
import { getThreadingHeaders, getEmailSubject, getEmailBody } from "./threading";
import { updateContact } from "../contacts/actions";
import { calculateEmail2SendTime, calculateEmail3SendTime } from "../scheduling/calculator";
import type { BusinessHoursConfig } from "../types/config";
import { updateCampaignStats } from "../campaigns/actions";
import {
  getAvailableSenders,
  incrementSenderCount,
  updateSenderLastSent,
  resetDailySenderCounts as resetDailySenderCountsQuery,
} from "./queries";

/**
 * Cache for Resend domain tracking state to avoid redundant API calls.
 * Key: domain name, Value: { domainId, openTracking, clickTracking }
 */
const domainTrackingCache = new Map<
  string,
  { domainId: string; openTracking: boolean; clickTracking: boolean }
>();

/**
 * Ensure the Resend domain's tracking settings match the campaign configuration.
 * Resend only supports open/click tracking at the domain level, so we sync
 * the domain settings before sending. Results are cached to avoid redundant
 * API calls within the same process lifetime.
 */
async function syncDomainTracking(
  resend: Resend,
  senderDomain: string,
  campaign: Campaign,
): Promise<void> {
  const wantOpen = campaign.track_opens ?? true;
  const wantClick = campaign.track_clicks ?? true;

  // Check cache first
  const cached = domainTrackingCache.get(senderDomain);
  if (cached && cached.openTracking === wantOpen && cached.clickTracking === wantClick) {
    return; // Already in sync
  }

  try {
    // Look up domain ID from Resend
    const domainsResponse = await resend.domains.list();
    if (domainsResponse.error || !domainsResponse.data) {
      console.warn(
        `Failed to list Resend domains for tracking sync: ${domainsResponse.error?.message}`,
      );
      return;
    }

    const domain = domainsResponse.data.data?.find(
      (d) => d.name === senderDomain && d.status === "verified",
    );

    if (!domain) {
      console.warn(
        `Resend domain "${senderDomain}" not found or not verified, skipping tracking sync`,
      );
      return;
    }

    // Check if update is needed (use cached state or assume mismatch on first call)
    if (cached && cached.domainId === domain.id) {
      // Cache exists but values differ — update needed
    }

    // Update domain tracking settings
    const updateResponse = await resend.domains.update({
      id: domain.id,
      openTracking: wantOpen,
      clickTracking: wantClick,
    });

    if (updateResponse.error) {
      console.warn(`Failed to update Resend domain tracking: ${updateResponse.error.message}`);
      return;
    }

    // Update cache
    domainTrackingCache.set(senderDomain, {
      domainId: domain.id,
      openTracking: wantOpen,
      clickTracking: wantClick,
    });
  } catch (error) {
    // Non-fatal: tracking sync failure should not block email sending
    console.warn("Failed to sync domain tracking settings:", error);
  }
}

/**
 * Select an available sender account for a campaign
 * Implements load balancing by selecting sender with lowest email count
 *
 * @param campaignId - Campaign ID
 * @returns Available sender account or null if none available
 */
export async function selectAvailableSender(campaignId: string): Promise<SenderAccount | null> {
  const availableSenders = await getAvailableSenders(campaignId);

  if (availableSenders.length === 0) {
    return null;
  }

  // Sort by emails_sent_today ascending (lowest first) for load balancing
  availableSenders.sort((a, b) => (a.emails_sent_today ?? 0) - (b.emails_sent_today ?? 0));

  // Return sender with lowest usage
  return availableSenders[0];
}

/**
 * Reset daily email counts for all sender accounts
 * Should be called by a daily cron job at midnight
 *
 * @returns Number of senders reset
 */
export async function resetDailySenderCounts(): Promise<number> {
  return await resetDailySenderCountsQuery();
}

/**
 * Send an email via Resend
 *
 * @param resend - Resend client
 * @param contact - Contact to send to
 * @param campaign - Campaign details
 * @param emailNumber - Which email to send (1, 2, or 3)
 * @param unsubscribeUrl - Unsubscribe URL for footer
 * @param options - Additional options
 * @returns Send result
 *
 * @example
 * ```typescript
 * const result = await sendEmail(
 *   resend,
 *   contact,
 *   campaign,
 *   1,
 *   'https://example.com/unsubscribe/contact-id'
 * )
 * ```
 */
export async function sendEmail(
  resend: Resend,
  contact: Contact,
  campaign: Campaign,
  emailNumber: 1 | 2 | 3,
  unsubscribeUrl: string,
  options?: { forceTextOnly?: boolean; businessHours?: BusinessHoursConfig },
): Promise<SendResult> {
  const result: SendResult = {
    success: false,
    contactId: contact.id,
    emailNumber,
  };

  try {
    // Select an available sender account
    const sender = await selectAvailableSender(campaign.id);

    if (!sender) {
      // Check if campaign has any senders configured
      try {
        const campaignSenders = await db
          .select({ senderId: outreachCampaignSenders.senderId })
          .from(outreachCampaignSenders)
          .where(eq(outreachCampaignSenders.campaignId, campaign.id))
          .limit(1);

        if (!campaignSenders || campaignSenders.length === 0) {
          result.error = "No senders configured for campaign";
        } else {
          result.error = "No available senders (daily limit reached)";
        }
      } catch {
        result.error = "No available senders";
      }
      return result;
    }

    // Get email content
    const subject = getEmailSubject(contact, emailNumber);
    const rawBody = getEmailBody(contact, emailNumber);
    // Replace all template variables in body
    const body = substituteVariables(rawBody, contact, unsubscribeUrl);

    // Get threading headers (for Email 2)
    const threadingHeaders = getThreadingHeaders(contact, emailNumber);

    // Use selected sender account
    const fromEmail = sender.email;
    const fromName = sender.name;
    const domain = fromEmail.split("@")[1];

    // ---------------------------------------------------------------------
    // CRITICAL: Reply-To MUST be the sender's plain mailbox.
    //
    // DO NOT change this back to `reply+UUID@domain` or any other synthetic
    // address. Recipients see Reply-To in their email client when they hit
    // "Reply", and a UUID-suffixed address looks fake / spam-like and damages
    // deliverability + trust.
    //
    // Inbound replies are matched back to the originating contact via the
    // In-Reply-To / References Message-ID headers in the reply (Resend uses
    // the send id as Message-ID). See lib/outreach/webhooks/events/received.ts.
    //
    // Falling back to from-address matching covers the rare case where the
    // recipient strips threading headers.
    // ---------------------------------------------------------------------
    const replyTo = fromEmail;

    // Sync Resend domain tracking settings to match campaign configuration.
    // Resend only supports open/click tracking at the domain level, so we
    // update the domain settings before sending. Cached to avoid redundant calls.
    await syncDomainTracking(resend, domain, campaign);

    // Determine if this email should be sent as plain text
    const useTextOnly =
      campaign.text_only === true ||
      (campaign.text_only_first === true && emailNumber === 1) ||
      options?.forceTextOnly === true;

    // Unsubscribe handling: WYSIWYG.
    // We never auto-append a visible unsubscribe footer to the body. If the campaign
    // template wants one in-body, it must include the {{unsubscribe_url}} token (or a
    // hand-written link) in the body itself — that token is substituted by
    // substituteVariables() above.
    //
    // Compliance / deliverability for cold outreach is still covered by the
    // List-Unsubscribe + List-Unsubscribe-Post headers set below (RFC 8058 /
    // Gmail bulk-sender rules), which surface the native "Unsubscribe" affordance
    // in Gmail/Outlook at the top of the message.
    //
    // `unsubscribeUrl` is still referenced for header construction and (via the
    // {{unsubscribe_url}} substitution) for any in-body link the user opts into.

    // Build tags - always include all IDs for webhook routing
    // campaign_id must always be present: bounce/delivered webhooks fire
    // regardless of tracking settings and need it for stats + auto-pause
    const tags: Array<{ name: string; value: string }> = [
      { name: "contact_id", value: contact.id },
      { name: "campaign_id", value: campaign.id },
      { name: "email_number", value: emailNumber.toString() },
      { name: "sender_account_id", value: sender.id },
    ];

    // Build shared options
    const sharedOptions = {
      from: `${fromName} <${fromEmail}>`,
      to: contact.email,
      replyTo: replyTo,
      ...(campaign.cc_recipients &&
        campaign.cc_recipients.length > 0 && {
          cc: campaign.cc_recipients,
        }),
      ...(campaign.bcc_recipients &&
        campaign.bcc_recipients.length > 0 && {
          bcc: campaign.bcc_recipients,
        }),
      subject,
      headers: {
        ...threadingHeaders,
        // RFC 8058: List-Unsubscribe points to the API route that handles POST
        // requests from email clients (Gmail/Outlook one-click unsubscribe).
        // Construct independently from contactId/token rather than transforming
        // the browser-facing URL, to avoid fragile string replacement.
        "List-Unsubscribe": `<${new URL(`/api/outreach/unsubscribe/${contact.id}?token=${unsubscribeUrl.split("token=")[1]}`, unsubscribeUrl).href}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        Precedence: "bulk",
        ...(campaign.insert_unsubscribe_header && {
          Unsubscribe: `<${unsubscribeUrl}>`,
        }),
      },
      tags,
    };

    // Send via Resend — text-only or HTML based on campaign settings.
    // When the body contains a {{unsubscribe_url}} token it's already been substituted
    // above; htmlToPlainText preserves <a href="...">text</a> as "text: url" in the
    // text-only path so the unsubscribe link is still reachable.
    const response = useTextOnly
      ? await resend.emails.send({
          ...sharedOptions,
          text: htmlToPlainText(body),
        })
      : await resend.emails.send({
          ...sharedOptions,
          html: body,
        });

    if (response.error) {
      throw new Error(response.error.message);
    }

    result.success = true;
    result.resendId = response.data?.id;
    result.messageId = response.data?.id; // Resend uses ID as Message-ID

    // Update sender account statistics
    await Promise.all([incrementSenderCount(sender.id), updateSenderLastSent(sender.id)]);

    // Update contact in database
    await updateContactAfterSend(
      contact,
      campaign,
      emailNumber,
      sender.id,
      result.resendId,
      result.messageId,
      options?.businessHours,
    );

    // Update campaign stats
    await updateCampaignStats(campaign.id, {
      total_sent: 1,
    });
  } catch (error) {
    console.error(`Error sending email ${emailNumber} to ${contact.email}:`, error);
    result.error = error instanceof Error ? error.message : "Unknown error";
  }

  return result;
}

/**
 * Update contact after successful send
 */
async function updateContactAfterSend(
  contact: Contact,
  campaign: Campaign,
  emailNumber: number,
  senderAccountId: string,
  resendId?: string,
  messageId?: string,
  businessHours?: BusinessHoursConfig,
): Promise<void> {
  const now = new Date().toISOString();

  // Base updates
  const updates: Record<string, unknown> = {
    current_step: emailNumber,
    sender_account_id: senderAccountId,
  };

  // Set sent timestamp and IDs
  if (emailNumber === 1) {
    updates.email_1_sent_at = now;
    updates.email_1_resend_id = resendId;
    updates.email_1_message_id = messageId;
    updates.next_send_at = calculateEmail2SendTime(
      contact,
      campaign.email_2_delay ?? undefined,
      true,
      businessHours,
    ).toISOString();
  } else if (emailNumber === 2) {
    updates.email_2_sent_at = now;
    updates.email_2_resend_id = resendId;
    updates.next_send_at = calculateEmail3SendTime(
      contact,
      campaign.email_3_delay ?? undefined,
      true,
      businessHours,
    ).toISOString();
  } else if (emailNumber === 3) {
    updates.email_3_sent_at = now;
    updates.email_3_resend_id = resendId;
    updates.status = "completed";
    updates.next_send_at = null;
  }

  await updateContact(contact.id, updates);
}

/**
 * Test email sending (for development/testing)
 *
 * @param resend - Resend client
 * @param to - Test recipient email
 * @returns True if sent successfully
 */
export async function sendTestEmail(resend: Resend, to: string): Promise<boolean> {
  try {
    const response = await resend.emails.send({
      from: "__YOUR_BRAND__ <onboarding@resend.dev>", // Resend test domain
      to,
      subject: "Test Email from Outreach System",
      html: "<p>This is a test email from the __YOUR_BRAND__ outreach system.</p>",
    });

    if (response.error) {
      console.error("Test email error:", response.error);
      return false;
    }

    console.log("Test email sent:", response.data?.id);
    return true;
  } catch (error) {
    console.error("Test email exception:", error);
    return false;
  }
}

/**
 * Replace all {{variable}} tokens in an email body with real contact values.
 * Unknown tokens are left as-is so they are visible to the sender.
 */
function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function substituteVariables(body: string, contact: Contact, unsubscribeUrl: string): string {
  const vars: Record<string, string> = {
    first_name: htmlEscape(contact.first_name ?? ""),
    last_name: htmlEscape(contact.last_name ?? ""),
    email: htmlEscape(contact.email),
    company: htmlEscape(contact.company ?? ""),
    job_title: htmlEscape(contact.job_title ?? ""),
    phone: htmlEscape(contact.phone ?? ""),
    location: htmlEscape(contact.location ?? ""),
    website_url: htmlEscape(contact.website_url ?? ""),
    linkedin_url: htmlEscape(contact.linkedin_url ?? ""),
    timezone: htmlEscape(contact.timezone ?? ""),
    research_report: DOMPurify.sanitize(contact.research_report ?? ""), // sanitize — strips XSS vectors including javascript: URLs, event handlers, CSS injection
    unsubscribe_url: unsubscribeUrl,
  };

  return body.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in vars ? vars[key] : match));
}
