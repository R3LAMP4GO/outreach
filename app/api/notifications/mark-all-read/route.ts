import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date().toISOString() })
      .where(and(eq(notifications.userId, session.user.id), eq(notifications.isRead, false)));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to mark all notifications as read" },
      { status: 500 },
    );
  }
}
