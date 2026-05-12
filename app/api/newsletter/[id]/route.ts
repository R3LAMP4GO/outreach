import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { newsletterEditions, newsletterCampaigns, adminAuditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

/**
 * GET /api/newsletter/:id
 *
 * Retrieve a newsletter edition by ID.
 *
 * @auth Required - Admin users only
 * @param id - Newsletter edition ID
 * @returns Newsletter edition with full content
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

    // 3. Fetch newsletter from database
    const [edition] = await db
      .select()
      .from(newsletterEditions)
      .where(eq(newsletterEditions.id, id))
      .limit(1);

    if (!edition) {
      return NextResponse.json({ success: false, error: "Newsletter not found" }, { status: 404 });
    }

    // Fetch associated campaign if exists
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

    // 4. Return newsletter data
    return NextResponse.json({
      success: true,
      newsletter: {
        id: edition.id,
        campaignId: edition.campaignId,
        campaign,
        subject: edition.subject,
        preheader: edition.preheader,
        contentHtml: edition.contentHtml,
        contentText: edition.contentText,
        articleCount: edition.articleCount,
        curatedArticles: edition.curatedArticles,
        status: edition.status,
        scheduledAt: edition.scheduledAt,
        sentAt: edition.sentAt,
        stats: edition.stats || {
          totalRecipients: 0,
          totalSent: 0,
          totalDelivered: 0,
          totalOpens: 0,
          totalClicks: 0,
          totalBounces: 0,
          openRate: 0,
          clickRate: 0,
          ctor: 0,
        },
        createdAt: edition.createdAt,
        updatedAt: edition.updatedAt,
      },
    });
  } catch (error) {
    logger.error("Newsletter fetch error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Unexpected error loading newsletter edition",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/newsletter/:id
 *
 * Update a newsletter edition (subject, content, status, etc.).
 *
 * @auth Required - Admin users only
 * @param id - Newsletter edition ID
 * @body Partial newsletter fields to update
 * @returns Updated newsletter edition
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const { subject, preheader, contentHtml, contentText, status, scheduledAt } = body;

    // 4. Build update object
    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (subject !== undefined) updates.subject = subject;
    if (preheader !== undefined) updates.preheader = preheader;
    if (contentHtml !== undefined) updates.contentHtml = contentHtml;
    if (contentText !== undefined) updates.contentText = contentText;
    if (status !== undefined) updates.status = status;
    if (scheduledAt !== undefined) updates.scheduledAt = scheduledAt;

    // 5. Update newsletter
    const [updated] = await db
      .update(newsletterEditions)
      .set(updates)
      .where(eq(newsletterEditions.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ success: false, error: "Newsletter not found" }, { status: 404 });
    }

    // 6. Log the update
    await db.insert(adminAuditLog).values({
      userId: session.user.id,
      action: "newsletter_updated",
      resourceType: "newsletter_edition",
      resourceId: id,
      details: { updates: Object.keys(updates) },
    });

    return NextResponse.json({
      success: true,
      newsletter: updated,
    });
  } catch (error) {
    logger.error("Newsletter update error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Unexpected error updating newsletter edition",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/newsletter/:id
 *
 * Delete a newsletter edition (only drafts can be deleted).
 *
 * @auth Required - Admin users only
 * @param id - Newsletter edition ID
 * @returns Success confirmation
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

    // 3. Fetch newsletter to check status
    const [edition] = await db
      .select({ status: newsletterEditions.status })
      .from(newsletterEditions)
      .where(eq(newsletterEditions.id, id))
      .limit(1);

    if (!edition) {
      return NextResponse.json({ success: false, error: "Newsletter not found" }, { status: 404 });
    }

    // 4. Only allow deletion of drafts
    if (edition.status !== "draft") {
      return NextResponse.json(
        {
          success: false,
          error: "Only draft newsletters can be deleted",
        },
        { status: 400 },
      );
    }

    // 5. Delete newsletter
    await db.delete(newsletterEditions).where(eq(newsletterEditions.id, id));

    // 6. Log the deletion
    await db.insert(adminAuditLog).values({
      userId: session.user.id,
      action: "newsletter_deleted",
      resourceType: "newsletter_edition",
      resourceId: id,
      details: { status: edition.status },
    });

    return NextResponse.json({
      success: true,
      message: "Newsletter deleted successfully",
    });
  } catch (error) {
    logger.error("Newsletter deletion error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Unexpected error deleting newsletter edition",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
