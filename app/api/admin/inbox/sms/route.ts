/**
 * GET /api/admin/inbox/sms
 *
 * List all SMS threads, one per prospect, ordered by most recent activity.
 *
 * A thread is the set of `sms_sent` and `sms_received` rows in
 * `contact_timeline` that belong to a single prospect. We aggregate per
 * `prospect_id` to compute:
 *   - lastMessageAt: most recent created_at across the two event types
 *   - lastMessagePreview: trimmed body of the most recent message
 *   - lastMessageDirection: "in" if last was sms_received, else "out"
 *   - unreadCount: inbound (sms_received) rows where is_read = false
 *   - messageCount: total inbound + outbound
 *
 * Auth: NextAuth session required.
 */
import { NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { contactTimeline, contacts, prospects } from "@/lib/db/schema";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Aggregate per prospect_id. We only consider rows that have a prospectId —
    // contact-only SMS rows (rare; only when a contact exists without a
    // prospect link) are excluded from this inbox view.
    const rows = await db
      .select({
        prospectId: contactTimeline.prospectId,
        lastMessageAt: sql<string>`MAX(${contactTimeline.createdAt})`.as("last_message_at"),
        messageCount: sql<number>`COUNT(*)::int`.as("message_count"),
        unreadCount: sql<number>`COUNT(*) FILTER (
          WHERE ${contactTimeline.eventType} = 'sms_received'
          AND ${contactTimeline.isRead} = false
        )::int`.as("unread_count"),
      })
      .from(contactTimeline)
      .where(
        and(
          inArray(contactTimeline.eventType, ["sms_sent", "sms_received"]),
          sql`${contactTimeline.prospectId} IS NOT NULL`,
        ),
      )
      .groupBy(contactTimeline.prospectId)
      .orderBy(desc(sql`MAX(${contactTimeline.createdAt})`))
      .limit(200);

    if (rows.length === 0) {
      return NextResponse.json({ threads: [] });
    }

    const prospectIds = rows.map((r) => r.prospectId).filter((id): id is string => Boolean(id));

    const [prospectRows, lastMessages, contactRows] = await Promise.all([
      db
        .select({
          id: prospects.id,
          businessName: prospects.businessName,
          phone: prospects.phone,
        })
        .from(prospects)
        .where(inArray(prospects.id, prospectIds)),
      // Pull the last message per prospect via DISTINCT ON. Cheaper than a
      // window-function self-join for the page sizes we care about (≤200).
      db.execute<{
        prospect_id: string;
        event_type: string;
        description: string | null;
        created_at: string;
      }>(sql`
        SELECT DISTINCT ON (prospect_id)
          prospect_id,
          event_type,
          description,
          created_at
        FROM contact_timeline
        WHERE prospect_id = ANY(${prospectIds}::uuid[])
          AND event_type IN ('sms_sent', 'sms_received')
        ORDER BY prospect_id, created_at DESC NULLS LAST
      `),
      db
        .select({
          id: contacts.id,
          prospectId: contacts.prospectId,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          isPrimaryContact: contacts.isPrimaryContact,
        })
        .from(contacts)
        .where(and(inArray(contacts.prospectId, prospectIds), eq(contacts.isPrimaryContact, true))),
    ]);

    const prospectMap = new Map(prospectRows.map((p) => [p.id, p]));
    const contactMap = new Map(
      contactRows
        .filter((c): c is typeof c & { prospectId: string } => Boolean(c.prospectId))
        .map((c) => [c.prospectId, c]),
    );
    const lastMap = new Map<string, (typeof lastMessages)[number]>();
    for (const row of lastMessages) lastMap.set(row.prospect_id, row);

    const threads = rows
      .filter((r): r is typeof r & { prospectId: string } => Boolean(r.prospectId))
      .map((r) => {
        const prospect = prospectMap.get(r.prospectId);
        const contact = contactMap.get(r.prospectId);
        const last = lastMap.get(r.prospectId);
        const contactName = contact
          ? [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || null
          : null;
        return {
          prospect_id: r.prospectId,
          prospect_name: prospect?.businessName ?? "Unknown",
          contact_name: contactName,
          phone: prospect?.phone ?? null,
          last_message_at: r.lastMessageAt,
          last_message_preview: last?.description?.replace(/\s+/g, " ").trim() ?? "",
          last_message_direction:
            last?.event_type === "sms_received" ? ("in" as const) : ("out" as const),
          unread_count: r.unreadCount,
          message_count: r.messageCount,
        };
      });

    return NextResponse.json({ threads });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to load SMS threads",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
