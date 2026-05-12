import { NextRequest } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachReplies, outreachContacts, outreachCampaigns } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { pushToCrm } from "@/lib/outreach/crm/push-to-crm";

// Columns selected for contact in detail/thread views
const contactColumns = {
  id: outreachContacts.id,
  firstName: outreachContacts.firstName,
  lastName: outreachContacts.lastName,
  email: outreachContacts.email,
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
  email2Subject: outreachContacts.email2Subject,
  email2SentAt: outreachContacts.email2SentAt,
  email3Body: outreachContacts.email3Body,
  email3Subject: outreachContacts.email3Subject,
  email3SentAt: outreachContacts.email3SentAt,
} as const;

async function fetchReplyWithJoins(replyId: string) {
  const [row] = await db
    .select({
      reply: outreachReplies,
      contact: contactColumns,
      campaign: {
        id: outreachCampaigns.id,
        name: outreachCampaigns.name,
      },
    })
    .from(outreachReplies)
    .leftJoin(outreachContacts, eq(outreachReplies.contactId, outreachContacts.id))
    .leftJoin(outreachCampaigns, eq(outreachReplies.campaignId, outreachCampaigns.id))
    .where(eq(outreachReplies.id, replyId))
    .limit(1);

  if (!row) return null;

  const r = row.reply;
  return {
    id: r.id,
    contact_id: r.contactId,
    campaign_id: r.campaignId,
    from_email: r.fromEmail,
    subject: r.subject,
    body_text: r.bodyText,
    body_html: r.bodyHtml,
    sentiment: r.sentiment,
    intent: r.intent,
    ai_summary: r.aiSummary,
    ai_suggested_reply: r.aiSuggestedReply,
    is_read: r.isRead,
    is_archived: r.isArchived,
    received_at: r.receivedAt,
    created_at: r.createdAt,
    inbound_message_id: r.inboundMessageId,
    crm_contact_id: r.crmContactId,
    crm_deal_id: r.crmDealId,
    pushed_to_crm_at: r.pushedToCrmAt,
    reply_body: r.replyBody,
    reply_sender_email: r.replySenderEmail,
    reply_sent_at: r.replySentAt,
    contact: row.contact
      ? {
          id: row.contact.id,
          first_name: row.contact.firstName,
          last_name: row.contact.lastName,
          email: row.contact.email,
          company: row.contact.company,
          job_title: row.contact.jobTitle,
          phone: row.contact.phone,
          linkedin_url: row.contact.linkedinUrl,
          seniority: row.contact.seniority,
          location: row.contact.location,
          industry: row.contact.industry,
          company_size: row.contact.companySize,
          email_1_body: row.contact.email1Body,
          email_1_subject: row.contact.email1Subject,
          email_1_sent_at: row.contact.email1SentAt,
          email_2_body: row.contact.email2Body,
          email_2_subject: row.contact.email2Subject,
          email_2_sent_at: row.contact.email2SentAt,
          email_3_body: row.contact.email3Body,
          email_3_subject: row.contact.email3Subject,
          email_3_sent_at: row.contact.email3SentAt,
        }
      : null,
    campaign: row.campaign
      ? {
          id: row.campaign.id,
          name: row.campaign.name,
        }
      : null,
  };
}

/**
 * GET /api/outreach/replies/[replyId]
 *
 * Fetch a single outreach reply by ID.
 * Returns full contact data including email bodies for thread view.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ replyId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { replyId } = await params;

    const reply = await fetchReplyWithJoins(replyId);

    if (!reply) {
      return Response.json({ error: "Reply not found" }, { status: 404 });
    }

    // Fetch all sibling replies for the same contact to build full conversation thread
    const rawSiblings = await db
      .select({
        id: outreachReplies.id,
        fromEmail: outreachReplies.fromEmail,
        subject: outreachReplies.subject,
        bodyText: outreachReplies.bodyText,
        bodyHtml: outreachReplies.bodyHtml,
        receivedAt: outreachReplies.receivedAt,
        inboundMessageId: outreachReplies.inboundMessageId,
        replySentAt: outreachReplies.replySentAt,
        replyBody: outreachReplies.replyBody,
        replySenderEmail: outreachReplies.replySenderEmail,
        sentiment: outreachReplies.sentiment,
        intent: outreachReplies.intent,
        aiSummary: outreachReplies.aiSummary,
        aiSuggestedReply: outreachReplies.aiSuggestedReply,
      })
      .from(outreachReplies)
      .where(eq(outreachReplies.contactId, reply.contact_id))
      .orderBy(asc(outreachReplies.receivedAt));

    const siblingReplies = rawSiblings.map((s) => ({
      id: s.id,
      from_email: s.fromEmail,
      subject: s.subject,
      body_text: s.bodyText,
      body_html: s.bodyHtml,
      received_at: s.receivedAt,
      inbound_message_id: s.inboundMessageId,
      reply_sent_at: s.replySentAt,
      reply_body: s.replyBody,
      reply_sender_email: s.replySenderEmail,
      sentiment: s.sentiment,
      intent: s.intent,
      ai_summary: s.aiSummary,
      ai_suggested_reply: s.aiSuggestedReply,
    }));

    return Response.json({ reply, siblingReplies }, { status: 200 });
  } catch (error) {
    logger.error("Unexpected error in GET /api/outreach/replies/[replyId]:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/outreach/replies/[replyId]
 *
 * Update a reply's metadata (is_read, is_archived, sentiment) or push to CRM.
 *
 * @body is_read - Mark as read/unread
 * @body is_archived - Archive/unarchive
 * @body sentiment - Update sentiment classification
 * @body action - 'push_to_crm' to create CRM contact+deal from this reply
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ replyId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { replyId } = await params;

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    // Handle push_to_crm action
    if (body.action === "push_to_crm") {
      const reply = await fetchReplyWithJoins(replyId);

      if (!reply) {
        return Response.json({ error: "Reply not found" }, { status: 404 });
      }

      if (reply.pushed_to_crm_at || reply.crm_contact_id) {
        return Response.json({ error: "Reply has already been pushed to CRM" }, { status: 409 });
      }

      const contact = reply.contact as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string;
        company: string | null;
        job_title: string | null;
        phone: string | null;
        linkedin_url: string | null;
        seniority: string | null;
        location: string | null;
        industry: string | null;
        company_size: string | null;
      } | null;
      const campaign = reply.campaign as { id: string; name: string } | null;

      if (!contact) {
        return Response.json({ error: "No contact associated with this reply" }, { status: 400 });
      }

      const crmResult = await pushToCrm(
        {
          email: contact.email,
          firstName: contact.first_name,
          lastName: contact.last_name,
          company: contact.company,
          jobTitle: contact.job_title,
          phone: contact.phone,
          linkedinUrl: contact.linkedin_url,
          seniority: contact.seniority,
          location: contact.location,
          industry: contact.industry,
          companySize: contact.company_size,
        },
        campaign?.name ?? "Unknown Campaign",
        {
          aiSummary: reply.ai_summary ?? null,
          intent: reply.intent ?? null,
        },
      );

      if (!crmResult) {
        return Response.json({ error: "Failed to push reply to CRM" }, { status: 500 });
      }

      await db
        .update(outreachReplies)
        .set({
          crmContactId: crmResult.crmContactId,
          crmDealId: crmResult.crmDealId,
          pushedToCrmAt: new Date().toISOString(),
        })
        .where(eq(outreachReplies.id, replyId));

      const updatedReply = await fetchReplyWithJoins(replyId);

      if (!updatedReply) {
        return Response.json(
          { error: "CRM push succeeded but failed to fetch updated reply" },
          { status: 500 },
        );
      }

      return Response.json({ reply: updatedReply }, { status: 200 });
    }

    // Handle field updates (is_read, is_archived, sentiment)
    const updateFields: Record<string, unknown> = {};

    if (typeof body.is_read === "boolean") {
      updateFields.isRead = body.is_read;
    }

    if (typeof body.is_archived === "boolean") {
      updateFields.isArchived = body.is_archived;
    }

    if (typeof body.sentiment === "string") {
      const VALID_SENTIMENTS = ["positive", "negative", "neutral"];
      if (!VALID_SENTIMENTS.includes(body.sentiment)) {
        return Response.json(
          { error: "Invalid sentiment value. Must be positive, negative, or neutral." },
          { status: 400 },
        );
      }
      updateFields.sentiment = body.sentiment;
    }

    if (Object.keys(updateFields).length === 0) {
      return Response.json({ error: "No valid fields to update" }, { status: 400 });
    }

    await db.update(outreachReplies).set(updateFields).where(eq(outreachReplies.id, replyId));

    const updatedReply = await fetchReplyWithJoins(replyId);

    if (!updatedReply) {
      return Response.json(
        { error: "Update succeeded but failed to fetch updated reply" },
        { status: 500 },
      );
    }

    return Response.json({ reply: updatedReply }, { status: 200 });
  } catch (error) {
    logger.error("Unexpected error in PATCH /api/outreach/replies/[replyId]:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
