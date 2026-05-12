import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminUsers, adminAuditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSecret, generateURI, verifySync } from "otplib";
import { enableTotpSchema, disableTotpSchema, parseBody, sanitizeError } from "@/lib/validations";
import { checkRateLimit, rateLimiters } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { encryptCredential, decryptCredential } from "@/lib/encryption";

// GET - Generate TOTP secret
export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: reuse totpSetup limiter
  const rateLimitResult = await checkRateLimit(
    `totp-setup:${session.user.id}`,
    rateLimiters.totpSetup,
    "api",
  );

  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(rateLimitResult.resetIn / 1000).toString(),
        },
      },
    );
  }

  // Generate secret
  const secret = generateSecret();
  const otpauth = generateURI({
    label: session.user.email,
    issuer: "__YOUR_BRAND__ Admin",
    secret,
  });

  // Return otpauth URI only (the secret is embedded in the URI for QR scanning).
  // The client extracts the secret from the URI for manual entry display.
  // Security relies on this being a one-time setup flow, not on hiding the secret.
  return NextResponse.json({
    otpauth,
  });
}

// POST - Enable TOTP
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 requests per hour per user
  const rateLimitResult = await checkRateLimit(
    `totp-setup:${session.user.id}`,
    rateLimiters.totpSetup,
    "api",
  );

  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Too many 2FA setup requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(rateLimitResult.resetIn / 1000).toString(),
        },
      },
    );
  }

  const parsed = await parseBody(request, enableTotpSchema);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { secret, token } = parsed.data;

  // Verify token
  const isValid = verifySync({ token, secret }).valid;
  if (!isValid) {
    return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
  }

  try {
    // Encrypt the TOTP secret before storing
    const encrypted = encryptCredential(secret);
    const encryptedSecret = JSON.stringify({
      ev: encrypted.encryptedValue,
      iv: encrypted.iv,
      tag: encrypted.tag,
    });

    // Save encrypted secret and enable TOTP
    await db
      .update(adminUsers)
      .set({
        totpSecret: encryptedSecret,
        totpEnabled: true,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(adminUsers.id, session.user.id));

    // Log the action
    try {
      await db.insert(adminAuditLog).values({
        userId: session.user.id,
        action: "enable_totp",
        resourceType: "user",
        resourceId: session.user.id,
      });
    } catch (auditErr) {
      logger.error("Failed to write audit log for enable_totp", {
        userId: session.user.id,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    return NextResponse.json({ success: true, message: "2FA enabled successfully" });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeError({ message: error instanceof Error ? error.message : String(error) }) },
      { status: 500 },
    );
  }
}

// DELETE - Disable TOTP
export async function DELETE(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: reuse totpSetup limiter
  const rateLimitResult = await checkRateLimit(
    `totp-setup:${session.user.id}`,
    rateLimiters.totpSetup,
    "api",
  );

  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(rateLimitResult.resetIn / 1000).toString(),
        },
      },
    );
  }

  const parsed = await parseBody(request, disableTotpSchema);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { token } = parsed.data;

  try {
    // Get user's TOTP secret
    const [user] = await db
      .select({ totpSecret: adminUsers.totpSecret })
      .from(adminUsers)
      .where(eq(adminUsers.id, session.user.id))
      .limit(1);

    if (!user?.totpSecret) {
      return NextResponse.json({ error: "2FA is not enabled" }, { status: 400 });
    }

    // Decrypt the TOTP secret
    let totpSecret: string;
    try {
      const parsedSecret = JSON.parse(user.totpSecret);
      totpSecret = decryptCredential(parsedSecret.ev, parsedSecret.iv, parsedSecret.tag);
    } catch (totpErr) {
      if (totpErr instanceof SyntaxError) {
        // Legacy plaintext secret (not JSON) — use directly
        totpSecret = user.totpSecret;
      } else {
        // Decryption failed on a valid JSON envelope — corrupted or tampered data
        logger.error("TOTP secret decryption failed for user", { userId: session.user.id });
        return NextResponse.json(
          { error: "2FA configuration is corrupted. Contact administrator." },
          { status: 500 },
        );
      }
    }

    // Verify token
    const isValid = verifySync({ token, secret: totpSecret }).valid;
    if (!isValid) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
    }

    // Disable TOTP
    await db
      .update(adminUsers)
      .set({
        totpSecret: null,
        totpEnabled: false,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(adminUsers.id, session.user.id));

    // Log the action
    try {
      await db.insert(adminAuditLog).values({
        userId: session.user.id,
        action: "disable_totp",
        resourceType: "user",
        resourceId: session.user.id,
      });
    } catch (auditErr) {
      logger.error("Failed to write audit log for disable_totp", {
        userId: session.user.id,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    return NextResponse.json({ success: true, message: "2FA disabled successfully" });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeError({ message: error instanceof Error ? error.message : String(error) }) },
      { status: 500 },
    );
  }
}
