import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { adminInvitations, adminUsers, adminAuditLog } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { acceptInvitationSchema, parseBody, sanitizeError } from "@/lib/validations";
import { createHash } from "crypto";
import { checkRateLimit, getClientIp, rateLimiters } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // Rate limit: 5 requests per hour per IP (public endpoint protection)
  const clientIp = getClientIp(request);
  const rateLimitResult = await checkRateLimit(
    `invitation-accept:${clientIp}`,
    rateLimiters.invitationAccept,
    "api",
  );

  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Too many invitation acceptance requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(rateLimitResult.resetIn / 1000).toString(),
        },
      },
    );
  }

  const parsed = await parseBody(request, acceptInvitationSchema);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { token, name, password } = parsed.data;

  // Validate password strength
  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    return NextResponse.json({ error: passwordValidation.errors.join(", ") }, { status: 400 });
  }

  // Hash the token to look it up
  const tokenHash = createHash("sha256").update(token).digest("hex");

  try {
    // Find invitation
    const [invitation] = await db
      .select()
      .from(adminInvitations)
      .where(and(eq(adminInvitations.tokenHash, tokenHash), eq(adminInvitations.status, "pending")))
      .limit(1);

    if (!invitation) {
      return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 400 });
    }

    // Check expiration
    if (new Date(invitation.expiresAt) < new Date()) {
      await db
        .update(adminInvitations)
        .set({ status: "expired" })
        .where(eq(adminInvitations.id, invitation.id));

      return NextResponse.json({ error: "Invitation has expired" }, { status: 400 });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const [user] = await db
      .insert(adminUsers)
      .values({
        email: invitation.email,
        name,
        passwordHash,
        role: invitation.role,
        isActive: true,
      })
      .returning();

    if (!user) {
      return NextResponse.json(
        { error: sanitizeError({ message: "Failed to create user" }) },
        { status: 500 },
      );
    }

    // Update invitation status
    await db
      .update(adminInvitations)
      .set({
        status: "accepted",
        acceptedAt: new Date().toISOString(),
      })
      .where(eq(adminInvitations.id, invitation.id));

    // Log the action
    await db.insert(adminAuditLog).values({
      userId: user.id,
      action: "accept_invitation",
      resourceType: "user",
      resourceId: user.id,
      details: { invitation_id: invitation.id },
    });

    return NextResponse.json({
      success: true,
      message: "Account created successfully. You can now log in.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeError({ message: error instanceof Error ? error.message : String(error) }) },
      { status: 500 },
    );
  }
}

// GET - Validate invitation token
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  // Hash the token to look it up
  const tokenHash = createHash("sha256").update(token).digest("hex");

  try {
    const [invitation] = await db
      .select({
        email: adminInvitations.email,
        role: adminInvitations.role,
        expiresAt: adminInvitations.expiresAt,
        status: adminInvitations.status,
      })
      .from(adminInvitations)
      .where(eq(adminInvitations.tokenHash, tokenHash))
      .limit(1);

    if (!invitation) {
      return NextResponse.json({ error: "Invalid invitation" }, { status: 400 });
    }

    if (invitation.status !== "pending") {
      return NextResponse.json({ error: `Invitation is ${invitation.status}` }, { status: 400 });
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      return NextResponse.json({ error: "Invitation has expired" }, { status: 400 });
    }

    return NextResponse.json({
      email: invitation.email,
      role: invitation.role,
    });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeError({ message: error instanceof Error ? error.message : String(error) }) },
      { status: 500 },
    );
  }
}
