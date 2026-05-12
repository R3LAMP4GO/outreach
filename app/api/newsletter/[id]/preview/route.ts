import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { newsletterEditions, newsletterCampaigns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

/**
 * GET /api/newsletter/:id/preview
 *
 * Get a preview of the newsletter HTML and text content.
 * Useful for viewing the newsletter before sending.
 *
 * @auth Required - Admin users only
 * @param id - Newsletter edition ID
 * @query personalize - Whether to personalize with sample data (default: false)
 * @returns Newsletter preview with HTML and text content
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    // 2. Validate ID parameter
    const { id } = await params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, error: "Invalid newsletter ID" }, { status: 400 });
    }

    // 3. Check for personalization query param
    const { searchParams } = new URL(request.url);
    const personalize = searchParams.get("personalize") === "true";

    // 4. Fetch newsletter edition
    const [edition] = await db
      .select()
      .from(newsletterEditions)
      .where(eq(newsletterEditions.id, id))
      .limit(1);
    if (!edition) {
      return NextResponse.json({ success: false, error: "Newsletter not found" }, { status: 404 });
    }

    let campaign = null;
    if (edition.campaignId) {
      const [c] = await db
        .select({
          id: newsletterCampaigns.id,
          name: newsletterCampaigns.name,
          status: newsletterCampaigns.status,
        })
        .from(newsletterCampaigns)
        .where(eq(newsletterCampaigns.id, edition.campaignId))
        .limit(1);
      campaign = c || null;
    }

    // 5. Personalize content with sample data if requested
    let contentHtml = edition.contentHtml;
    let contentText = edition.contentText;

    if (personalize) {
      const sampleUnsubscribeUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/newsletter/unsubscribe`;

      contentHtml = contentHtml
        ?.replace(/{{first_name}}/g, "Sarah")
        .replace(/{{unsubscribe_url}}/g, sampleUnsubscribeUrl);

      contentText = contentText
        ?.replace(/{{first_name}}/g, "Sarah")
        .replace(/{{unsubscribe_url}}/g, sampleUnsubscribeUrl);
    }

    // 6. Return preview
    return NextResponse.json({
      success: true,
      preview: {
        id: edition.id,
        subject: edition.subject,
        preheader: edition.preheader,
        html: contentHtml,
        text: contentText,
        articleCount: edition.articleCount,
        status: edition.status,
        campaign,
        createdAt: edition.createdAt,
        personalized: personalize,
      },
    });
  } catch (error) {
    logger.error("Newsletter preview error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate preview",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/newsletter/:id/preview
 *
 * Get a preview with custom personalization data.
 *
 * @auth Required - Admin users only
 * @param id - Newsletter edition ID
 * @body { firstName?: string, email?: string }
 * @returns Newsletter preview with custom personalization
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    // 2. Validate ID parameter
    const { id } = await params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, error: "Invalid newsletter ID" }, { status: 400 });
    }

    // 3. Parse request body
    const body = await request.json();
    const { firstName = "there", email } = body;

    // 4. Fetch newsletter edition
    const [edition] = await db
      .select()
      .from(newsletterEditions)
      .where(eq(newsletterEditions.id, id))
      .limit(1);
    if (!edition) {
      return NextResponse.json({ success: false, error: "Newsletter not found" }, { status: 404 });
    }

    let campaign = null;
    if (edition.campaignId) {
      const [c] = await db
        .select({
          id: newsletterCampaigns.id,
          name: newsletterCampaigns.name,
          status: newsletterCampaigns.status,
        })
        .from(newsletterCampaigns)
        .where(eq(newsletterCampaigns.id, edition.campaignId))
        .limit(1);
      campaign = c || null;
    }

    // 5. Personalize content with provided data
    const unsubscribeUrl = email
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/newsletter/unsubscribe?email=${encodeURIComponent(email)}`
      : `${process.env.NEXT_PUBLIC_SITE_URL}/newsletter/unsubscribe`;

    const contentHtml = edition.contentHtml
      ?.replace(/{{first_name}}/g, firstName)
      .replace(/{{unsubscribe_url}}/g, unsubscribeUrl);

    const contentText = edition.contentText
      ?.replace(/{{first_name}}/g, firstName)
      .replace(/{{unsubscribe_url}}/g, unsubscribeUrl);

    // 6. Return personalized preview
    return NextResponse.json({
      success: true,
      preview: {
        id: edition.id,
        subject: edition.subject,
        preheader: edition.preheader,
        html: contentHtml,
        text: contentText,
        articleCount: edition.articleCount,
        status: edition.status,
        campaign,
        createdAt: edition.createdAt,
        personalization: {
          firstName,
          email,
        },
      },
    });
  } catch (error) {
    logger.error("Newsletter preview error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate preview",
      },
      { status: 500 },
    );
  }
}
