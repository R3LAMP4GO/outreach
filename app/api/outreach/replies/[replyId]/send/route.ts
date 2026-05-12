import { NextRequest } from "next/server";
import { Resend } from "resend";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachReplies, outreachContacts, outreachCampaigns, contacts } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { selectAvailableSender } from "@/lib/outreach/sending/sender";
import { incrementSenderCount } from "@/lib/outreach/sending/queries";
import { writeTimelineEvent } from "@/lib/crm/timeline";
import { buildQuotedReplyText, buildQuotedReplyHtml } from "@/lib/email/build-quoted-reply";

/**
 * POST /api/outreach/replies/[replyId]/send
 *
 * Send an admin reply to an inbound outreach reply.
 * Threads the email using In-Reply-To headers if inbound_message_id is stored.
 *
 * @body body - The reply text to send
 */
export async function POST(
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

    let body: { body?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    const replyBody = body.body?.trim();
    if (!replyBody) {
      return Response.json({ error: "Reply body is required" }, { status: 400 });
    }

    // Fetch reply with contact + campaign
    const [replyRow] = await db
      .select({
        reply: outreachReplies,
        contact: {
          id: outreachContacts.id,
          email: outreachContacts.email,
          firstName: outreachContacts.firstName,
          lastName: outreachContacts.lastName,
          company: outreachContacts.company,
          campaignId: outreachContacts.campaignId,
          timezone: outreachContacts.timezone,
        },
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

    if (!replyRow) {
      return Response.json({ error: "Reply not found" }, { status: 404 });
    }

    const reply = replyRow.reply;
    const contact = replyRow.contact;

    if (reply.replySentAt) {
      return Response.json({ error: "Reply has already been sent" }, { status: 409 });
    }

    // Pre-flight validation — must pass before acquiring the idempotency lock
    if (!contact?.email) {
      return Response.json(
        { error: "No contact email associated with this reply" },
        { status: 400 },
      );
    }

    const campaignId = reply.campaignId;
    if (!campaignId) {
      return Response.json({ error: "Reply has no associated campaign" }, { status: 400 });
    }

    // Select sender account
    const sender = await selectAvailableSender(campaignId);
    if (!sender) {
      return Response.json(
        { error: "No available sender accounts for this campaign" },
        { status: 422 },
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      logger.error("RESEND_API_KEY not set");
      return Response.json({ error: "Email service not configured" }, { status: 500 });
    }

    // Atomic idempotency lock: claim the send slot before any work to prevent
    // duplicate sends from concurrent requests that both pass the check above.
    const now = new Date().toISOString();
    const [locked] = await db
      .update(outreachReplies)
      .set({ replySentAt: now })
      .where(and(eq(outreachReplies.id, replyId), isNull(outreachReplies.replySentAt)))
      .returning({ id: outreachReplies.id });

    if (!locked) {
      return Response.json({ error: "Reply has already been sent" }, { status: 409 });
    }

    // Build subject with Re: prefix
    const originalSubject = reply.subject || "";
    const subject = /^re:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`;

    // Build threading headers
    // Strip control characters (CRLF etc.) from the stored value to prevent header injection.
    const headers: Record<string, string> = {};
    if (reply.inboundMessageId) {
      const sanitizedId = reply.inboundMessageId.replace(/[\r\n\0]/g, "").trim();
      if (sanitizedId) {
        const messageId = sanitizedId.startsWith("<") ? sanitizedId : `<${sanitizedId}>`;
        headers["In-Reply-To"] = messageId;
        headers["References"] = messageId;
      }
    }

    // ---------------------------------------------------------------------
    // CRITICAL: Reply-To MUST be the sender's plain mailbox.
    //
    // DO NOT change this back to `reply+UUID@domain` or any other synthetic
    // address. Recipients see Reply-To in their email client when they hit
    // "Reply", and a UUID-suffixed address looks fake / spam-like and damages
    // deliverability + trust.
    //
    // Inbound replies are matched back to the originating contact via the
    // In-Reply-To / References Message-ID headers (Resend's official threading
    // mechanism — see https://resend.com/docs/dashboard/receiving/reply-to-emails).
    // The webhook handler at lib/outreach/webhooks/events/received.ts performs
    // this matching, with from-address as a secondary fallback.
    //
    // The same rule is locked in lib/outreach/sending/sender.ts for outreach
    // campaign sends. Keep both call sites consistent.
    // ---------------------------------------------------------------------
    const replyTo = sender.email;

    const resend = new Resend(resendApiKey);

    // Build Gmail-style threaded body — bare reply at top, quoted prior message
    // below. Each inbound already contains its own quoted ancestor chain, so
    // quoting only the immediate previous message preserves full thread depth.
    const fromName = contact?.firstName
      ? `${contact.firstName} ${contact.lastName ?? ""}`.trim()
      : null;
    const inboundSource = {
      fromEmail: reply.fromEmail,
      fromName,
      receivedAt: reply.receivedAt,
      bodyText: reply.bodyText,
      bodyHtml: reply.bodyHtml,
      timezone: contact?.timezone ?? null,
    };
    const textBody = buildQuotedReplyText(replyBody, inboundSource);
    const htmlBody = buildQuotedReplyHtml(replyBody, inboundSource);

    const sendResult = await resend.emails.send({
      from: `${sender.name} <${sender.email}>`,
      to: reply.fromEmail,
      subject,
      text: textBody,
      html: htmlBody,
      replyTo,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    });

    if (sendResult.error) {
      logger.error("Resend error sending admin reply:", sendResult.error);
      // Rollback the idempotency lock so the user can retry
      await db
        .update(outreachReplies)
        .set({ replySentAt: null })
        .where(eq(outreachReplies.id, replyId));
      return Response.json(
        { error: "Failed to send reply: " + sendResult.error.message },
        { status: 500 },
      );
    }

    // Increment sender daily count so load balancing stays accurate
    await incrementSenderCount(sender.id);

    // Update remaining fields — reply_sent_at already written by the lock above
    const [updatedReply] = await db
      .update(outreachReplies)
      .set({
        replyBody,
        replySenderEmail: sender.email,
      })
      .where(eq(outreachReplies.id, replyId))
      .returning();

    if (!updatedReply) {
      // Email sent and reply_sent_at already written — return 207 so UI shows partial success
      return Response.json(
        {
          warning: "Reply sent but metadata update failed",
          reply: {
            id: replyId,
            reply_sent_at: now,
            reply_body: replyBody,
            reply_sender_email: sender.email,
          },
        },
        { status: 207 },
      );
    }

    logger.info(`Admin reply sent for reply ${replyId} from ${sender.email} to ${reply.fromEmail}`);

    // Write timeline event — awaited to ensure completion on serverless
    const [crmContact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.email, reply.fromEmail))
      .limit(1);

    if (crmContact) {
      await writeTimelineEvent({
        contactId: crmContact.id,
        eventType: "email_sent",
        title: "Email reply sent",
        metadata: {
          reply_id: replyId,
          subject,
          sender_email: sender.email,
        },
      });
    }

    // Re-fetch with joins for response
    const [fullReply] = await db
      .select({
        reply: outreachReplies,
        contact: {
          id: outreachContacts.id,
          firstName: outreachContacts.firstName,
          lastName: outreachContacts.lastName,
          email: outreachContacts.email,
          company: outreachContacts.company,
          email1Body: outreachContacts.email1Body,
          email1Subject: outreachContacts.email1Subject,
          email1SentAt: outreachContacts.email1SentAt,
          email2Body: outreachContacts.email2Body,
          email2Subject: outreachContacts.email2Subject,
          email2SentAt: outreachContacts.email2SentAt,
          email3Body: outreachContacts.email3Body,
          email3Subject: outreachContacts.email3Subject,
          email3SentAt: outreachContacts.email3SentAt,
        },
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

    const responseReply = fullReply
      ? { ...fullReply.reply, contact: fullReply.contact, campaign: fullReply.campaign }
      : updatedReply;

    return Response.json({ reply: responseReply }, { status: 200 });
  } catch (error) {
    logger.error("Unexpected error in POST /api/outreach/replies/[replyId]/send:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
