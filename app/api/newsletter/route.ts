import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { newsletterEditions } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { logger } from "@/lib/logger";

/**
 * GET /api/newsletter
 * List all newsletter editions
 */
export async function GET() {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify admin role
    if (session.user.role !== "admin" && session.user.role !== "super_admin") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Fetch newsletters
    const data = await db
      .select()
      .from(newsletterEditions)
      .orderBy(desc(newsletterEditions.createdAt))
      .limit(50);

    // Transform data to match frontend interface
    const newsletters = data.map((edition) => {
      const stats = edition.stats as Record<string, number> | null;
      return {
        id: edition.id,
        subject: edition.subject || "Untitled",
        sentAt: edition.sentAt,
        status: edition.status || "draft",
        stats: {
          openRate: stats?.openRate ?? stats?.open_rate ?? 0,
          clickRate: stats?.clickRate ?? stats?.click_rate ?? 0,
          totalRecipients: stats?.totalRecipients ?? stats?.total_recipients ?? 0,
        },
      };
    });

    return NextResponse.json({
      success: true,
      newsletters,
    });
  } catch (error) {
    logger.error("Error in newsletter list endpoint:", error);
    return NextResponse.json(
      {
        error: "Unexpected error fetching newsletter list",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
