/**
 * Handle email.received event (inbound reply detection)
 */

import { eq, ne, and, desc, asc, isNotNull, or } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "@/lib/db";
import {
  outreachContacts,
  outreachEmailEvents,
  outreachReplies,
  outreachSenderAccounts,
} from "@/lib/db/schema";
import type { EmailReceivedEvent, ReceivedEmailContent } from "../types";
import { extractContactIdFromReplyTo, getCompanyDomain } from "../../lib/utils";
import { markContactReplied, pauseContact, pauseContactsByDomain } from "../../contacts/actions";
import { updateCampaignStats } from "../../campaigns/actions";
import { getCampaign } from "../../campaigns/queries";
import { isAutoReply } from "../auto-reply-detector";
import { analyzeReply, type ConversationTurn } from "../../ai/reply-analyzer";
import { pushToCrm } from "../../crm/push-to-crm";
import { logger } from "@/lib/logger";

/**
 * Handle email received event (reply detection)
 *
 * @param event - Received event data
 * @param svixId - Svix event ID for idempotency (null if missing)
 * @returns True if handled successfully
 */
export async function handleEmailReceived(
  event: EmailReceivedEvent,
  svixId: string | null,
): Promise<boolean> {
  const { to, email_id } = event.data;

  // Fetch full inbound email content once (Resend webhook payload omits body/headers).
  // Used for both header-based contact lookup and AI analysis below.
  let emailContent: ReceivedEmailContent | null = null;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data } = await resend.emails.receiving.get(event.data.email_id);
    emailContent = data as ReceivedEmailContent | null;
  } catch (error) {
    logger.warn(
      "Failed to fetch email content from Resend Receiving API, falling back to webhook payload:",
      error,
    );
  }

  // Normalize headers — Resend may return Record or Array<{name,value}>.
  const resolvedHeaders: Record<string, string> = {};
  const rawHeaders = emailContent?.headers;
  if (Array.isArray(rawHeaders)) {
    for (const h of rawHeaders) resolvedHeaders[h.name.toLowerCase()] = h.value;
  } else if (rawHeaders && typeof rawHeaders === "object") {
    for (const [k, v] of Object.entries(rawHeaders)) resolvedHeaders[k.toLowerCase()] = String(v);
  }

  // Try UUID-based lookup first (precise — legacy emails sent with reply+uuid@ reply-to)
  const toAddress = to?.[0];
  const uuidFromTo = toAddress ? extractContactIdFromReplyTo(toAddress) : null;

  let contact: {
    id: string;
    campaignId: string | null;
    status: string | null;
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    jobTitle: string | null;
    phone: string | null;
    linkedinUrl: string | null;
    seniority: string | null;
    location: string | null;
    industry: string | null;
    companySize: string | null;
    email1Body: string;
    email1Subject: string;
    email1SentAt: string | null;
    email2Body: string | null;
    email2SentAt: string | null;
    email3Body: string | null;
    email3SentAt: string | null;
    senderAccountId: string | null;
  } | null = null;

  const contactSelect = {
    id: outreachContacts.id,
    campaignId: outreachContacts.campaignId,
    status: outreachContacts.status,
    email: outreachContacts.email,
    firstName: outreachContacts.firstName,
    lastName: outreachContacts.lastName,
    company: outreachContacts.company,
    jobTitle: outreachContacts.jobTitle,
    phone: outreachContacts.phone,
    linkedinUrl: outreachContacts.linkedinUrl,
    seniority: outreachContacts.seniority,
    location: outreachContacts.location,
    industry: outreachContacts.industry,
    companySize: outreachContacts.companySize,
    email1Body: outreachContacts.email1Body,
    email1Subject: outreachContacts.email1Subject,
    email1SentAt: outreachContacts.email1SentAt,
    email2Body: outreachContacts.email2Body,
    email2SentAt: outreachContacts.email2SentAt,
    email3Body: outreachContacts.email3Body,
    email3SentAt: outreachContacts.email3SentAt,
    senderAccountId: outreachContacts.senderAccountId,
  } as const;

  if (uuidFromTo) {
    // Legacy: emails sent before reply-to was simplified used reply+UUID@ routing.
    try {
      const [row] = await db
        .select(contactSelect)
        .from(outreachContacts)
        .where(eq(outreachContacts.id, uuidFromTo))
        .limit(1);
      contact = row ?? null;
    } catch (error) {
      logger.error("Error fetching contact by UUID for reply:", error);
      return false;
    }
  } else {
    // Primary path: match the inbound reply's In-Reply-To / References header
    // against email_N_resend_id of any contact. Resend uses the send id (a UUID)
    // as the Message-ID, so any UUID substring in those headers is a candidate.
    const inReplyTo =
      resolvedHeaders["in-reply-to"] ||
      ((event.data as Record<string, unknown>)["in_reply_to"] as string | undefined) ||
      "";
    const referencesHeader = resolvedHeaders["references"] || "";
    const headerHaystack = `${inReplyTo} ${referencesHeader}`;

    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const candidateIds = Array.from(new Set(headerHaystack.match(uuidPattern) ?? []));

    if (candidateIds.length > 0) {
      try {
        const [row] = await db
          .select(contactSelect)
          .from(outreachContacts)
          .where(
            or(
              ...candidateIds.flatMap((id) => [
                eq(outreachContacts.email1ResendId, id),
                eq(outreachContacts.email2ResendId, id),
                eq(outreachContacts.email3ResendId, id),
              ]),
            ),
          )
          .limit(1);
        contact = row ?? null;
        if (contact) {
          logger.info(`Reply routing: matched contact ${contact.id} via In-Reply-To header`);
        }
      } catch (error) {
        logger.error("Error fetching contact by In-Reply-To for reply:", error);
      }
    }

    // Fallback: match the from address against an outreach contact.
    if (!contact) {
      const fromAddress = event.data.from;
      if (!fromAddress) {
        logger.warn("email.received event missing to/UUID, headers, and from address");
        return false;
      }
      try {
        const [row] = await db
          .select(contactSelect)
          .from(outreachContacts)
          .where(eq(outreachContacts.email, fromAddress))
          .orderBy(desc(outreachContacts.updatedAt))
          .limit(1);
        contact = row ?? null;
        if (contact) {
          logger.warn(
            `Reply routing: using from-email fallback for ${fromAddress} — no In-Reply-To match`,
          );
        }
      } catch (error) {
        logger.error("Error fetching contact by email for reply:", error);
        return false;
      }
    }
  }

  if (!contact) {
    logger.warn(
      `No contact found for reply: to=${toAddress ?? "unknown"}, from=${event.data.from ?? "unknown"}`,
    );
    return false;
  }

  // Track whether this is the first reply (controls stats and status updates)
  const isFirstReply = contact.status !== "replied";

  const contactId = contact.id;

  // Ensure contact has a campaign_id
  if (!contact.campaignId) {
    logger.error("Contact has no campaign_id:", contactId);
    return false;
  }

  // Get campaign to check settings
  const campaign = await getCampaign(contact.campaignId);
  if (!campaign) {
    logger.error("Campaign not found for contact:", contactId);
    return false;
  }

  // Body extracted from the single Receiving API fetch up top.
  const bodyText: string | null = emailContent?.text ?? null;
  const bodyHtml: string | null = emailContent?.html ?? null;

  // Log the received event (use 0 for email_number since this is an inbound reply)
  try {
    await db.insert(outreachEmailEvents).values({
      contactId,
      emailNumber: 0, // Reply events use 0 to indicate inbound message
      eventType: "received",
      resendEmailId: email_id || null,
      svixId,
      createdAt: event.created_at,
    });
  } catch (error) {
    logger.error("Error logging received event:", error);
  }

  // Check if auto-reply (if setting enabled)
  if (campaign.stop_on_auto_reply && isAutoReply(resolvedHeaders, event.data.subject || "")) {
    logger.info(`Auto-reply detected from ${contact.email}, pausing sequence`);

    try {
      await db
        .update(outreachContacts)
        .set({
          autoReplyDetected: true,
          autoReplyDetectedAt: new Date().toISOString(),
        })
        .where(eq(outreachContacts.id, contactId));
    } catch (error) {
      logger.error("Error updating auto-reply status:", error);
    }

    await pauseContact(contactId);

    return true; // Don't mark as replied, but do pause sequence
  }

  // Mark contact as replied (stops sequence) — only on first reply
  if (isFirstReply) {
    await markContactReplied(contactId);
  }

  // Extract inbound Message-ID for threading admin replies
  const inboundMessageId: string | null =
    resolvedHeaders["message-id"] ||
    resolvedHeaders["Message-ID"] ||
    ((event.data as Record<string, unknown>).message_id as string) ||
    null;

  // Store reply content and run AI analysis
  let replyId: string | null = null;
  try {
    const inserted = await db
      .insert(outreachReplies)
      .values({
        contactId,
        campaignId: contact.campaignId,
        fromEmail: event.data.from || contact.email,
        subject: event.data.subject || null,
        bodyText,
        bodyHtml,
        receivedAt: event.created_at || new Date().toISOString(),
        inboundMessageId,
      })
      .onConflictDoNothing({ target: outreachReplies.inboundMessageId })
      .returning({ id: outreachReplies.id });

    if (inserted.length === 0) {
      logger.info("Duplicate inbound reply ignored (Message-ID conflict):", inboundMessageId);
      return true; // Already processed — acknowledge and skip AI analysis
    }

    replyId = inserted[0]?.id || null;
  } catch (e) {
    logger.error("Unexpected error inserting reply:", e);
  }

  if (replyId) {
    try {
      const contactName =
        [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email;

      // Build chronological conversation history (turns prior to the new reply)
      // so the analyzer can classify in context of the whole thread.
      const conversationHistory = await buildConversationHistory(contactId, replyId, contact);

      // Resolve the sender's first name so the AI signs the suggested reply
      // as the actual person who sent the campaign. Falls back to "Jake"
      // (single-tenant default) if the contact has no sender_account_id or
      // the lookup fails.
      let senderFirstName = "Jake";
      if (contact.senderAccountId) {
        try {
          const [senderRow] = await db
            .select({ name: outreachSenderAccounts.name })
            .from(outreachSenderAccounts)
            .where(eq(outreachSenderAccounts.id, contact.senderAccountId))
            .limit(1);
          if (senderRow?.name) {
            const first = senderRow.name.trim().split(/\s+/)[0];
            if (first) senderFirstName = first;
          }
        } catch (senderErr) {
          logger.error("Error fetching sender account for AI signoff:", senderErr);
        }
      }

      const analysis = await analyzeReply(
        contactName,
        contact.company ?? null,
        campaign.name,
        bodyText || "",
        event.data.subject || null,
        contact.email1Body || null,
        contact.jobTitle ?? null,
        senderFirstName,
        conversationHistory,
      );
      try {
        await db
          .update(outreachReplies)
          .set({
            sentiment: analysis.sentiment,
            aiSummary: analysis.summary,
            aiSuggestedReply: analysis.suggestedReply,
            intent: analysis.intent,
          })
          .where(eq(outreachReplies.id, replyId));
      } catch (error) {
        logger.error("Error updating reply with AI analysis:", error);
      }

      if (analysis.sentiment === "positive") {
        // Check if any prior reply for this contact already pushed to CRM
        try {
          const [existingCrmReply] = await db
            .select({ crmContactId: outreachReplies.crmContactId })
            .from(outreachReplies)
            .where(
              and(
                eq(outreachReplies.contactId, contactId),
                isNotNull(outreachReplies.crmContactId),
              ),
            )
            .limit(1);

          if (existingCrmReply) {
            logger.info(
              `Skipping CRM push for contact ${contactId} — already pushed (crm_contact_id=${existingCrmReply.crmContactId})`,
            );
          } else {
            try {
              const crmResult = await pushToCrm(
                {
                  email: contact.email,
                  firstName: contact.firstName ?? null,
                  lastName: contact.lastName ?? null,
                  company: contact.company ?? null,
                  jobTitle: contact.jobTitle ?? null,
                  phone: contact.phone ?? null,
                  linkedinUrl: contact.linkedinUrl ?? null,
                  seniority: contact.seniority ?? null,
                  location: contact.location ?? null,
                  industry: contact.industry ?? null,
                  companySize: contact.companySize ?? null,
                },
                campaign.name,
                {
                  aiSummary: analysis.summary,
                  intent: analysis.intent,
                },
              );
              if (crmResult) {
                await db
                  .update(outreachReplies)
                  .set({
                    crmContactId: crmResult.crmContactId,
                    crmDealId: crmResult.crmDealId,
                    pushedToCrmAt: new Date().toISOString(),
                  })
                  .where(eq(outreachReplies.id, replyId));
                logger.info(
                  `Pushed positive reply to CRM: contact=${crmResult.crmContactId}, deal=${crmResult.crmDealId}`,
                );
              }
            } catch (crmErr) {
              logger.error("Error pushing reply to CRM:", crmErr);
            }
          }
        } catch (error) {
          logger.error("Error checking existing CRM reply:", error);
        }
      }
    } catch (aiErr) {
      logger.error("Error in AI analysis for reply:", aiErr);
    }
  }

  // Check if company-wide reply stop is enabled
  if (campaign.stop_company_on_reply) {
    const companyDomain = getCompanyDomain(contact.email);
    if (companyDomain) {
      const pausedCount = await pauseContactsByDomain(campaign.id, companyDomain);
      logger.info(
        `Paused ${pausedCount} contacts from ${companyDomain} in campaign ${campaign.id}`,
      );
    }
  }

  // Update campaign stats — only count the first reply
  if (isFirstReply) {
    await updateCampaignStats(contact.campaignId, {
      total_replied: 1,
    });
  }

  logger.info(
    isFirstReply
      ? `Marked contact ${contactId} as replied`
      : `Stored follow-up reply from contact ${contactId}`,
  );
  return true;
}

/**
 * Assemble the prior turns of a thread (outbound emails 1-3, prior inbound
 * replies, and prior admin responses) in chronological order so the AI can
 * classify a new inbound reply with full context.
 *
 * The newly-inserted reply (`newReplyId`) is excluded so it doesn't appear in
 * its own "history".
 */
async function buildConversationHistory(
  contactId: string,
  newReplyId: string,
  contact: {
    email1Body: string;
    email1SentAt: string | null;
    email2Body: string | null;
    email2SentAt: string | null;
    email3Body: string | null;
    email3SentAt: string | null;
  },
): Promise<ConversationTurn[]> {
  const turns: ConversationTurn[] = [];

  // Outbound campaign emails
  if (contact.email1Body && contact.email1SentAt) {
    turns.push({ role: "us", body: contact.email1Body, sentAt: contact.email1SentAt });
  }
  if (contact.email2Body && contact.email2SentAt) {
    turns.push({ role: "us", body: contact.email2Body, sentAt: contact.email2SentAt });
  }
  if (contact.email3Body && contact.email3SentAt) {
    turns.push({ role: "us", body: contact.email3Body, sentAt: contact.email3SentAt });
  }

  // Prior reply rows (older than the just-inserted reply)
  try {
    const priorReplies = await db
      .select({
        bodyText: outreachReplies.bodyText,
        receivedAt: outreachReplies.receivedAt,
        replyBody: outreachReplies.replyBody,
        replySentAt: outreachReplies.replySentAt,
      })
      .from(outreachReplies)
      .where(and(eq(outreachReplies.contactId, contactId), ne(outreachReplies.id, newReplyId)))
      .orderBy(asc(outreachReplies.receivedAt));

    for (const r of priorReplies) {
      if (r.bodyText && r.receivedAt) {
        turns.push({ role: "them", body: r.bodyText, sentAt: r.receivedAt });
      }
      if (r.replyBody && r.replySentAt) {
        turns.push({ role: "us", body: r.replyBody, sentAt: r.replySentAt });
      }
    }
  } catch (error) {
    logger.error("Error fetching prior replies for conversation history:", error);
  }

  turns.sort((a, b) => (a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0));
  return turns;
}
