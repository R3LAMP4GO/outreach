import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Newsletter Health Check API
 * GET /api/newsletter/health
 *
 * Checks if newsletter email service is properly configured.
 * Admin-only endpoint for diagnostics.
 */
export async function GET() {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin role
    if (session.user.role !== "admin" && session.user.role !== "super_admin") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Check Resend API key
    const apiKey = process.env.RESEND_API_KEY;
    const resendConfigured = !!apiKey;

    const fromEmail = process.env.NEWSLETTER_FROM_EMAIL || "newsletter@email.__YOUR_DOMAIN__";

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

    const health = {
      status: resendConfigured ? "healthy" : "unhealthy",
      checks: {
        resend: {
          configured: resendConfigured,
          status: resendConfigured ? "ok" : "error",
          message: resendConfigured
            ? "RESEND_API_KEY is configured"
            : "RESEND_API_KEY environment variable not set.",
        },
        fromEmail: {
          configured: !!process.env.NEWSLETTER_FROM_EMAIL,
          value: fromEmail,
          status: process.env.NEWSLETTER_FROM_EMAIL ? "ok" : "warning",
        },
        siteUrl: {
          configured: !!siteUrl,
          value: siteUrl || "Not configured",
          status: siteUrl ? "ok" : "warning",
          message: !siteUrl ? "NEXT_PUBLIC_SITE_URL environment variable not set" : undefined,
        },
      },
      recommendations: [] as Array<{ severity: string; message: string; action: string }>,
    };

    // Add recommendations based on checks
    if (!resendConfigured) {
      health.recommendations.push({
        severity: "critical",
        message: "Configure Resend API key to enable email sending",
        action: "Add RESEND_API_KEY to your environment variables",
      });
    }

    if (!process.env.NEWSLETTER_FROM_EMAIL) {
      health.recommendations.push({
        severity: "warning",
        message:
          "Configure newsletter from-email address (optional, defaults to newsletter@email.__YOUR_DOMAIN__)",
        action: "Add NEWSLETTER_FROM_EMAIL to your environment variables",
      });
    }

    if (!siteUrl) {
      health.recommendations.push({
        severity: "warning",
        message: "Set NEXT_PUBLIC_SITE_URL environment variable",
        action:
          "Add NEXT_PUBLIC_SITE_URL to your environment variables (e.g., https://yourdomain.com)",
      });
    }

    logger.info("Newsletter health check performed", {
      status: health.status,
      userId: session.user.id,
    });

    return NextResponse.json(health);
  } catch (error) {
    logger.error("Newsletter health check error:", error);
    return NextResponse.json(
      {
        status: "error",
        error: "Failed to perform health check",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
