import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminInvitations, adminUsers, adminAuditLog } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { createInvitationSchema, parseBody, sanitizeError } from "@/lib/validations";
import { checkRateLimit, rateLimiters } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { INVITATION_EXPIRY_MS } from "@/lib/constants";

// GET - List all invitations (admin only)
export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const invitations = await db
      .select()
      .from(adminInvitations)
      .orderBy(desc(adminInvitations.createdAt));

    return NextResponse.json({ invitations });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeError({ message: error instanceof Error ? error.message : String(error) }) },
      { status: 500 },
    );
  }
}

// POST - Create new invitation (super_admin only)
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super admins can create invitations" },
      { status: 403 },
    );
  }

  // Rate limit: 10 requests per hour per user
  const rateLimitResult = await checkRateLimit(
    `invitation-create:${session.user.id}`,
    rateLimiters.invitationCreate,
    "api",
  );

  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Too many invitation creation requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(rateLimitResult.resetIn / 1000).toString(),
        },
      },
    );
  }

  const parsed = await parseBody(request, createInvitationSchema);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { email, role } = parsed.data;

  try {
    // Check if user already exists
    const [existingUser] = await db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(eq(adminUsers.email, email))
      .limit(1);

    if (existingUser) {
      return NextResponse.json({ error: "User with this email already exists" }, { status: 400 });
    }

    // Check for existing pending invitation
    const [existingInvite] = await db
      .select({ id: adminInvitations.id })
      .from(adminInvitations)
      .where(and(eq(adminInvitations.email, email), eq(adminInvitations.status, "pending")))
      .limit(1);

    if (existingInvite) {
      return NextResponse.json(
        { error: "Pending invitation already exists for this email" },
        { status: 400 },
      );
    }

    // Generate secure token and hash it for storage
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);

    // Create invitation (only store hash, not plain token)
    const [invitation] = await db
      .insert(adminInvitations)
      .values({
        email,
        role,
        tokenHash,
        invitedBy: session.user.id,
        expiresAt: expiresAt.toISOString(),
      })
      .returning();

    if (!invitation) {
      return NextResponse.json(
        { error: sanitizeError({ message: "Failed to create invitation" }) },
        { status: 500 },
      );
    }

    // Log the action
    try {
      await db.insert(adminAuditLog).values({
        userId: session.user.id,
        action: "create_invitation",
        resourceType: "invitation",
        resourceId: invitation.id,
        details: { email, role },
      });
    } catch (auditErr) {
      logger.warn("Failed to write audit log", {
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
        action: "create_invitation",
      });
    }

    // Generate invite URL
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteUrl = `${baseUrl}/admin/invite/${token}`;

    return NextResponse.json({
      invitation,
      inviteUrl,
      message: `Invitation created. Share this link: ${inviteUrl}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeError({ message: error instanceof Error ? error.message : String(error) }) },
      { status: 500 },
    );
  }
}

// DELETE - Revoke invitation (super_admin only)
export async function DELETE(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super admins can revoke invitations" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Invitation ID is required" }, { status: 400 });
  }

  try {
    await db.update(adminInvitations).set({ status: "revoked" }).where(eq(adminInvitations.id, id));

    // Log the action
    try {
      await db.insert(adminAuditLog).values({
        userId: session.user.id,
        action: "revoke_invitation",
        resourceType: "invitation",
        resourceId: id,
      });
    } catch (auditErr) {
      logger.warn("Failed to write audit log", {
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
        action: "revoke_invitation",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeError({ message: error instanceof Error ? error.message : String(error) }) },
      { status: 500 },
    );
  }
}
