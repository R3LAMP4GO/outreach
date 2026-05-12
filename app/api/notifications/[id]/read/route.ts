import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [existing] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, session.user.id)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date().toISOString() })
      .where(eq(notifications.id, id));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to mark notification as read" }, { status: 500 });
  }
}
