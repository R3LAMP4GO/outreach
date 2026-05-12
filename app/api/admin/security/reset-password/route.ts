import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { adminUsers, adminAuditLog, passwordResetTokens } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { randomBytes, createHash } from "crypto";
import {
  requestPasswordResetSchema,
  resetPasswordSchema,
  parseBody,
  sanitizeError,
} from "@/lib/validations";
import { checkRateLimit, getClientIp, rateLimiters } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { Resend } from "resend";

// POST - Request password reset
export async function POST(request: NextRequest) {
  // Rate limit: 5 requests per hour per IP
  const clientIp = getClientIp(request);
  const rateLimitResult = await checkRateLimit(
    `password-reset:${clientIp}`,
    rateLimiters.passwordReset,
    "passwordReset",
  );

  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Too many password reset requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(rateLimitResult.resetIn / 1000).toString(),
        },
      },
    );
  }

  const parsed = await parseBody(request, requestPasswordResetSchema);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { email } = parsed.data;

  try {
    // Check if user exists (email already normalized by schema)
    const [user] = await db
      .select({ id: adminUsers.id, email: adminUsers.email })
      .from(adminUsers)
      .where(eq(adminUsers.email, email))
      .limit(1);

    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({
        success: true,
        message: "If an account exists with this email, a reset link will be sent.",
      });
    }

    // Generate token and hash it for storage
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate existing tokens
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date().toISOString() })
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

    // Create new token
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: expiresAt.toISOString(),
    });

    // Log the action
    await db.insert(adminAuditLog).values({
      userId: user.id,
      action: "request_password_reset",
      resourceType: "user",
      resourceId: user.id,
    });

    // Generate reset URL
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const resetUrl = `${baseUrl}/admin/reset-password/${token}`;

    // Send password reset email
    try {
      // Get Resend client from environment
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        logger.error("RESEND_API_KEY not configured");
        // Don't fail the request - return success to prevent email enumeration
        return NextResponse.json({
          success: true,
          message: "If an account exists with this email, a reset link will be sent.",
        });
      }

      const resend = new Resend(apiKey);
      const fromEmail = process.env.DEFAULT_FROM_EMAIL || "hello@email.__YOUR_DOMAIN__";

      await resend.emails.send({
        from: fromEmail,
        to: user.email,
        subject: "Reset Your Password",
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: #f9fafb; border-radius: 12px; padding: 32px 24px; border: 1px solid #e5e7eb;">
                <h2 style="color: #1a1a1a; font-size: 24px; font-weight: 600; margin: 0 0 16px 0;">
                  Reset Your Password
                </h2>

                <p style="color: #666; font-size: 15px; margin: 0 0 24px 0;">
                  You requested to reset your password. Click the button below to reset it:
                </p>

                <div style="text-align: center; margin: 32px 0;">
                  <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; background-color: #3B82F6; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    Reset Password
                  </a>
                </div>

                <p style="color: #666; font-size: 14px; margin: 24px 0 8px 0;">
                  Or copy and paste this link into your browser:
                </p>

                <p style="word-break: break-all; color: #3B82F6; font-size: 13px; background: #ffffff; padding: 12px; border-radius: 6px; border: 1px solid #e5e7eb; margin: 0 0 24px 0;">
                  ${resetUrl}
                </p>

                <p style="color: #9CA3AF; font-size: 13px; margin: 0 0 24px 0;">
                  <strong>This link expires in 1 hour.</strong>
                </p>

                <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;">

                <p style="color: #9CA3AF; font-size: 12px; margin: 0;">
                  If you didn't request this, please ignore this email.
                </p>
              </div>

              <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin-top: 20px;">
                __YOUR_BRAND__ Admin Dashboard
              </p>
            </body>
          </html>
        `,
      });

      logger.info("Password reset email sent to:", user.email);
    } catch (emailError) {
      // Don't fail the request if email sending fails (security: prevents email enumeration)
      logger.error("Failed to send password reset email:", emailError);
    }

    return NextResponse.json({
      success: true,
      message: "If an account exists with this email, a reset link will be sent.",
      // Include URL in dev for testing
      ...(process.env.NODE_ENV === "development" && { resetUrl }),
    });
  } catch (error) {
    // Still return success to prevent email enumeration
    logger.error("Password reset request error:", error);
    return NextResponse.json({
      success: true,
      message: "If an account exists with this email, a reset link will be sent.",
    });
  }
}

// PUT - Reset password with token
export async function PUT(request: NextRequest) {
  const parsed = await parseBody(request, resetPasswordSchema);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { token, password } = parsed.data;

  // Validate password strength
  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    return NextResponse.json({ error: passwordValidation.errors.join(", ") }, { status: 400 });
  }

  // Hash the token to look it up
  const tokenHash = createHash("sha256").update(token).digest("hex");

  try {
    // Find token
    const [resetToken] = await db
      .select({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
        expiresAt: passwordResetTokens.expiresAt,
      })
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt)))
      .limit(1);

    if (!resetToken) {
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 });
    }

    // Check expiration
    if (new Date(resetToken.expiresAt) < new Date()) {
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date().toISOString() })
        .where(eq(passwordResetTokens.id, resetToken.id));

      return NextResponse.json({ error: "Reset token has expired" }, { status: 400 });
    }

    // Hash new password
    const passwordHash = await hashPassword(password);

    // Update password
    await db
      .update(adminUsers)
      .set({
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(adminUsers.id, resetToken.userId));

    // Mark token as used
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date().toISOString() })
      .where(eq(passwordResetTokens.id, resetToken.id));

    // Log the action
    await db.insert(adminAuditLog).values({
      userId: resetToken.userId,
      action: "reset_password",
      resourceType: "user",
      resourceId: resetToken.userId,
    });

    return NextResponse.json({
      success: true,
      message: "Password reset successfully. You can now log in.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeError({ message: error instanceof Error ? error.message : String(error) }) },
      { status: 500 },
    );
  }
}
