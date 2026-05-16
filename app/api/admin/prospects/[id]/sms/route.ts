/**
 * POST /api/admin/prospects/[id]/sms
 *
 * Send a one-off SMS to a prospect through the configured Quo number.
 *
 * Calls `sendSms()` from `lib/quo/client.ts` with
 *   from = process.env.QUO_PHONE_NUMBER
 *   to   = prospect.phone
 *
 * On success: writes a `sms_sent` timeline event scoped to the prospect AND
 * to the primary contact (when one exists) so the activity surfaces in both
 * the prospect cockpit and any future contact view.
 *
 * Auth: NextAuth session required.
 * CSRF: enforced by the global middleware via Origin / Referer check.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { writeTimelineEvent } from "@/lib/crm/timeline";
import { db } from "@/lib/db";
import { contacts, prospects } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { QuoApiError, sendSms } from "@/lib/quo/client";

type RouteParams = { id: string };

const SMS_MAX_LENGTH = 1600; // Quo's documented per-message segment ceiling.

const bodySchema = z
  .object({
    content: z.string().trim().min(1, "Message is required").max(SMS_MAX_LENGTH),
  })
  .strip();

export async function POST(
  request: NextRequest,
  context: { params: Promise<RouteParams> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const fromNumber = process.env.QUO_PHONE_NUMBER;
  if (!fromNumber) {
    logger.error("[prospects/sms] QUO_PHONE_NUMBER not configured");
    return NextResponse.json({ error: "Quo phone number is not configured" }, { status: 500 });
  }

  const [prospect] = await db
    .select({
      id: prospects.id,
      businessName: prospects.businessName,
      phone: prospects.phone,
    })
    .from(prospects)
    .where(eq(prospects.id, id))
    .limit(1);

  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  if (!prospect.phone) {
    return NextResponse.json({ error: "Prospect has no phone number on file" }, { status: 400 });
  }

  // Best-effort primary contact lookup so the timeline lands on both rows.
  const [primaryContact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.prospectId, id), eq(contacts.isPrimaryContact, true)))
    .limit(1);

  try {
    const message = await sendSms({
      from: fromNumber,
      to: prospect.phone,
      content: parsed.data.content,
    });

    const nowIso = new Date().toISOString();
    await db
      .update(prospects)
      .set({ lastTouchedAt: nowIso, updatedAt: nowIso })
      .where(eq(prospects.id, id));

    const eventTitle = `SMS sent to ${prospect.businessName}`;
    const eventDescription = parsed.data.content;
    const metadata = {
      quoMessageId: message.id,
      to: prospect.phone,
      from: fromNumber,
      sentBy: session.user.id,
    } as const;

    await writeTimelineEvent({
      prospectId: id,
      eventType: "sms_sent",
      title: eventTitle,
      description: eventDescription,
      metadata,
    });
    if (primaryContact?.id) {
      await writeTimelineEvent({
        contactId: primaryContact.id,
        eventType: "sms_sent",
        title: eventTitle,
        description: eventDescription,
        metadata,
      });
    }

    return NextResponse.json({ success: true, messageId: message.id });
  } catch (err) {
    if (err instanceof QuoApiError) {
      logger.error("[prospects/sms] Quo rejected message", {
        prospectId: id,
        status: err.status,
        message: err.message,
      });
      return NextResponse.json(
        { error: err.message },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 },
      );
    }
    logger.error("[prospects/sms] failed", {
      prospectId: id,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to send SMS" }, { status: 500 });
  }
}
