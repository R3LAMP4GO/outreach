import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachReplies } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";

/**
 * PATCH /api/outreach/threads/[contactId]
 *
 * Bulk update all reply rows for a contact (Gmail-style thread mutation).
 *
 * @body is_read - Mark all replies in the thread as read/unread
 * @body is_archived - Archive/unarchive the entire thread
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { contactId } = await params;

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    const updateFields: Record<string, unknown> = {};

    if (typeof body.is_read === "boolean") {
      updateFields.isRead = body.is_read;
    }

    if (typeof body.is_archived === "boolean") {
      updateFields.isArchived = body.is_archived;
    }

    if (Object.keys(updateFields).length === 0) {
      return Response.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const result = await db
      .update(outreachReplies)
      .set(updateFields)
      .where(eq(outreachReplies.contactId, contactId))
      .returning({ id: outreachReplies.id });

    return Response.json({ updated: result.length }, { status: 200 });
  } catch (error) {
    logger.error("Unexpected error in PATCH /api/outreach/threads/[contactId]:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
