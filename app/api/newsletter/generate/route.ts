import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { newsletterCampaigns, adminAuditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validations";
import { generateNewsletterSchema } from "@/lib/validations/newsletter";
import { createNewsletterOrchestrator } from "@/lib/newsletter/orchestrator";
import { logger } from "@/lib/logger";
import {
  RATE_LIMIT_NEWSLETTER_GENERATE_COUNT,
  RATE_LIMIT_NEWSLETTER_GENERATE_WINDOW_MS,
} from "@/lib/constants";

/**
 * POST /api/newsletter/generate
 *
 * Generate a newsletter edition with AI-curated content.
 * Orchestrates the full workflow:
 * 1. Fetch articles from RSS feeds
 * 2. Deduplicate and score articles
 * 3. Summarize top articles with Claude AI
 * 4. Generate newsletter template
 * 5. Store in database
 *
 * @auth Required - Admin users only
 * @body { campaignId?: string, manual?: boolean }
 * @returns { newsletterId, preview, error }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Authentication
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    // Verify admin role
    if (session.user.role !== "admin" && session.user.role !== "super_admin") {
      logger.warn(`Unauthorized newsletter generation attempt by user ${session.user.id}`);
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    // 2. Rate limiting
    getClientIp(request); // Validate client IP is available
    const rateLimitResult = await checkRateLimit(
      `newsletter-generate:${session.user.id}`,
      {
        limit: RATE_LIMIT_NEWSLETTER_GENERATE_COUNT,
        windowMs: RATE_LIMIT_NEWSLETTER_GENERATE_WINDOW_MS,
      },
      "api",
    );

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Rate limit exceeded. Please try again later.",
          resetIn: rateLimitResult.resetIn,
        },
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

    // 3. Validate request body
    const parsed = await parseBody(request, generateNewsletterSchema);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    const { campaignId, manual } = parsed.data;

    // 4. Retrieve API key from environment
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      logger.error("ANTHROPIC_API_KEY not configured");
      return NextResponse.json(
        {
          success: false,
          error: "AI service not configured. Please set ANTHROPIC_API_KEY environment variable.",
        },
        { status: 500 },
      );
    }

    // 5. Fetch campaign configuration (if campaignId provided)
    let campaignConfig = null;

    if (campaignId) {
      const [campaign] = await db
        .select()
        .from(newsletterCampaigns)
        .where(eq(newsletterCampaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 });
      }

      if (campaign.status !== "active" && !manual) {
        return NextResponse.json(
          { success: false, error: "Campaign is not active" },
          { status: 400 },
        );
      }

      campaignConfig = campaign;
    }

    // 6. Create orchestrator and generate newsletter
    logger.debug("Starting newsletter generation...", {
      userId: session.user.id,
      campaignId: campaignId || "manual",
      manual,
    });

    const orchestrator = createNewsletterOrchestrator({
      anthropicApiKey,
    });

    const result = await orchestrator.generateNewsletter({
      campaignId: campaignId || undefined,
      manual: manual || false,
      userId: session.user.id,
      campaignConfig: (campaignConfig || undefined) as unknown as
        | import("@/lib/newsletter/orchestrator").CampaignConfig
        | undefined,
    });

    const duration = Date.now() - startTime;

    logger.debug("Newsletter generation completed", {
      newsletterId: result.newsletterId,
      articleCount: result.articleCount,
      duration,
    });

    // 7. Log the generation event
    try {
      await db.insert(adminAuditLog).values({
        userId: session.user.id,
        action: "newsletter_generated",
        resourceType: "newsletter_edition",
        resourceId: result.newsletterId,
        details: {
          campaignId: campaignId || null,
          manual,
          articleCount: result.articleCount,
          duration,
        },
      });
    } catch (auditErr) {
      logger.warn("Failed to write audit log", {
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
        action: "newsletter_generated",
      });
    }

    // 8. Return success response
    return NextResponse.json(
      {
        success: true,
        newsletterId: result.newsletterId,
        preview: {
          subject: result.subject,
          html: result.html,
          articleCount: result.articleCount,
        },
        metadata: {
          duration,
          generatedAt: new Date().toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error("Newsletter generation error:", error);

    // Log the error
    const session = await auth();
    if (session?.user) {
      try {
        await db.insert(adminAuditLog).values({
          userId: session.user.id,
          action: "newsletter_generation_failed",
          resourceType: "newsletter_edition",
          details: {
            error: error instanceof Error ? error.message : "Unknown error",
            duration: Date.now() - startTime,
          },
        });
      } catch (auditErr) {
        logger.warn("Failed to write audit log", {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          action: "newsletter_generation_failed",
        });
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate newsletter: AI curation pipeline encountered an error",
        message: error instanceof Error ? error.message : "Unknown error in newsletter generation",
        details:
          process.env.NODE_ENV === "development" && error instanceof Error
            ? error.stack
            : "Enable development mode for stack trace",
        help: "Check that AI integrations are configured correctly in Settings → Integrations. Contact support if this persists.",
      },
      { status: 500 },
    );
  }
}
