import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminSessions, adminAuditLog } from "@/lib/db/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import { checkRateLimit, rateLimiters } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// GET - List active sessions
export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sessions = await db
      .select()
      .from(adminSessions)
      .where(
        and(
          eq(adminSessions.userId, session.user.id),
          gt(adminSessions.expiresAt, new Date().toISOString()),
        ),
      )
      .orderBy(desc(adminSessions.lastActivityAt));

    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to fetch active sessions from database",
        message: error instanceof Error ? error.message : String(error),
        details: "Could not load session list. Please try refreshing.",
      },
      { status: 500 },
    );
  }
}

// DELETE - Revoke a session
export async function DELETE(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 10 requests per 15 minutes per user
  const rateLimitResult = await checkRateLimit(
    `session-revoke:${session.user.id}`,
    rateLimiters.login,
    "login",
  );

  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Too many session revocation requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(rateLimitResult.resetIn / 1000).toString(),
        },
      },
    );
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("id");

  if (!sessionId) {
    return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
  }

  try {
    // Ensure user can only revoke their own sessions
    await db
      .delete(adminSessions)
      .where(and(eq(adminSessions.id, sessionId), eq(adminSessions.userId, session.user.id)));

    // Log the action
    try {
      await db.insert(adminAuditLog).values({
        userId: session.user.id,
        action: "revoke_session",
        resourceType: "session",
        resourceId: sessionId,
      });
    } catch (auditErr) {
      logger.warn("Failed to write audit log", {
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
        action: "revoke_session",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to revoke session",
        message: error instanceof Error ? error.message : String(error),
        details: "Could not revoke the session. Please try again.",
      },
      { status: 500 },
    );
  }
}
