import { NextRequest, NextResponse } from "next/server";
import { eq, gte, lte, sql, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { contactTimeline, contacts } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";

/**
 * GET /api/crm/activity
 *
 * Global activity feed from contact_timeline.
 * Query params: limit, offset, contact_id, event_type, from, to
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!session.user.role || !["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10) || 20, 1), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);
    const contactId = searchParams.get("contact_id");
    const eventType = searchParams.get("event_type");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const conditions = [];

    if (contactId) {
      conditions.push(eq(contactTimeline.contactId, contactId));
    }
    if (eventType) {
      conditions.push(eq(contactTimeline.eventType, eventType));
    }
    if (from) {
      conditions.push(gte(contactTimeline.createdAt, from));
    }
    if (to) {
      conditions.push(lte(contactTimeline.createdAt, to));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [eventRows, countResult] = await Promise.all([
      db
        .select({
          id: contactTimeline.id,
          eventType: contactTimeline.eventType,
          title: contactTimeline.title,
          description: contactTimeline.description,
          metadata: contactTimeline.metadata,
          createdAt: contactTimeline.createdAt,
          contactId: contacts.id,
          contactFirstName: contacts.firstName,
          contactLastName: contacts.lastName,
          contactEmail: contacts.email,
          contactStatus: contacts.contactStatus,
        })
        .from(contactTimeline)
        .leftJoin(contacts, eq(contactTimeline.contactId, contacts.id))
        .where(whereClause)
        .orderBy(sql`${contactTimeline.createdAt} DESC`)
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(contactTimeline).where(whereClause),
    ]);

    const events = eventRows.map((row) => ({
      id: row.id,
      event_type: row.eventType,
      title: row.title,
      description: row.description,
      metadata: row.metadata,
      created_at: row.createdAt,
      contact: row.contactId
        ? {
            id: row.contactId,
            first_name: row.contactFirstName,
            last_name: row.contactLastName,
            email: row.contactEmail,
            contact_status: row.contactStatus,
          }
        : null,
    }));

    return NextResponse.json(
      {
        events,
        total: countResult[0]?.count ?? 0,
      },
      {
        headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
      },
    );
  } catch (error) {
    logger.error("Activity feed error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
