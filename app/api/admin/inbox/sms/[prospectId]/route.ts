/**
 * GET /api/admin/inbox/sms/[prospectId]
 *
 * Return the full SMS message list for one prospect's thread, plus a small
 * prospect summary used by the inbox detail sheet.
 *
 * Messages are ordered chronologically (ASC) so the UI can render them
 * top-to-bottom as a conversation.
 *
 * PATCH /api/admin/inbox/sms/[prospectId]
 *   body: { is_read: true }
 * Flips every `sms_received` row in the prospect's thread to is_read = true.
 *
 * Auth: NextAuth session required.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { contactTimeline, prospects } from "@/lib/db/schema";

type RouteParams = { prospectId: string };

const patchSchema = z.object({ is_read: z.literal(true) }).strip();

export async function GET(
  _request: NextRequest,
  context: { params: Promise<RouteParams> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prospectId } = await context.params;
  if (!prospectId) {
    return NextResponse.json({ error: "prospectId required" }, { status: 400 });
  }

  const [prospect] = await db
    .select({
      id: prospects.id,
      businessName: prospects.businessName,
      phone: prospects.phone,
    })
    .from(prospects)
    .where(eq(prospects.id, prospectId))
    .limit(1);

  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  const rows = await db
    .select({
      id: contactTimeline.id,
      eventType: contactTimeline.eventType,
      description: contactTimeline.description,
      createdAt: contactTimeline.createdAt,
      isRead: contactTimeline.isRead,
      metadata: contactTimeline.metadata,
    })
    .from(contactTimeline)
    .where(
      and(
        eq(contactTimeline.prospectId, prospectId),
        inArray(contactTimeline.eventType, ["sms_sent", "sms_received"]),
      ),
    )
    .orderBy(asc(contactTimeline.createdAt));

  const messages = rows.map((r) => ({
    id: r.id,
    direction: r.eventType === "sms_received" ? ("in" as const) : ("out" as const),
    body: r.description ?? "",
    created_at: r.createdAt,
    is_read: r.isRead,
  }));

  return NextResponse.json({
    thread: {
      prospect_id: prospect.id,
      prospect_name: prospect.businessName,
      phone: prospect.phone,
    },
    messages,
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<RouteParams> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prospectId } = await context.params;
  if (!prospectId) {
    return NextResponse.json({ error: "prospectId required" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "is_read=true required" }, { status: 400 });
  }

  await db
    .update(contactTimeline)
    .set({ isRead: true })
    .where(
      and(
        eq(contactTimeline.prospectId, prospectId),
        eq(contactTimeline.eventType, "sms_received"),
        eq(contactTimeline.isRead, false),
      ),
    );

  return NextResponse.json({ success: true });
}
