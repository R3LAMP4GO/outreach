import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { Resend } from "resend";

const sendTestSchema = z.object({
  email: z.string().email(),
});

// HTML-escape a string for safe interpolation into HTML text/attribute contexts
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request: NextRequest) {
  try {
    // AuthN: require a valid admin session. The admin area is the only place a
    // session is issued, so any authenticated user is an admin — but we also
    // verify the role explicitly as defense in depth.
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!session.user.role || !["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Defense in depth: rate limit by IP even though auth is required, to
    // prevent a compromised admin account from being used as an email relay.
    const clientIp = getClientIp(request);
    const rateLimitResult = await checkRateLimit(
      `newsletter-send-test:${clientIp}`,
      { limit: 5, windowMs: 60 * 60 * 1000 }, // 5 per hour
      "api",
    );

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many test emails. Please try again later." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": Math.ceil(
              (Date.now() + rateLimitResult.resetIn) / 1000,
            ).toString(),
          },
        },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = sendTestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
    }
    const { email } = parsed.data;

    // Get Resend client from environment
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      logger.error("RESEND_API_KEY not configured");
      return NextResponse.json(
        { error: "Email service not configured. Please set RESEND_API_KEY environment variable." },
        { status: 500 },
      );
    }

    const resend = new Resend(apiKey);
    const fromEmail = process.env.NEWSLETTER_FROM_EMAIL || "newsletter@email.__YOUR_DOMAIN__";

    // Build the unsubscribe URL safely:
    // - encodeURIComponent() for the query-string value
    // - escapeHtml() around the final href attribute to neutralise any
    //   characters that could break out of the attribute context
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
    const unsubscribeUrl = `${siteUrl}/newsletter/unsubscribe?email=${encodeURIComponent(email)}`;
    const unsubscribeHref = escapeHtml(unsubscribeUrl);

    const { error: sendError } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: "Test Newsletter - __YOUR_BRAND__",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(to bottom, #f9fafb, #ffffff); border: 3px solid #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06);">
              <h1 style="color: #1a1a1a; font-size: 24px; font-weight: 300; margin: 0 0 16px 0;">This is a Test Newsletter</h1>

              <p style="color: #666; font-size: 16px; margin: 0 0 24px 0;">
                This is a sample newsletter email to test the footer design and unsubscribe functionality.
              </p>

              <div style="background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 24px 0; border-radius: 4px;">
                <h2 style="color: #1a1a1a; font-size: 18px; font-weight: 500; margin: 0 0 8px 0;">Quick Tip: AI Automation</h2>
                <p style="color: #666; font-size: 14px; margin: 0;">
                  Did you know? Automating just 3 repetitive tasks can save your team 10+ hours per week. Start small and scale up!
                </p>
              </div>

              <p style="color: #666; font-size: 16px; margin: 24px 0 0 0;">
                Want to learn more about automating your business workflows?
              </p>

              <div style="text-align: center; margin: 24px 0;">
                <a href="__YOUR_CAL_LINK__" style="display: inline-block; background-color: #3B82F6; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 12px; font-weight: 500; font-size: 16px;">
                  Book a Free Consultation
                </a>
              </div>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">

              <div style="text-align: center;">
                <!-- Social Icons Row - Styled to match website -->
                <div style="margin: 0 0 16px 0;">
                  <a href="https://www.linkedin.com/company/coastal-programs" style="display: inline-block; width: 40px; height: 40px; margin: 0 4px; background: #F3F4F6; border: 2px solid #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-decoration: none; vertical-align: middle;">
                    <img src="https://cdn-icons-png.flaticon.com/512/174/174857.png" alt="LinkedIn" style="width: 20px; height: 20px; margin: 10px; vertical-align: top;">
                  </a>
                  <a href="https://x.com/CoastalPrograms" style="display: inline-block; width: 40px; height: 40px; margin: 0 4px; background: #F3F4F6; border: 2px solid #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-decoration: none; vertical-align: middle;">
                    <img src="https://cdn-icons-png.flaticon.com/512/5969/5969020.png" alt="X" style="width: 20px; height: 20px; margin: 10px; vertical-align: top;">
                  </a>
                  <a href="https://github.com/Coastal-Programs" style="display: inline-block; width: 40px; height: 40px; margin: 0 4px; background: #F3F4F6; border: 2px solid #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-decoration: none; vertical-align: middle;">
                    <img src="https://cdn-icons-png.flaticon.com/512/25/25231.png" alt="GitHub" style="width: 20px; height: 20px; margin: 10px; vertical-align: top;">
                  </a>
                  <a href="https://__YOUR_DOMAIN__" style="display: inline-block; width: 40px; height: 40px; margin: 0 4px; background: #F3F4F6; border: 2px solid #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-decoration: none; vertical-align: middle;">
                    <img src="https://cdn-icons-png.flaticon.com/512/1006/1006771.png" alt="Website" style="width: 20px; height: 20px; margin: 10px; vertical-align: top;">
                  </a>
                </div>

                <!-- Company Name -->
                <p style="color: #374151; font-size: 14px; margin: 0 0 12px 0; font-weight: 300;">
                  __YOUR_BRAND__
                </p>

                <!-- Copyright & Business Info - Matching website font-light -->
                <p style="color: #6B7280; font-size: 11px; margin: 0 0 8px 0; font-weight: 300; line-height: 1.6;">
                  © 2025 __YOUR_BRAND__ • Jake Rino Schepis trading as __YOUR_BRAND__
                </p>
                <p style="color: #6B7280; font-size: 11px; margin: 0 0 16px 0; font-weight: 300; line-height: 1.6;">
                  ABN 12 340 373 046 • Australian Business • All rights reserved
                </p>

                <!-- Action Links -->
                <p style="color: #6B7280; font-size: 12px; margin: 0 0 16px 0; font-weight: 300;">
                  <a href="https://__YOUR_DOMAIN__/contact" style="color: #3B82F6; text-decoration: none;">Contact Us</a> |
                  <a href="__YOUR_CAL_LINK__" style="color: #3B82F6; text-decoration: none;">Book a Call</a> |
                  <a href="https://__YOUR_DOMAIN__" style="color: #3B82F6; text-decoration: none;">Our Services</a>
                </p>

                <!-- Unsubscribe -->
                <p style="color: #6B7280; font-size: 10px; margin: 0; font-weight: 300;">
                  No longer want to receive these emails? <a href="${unsubscribeHref}" style="color: #3B82F6; text-decoration: none;">Unsubscribe</a>
                </p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (sendError) {
      logger.error("Resend API error:", sendError);
      return NextResponse.json(
        { error: "Failed to send test email", details: sendError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      message: "Test newsletter sent successfully!",
    });
  } catch (error) {
    logger.error("Error sending test newsletter:", error);
    return NextResponse.json(
      {
        error: "Failed to send test newsletter email",
        message: error instanceof Error ? error.message : "Unknown error",
        details:
          "Email service encountered an error. Check that Resend is configured correctly in Settings → Integrations.",
      },
      { status: 500 },
    );
  }
}
