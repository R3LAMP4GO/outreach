import { NextRequest } from "next/server";
import { Resend } from "resend";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { selectSenderForUser } from "@/lib/outreach/sending/sender";
import { incrementSenderCount } from "@/lib/outreach/sending/queries";
import { writeTimelineEvent } from "@/lib/crm/timeline";

const bodySchema = z.object({
  subject: z.string().min(1, "Subject is required").max(200),
  body: z.string().min(1, "Body is required").max(10000),
});

/**
 * POST /api/crm/contacts/[id]/send-email
 *
 * Send a cold first-touch email from the logged-in admin's mailbox to a CRM
 * contact. Uses `selectSenderForUser(session.user.email, null)` so the from
 * address matches whoever is signed in (Isaac \u2192 isaac@, Josh \u2192 josh@). No
 * fallback to a campaign pool \u2014 if the admin has no sender_account row,
 * the send is rejected.
 *
 * LOCKED: Reply-To is set to the sender's plain mailbox (same rule as the
 * reply route + campaign sender path). See CLAUDE.md for the full rationale.
 *
 * Body: { subject, body }
 * Returns: { id: resend_email_id, sender: "isaac@..." }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: contactId } = await params;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
        { status: 400 },
      );
    }
    const { subject, body } = parsed.data;

    const [contact] = await db
      .select({
        id: contacts.id,
        email: contacts.email,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);

    if (!contact) {
      return Response.json({ error: "Contact not found" }, { status: 404 });
    }
    if (!contact.email) {
      return Response.json({ error: "Contact has no email address" }, { status: 400 });
    }

    // Per-user routing only \u2014 no campaign pool fallback for cold first-touch.
    // If the logged-in admin has no sender_account row, surface a clear error
    // instead of silently sending from someone else's mailbox.
    const sender = await selectSenderForUser(session.user.email, null);
    if (!sender) {
      return Response.json(
        {
          error: `No sender mailbox found for ${session.user.email}. Seed one with 'bun scripts/seed-sender-accounts.ts' or contact an admin.`,
        },
        { status: 422 },
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      logger.error("RESEND_API_KEY not set");
      return Response.json({ error: "Email service not configured" }, { status: 500 });
    }

    // Convert plain-text body to minimal HTML (paragraph per blank-line block).
    // Keeps user-typed line breaks intact while still rendering acceptably in
    // every major email client. No template wrapping \u2014 cold first-touch should
    // look like a personal email, not a campaign blast.
    const htmlBody = body
      .split(/\n\n+/)
      .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br/>")}</p>`)
      .join("\n");

    const resend = new Resend(apiKey);
    const sendResult = await resend.emails.send({
      from: `${sender.name} <${sender.email}>`,
      to: contact.email,
      subject,
      text: body,
      html: htmlBody,
      // LOCKED: Reply-To MUST be the sender's plain mailbox. See CLAUDE.md
      // "Outreach Reply-To (LOCKED)" and the matching rules in
      // lib/outreach/sending/sender.ts + the reply send route.
      replyTo: sender.email,
      // Tags for future analytics. Deliberately NOT including `contact_id` \u2014
      // that tag is consumed by lib/outreach/webhooks/events/* which expects
      // an outreach_contacts row, not a crm contacts row. Use crm_contact_id
      // to disambiguate when we later wire CRM-side webhook handling.
      tags: [
        { name: "crm_contact_id", value: contact.id },
        { name: "send_source", value: "cold_first_touch" },
        { name: "sender_account_id", value: sender.id },
      ],
    });

    if (sendResult.error) {
      logger.error("Resend send failed for cold first-touch:", sendResult.error);
      return Response.json(
        { error: `Email send failed: ${sendResult.error.message}` },
        { status: 502 },
      );
    }

    const emailId = sendResult.data?.id ?? null;

    // Increment sender's daily count (fire-and-forget \u2014 best-effort).
    await incrementSenderCount(sender.id);

    // Write timeline event so the send shows up in the contact's history.
    await writeTimelineEvent({
      contactId: contact.id,
      eventType: "email_sent",
      title: `Email sent: ${subject}`,
      description: body.slice(0, 200) + (body.length > 200 ? "\u2026" : ""),
      metadata: {
        resend_email_id: emailId,
        sender_email: sender.email,
        sender_account_id: sender.id,
        send_source: "cold_first_touch",
      },
    });

    logger.info(
      `Cold first-touch email sent to ${contact.email} from ${sender.email} (resend_id=${emailId})`,
    );

    return Response.json({
      success: true,
      id: emailId,
      sender: sender.email,
    });
  } catch (err) {
    logger.error("Cold first-touch send error:", err);
    return Response.json({ error: `Unexpected error: ${(err as Error).message}` }, { status: 500 });
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
