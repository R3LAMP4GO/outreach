import { NextRequest } from "next/server";
import { eq, asc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachSchedules } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { toSnakeCase, toSnakeCaseArray } from "@/lib/outreach/lib/drizzle-helpers";

/**
 * GET /api/outreach/campaigns/[campaignId]/schedules
 *
 * Get all schedules for a campaign.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin permissions
    if (!session.user.role || !["admin", "super_admin"].includes(session.user.role)) {
      return Response.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    const { campaignId } = await params;

    // Validate campaign ID
    if (!campaignId) {
      return Response.json({ error: "Campaign ID is required" }, { status: 400 });
    }

    // Fetch schedules for campaign
    const schedules = await db
      .select()
      .from(outreachSchedules)
      .where(eq(outreachSchedules.campaignId, campaignId))
      .orderBy(asc(outreachSchedules.createdAt));

    return Response.json(
      { schedules: toSnakeCaseArray(schedules as Record<string, unknown>[]) },
      { status: 200 },
    );
  } catch (error) {
    logger.error("Error in GET /schedules:", error);
    return Response.json(
      {
        error: "Failed to fetch schedules",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/outreach/campaigns/[campaignId]/schedules
 *
 * Create a new schedule for a campaign.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin permissions
    if (!session.user.role || !["admin", "super_admin"].includes(session.user.role)) {
      return Response.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    const { campaignId } = await params;

    // Validate campaign ID
    if (!campaignId) {
      return Response.json({ error: "Campaign ID is required" }, { status: 400 });
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    // Validate required fields
    if (!body.name) {
      return Response.json({ error: "Schedule name is required" }, { status: 400 });
    }

    // Validate time window
    if (body.send_window_start && body.send_window_end) {
      if (body.send_window_start >= body.send_window_end) {
        return Response.json({ error: "Start time must be before end time" }, { status: 400 });
      }
    }

    // Validate send_days
    if (body.send_days && (!Array.isArray(body.send_days) || body.send_days.length === 0)) {
      return Response.json({ error: "At least one day must be selected" }, { status: 400 });
    }

    // Check if this is the first schedule for the campaign
    const [{ count: existingCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(outreachSchedules)
      .where(eq(outreachSchedules.campaignId, campaignId));

    // Auto-activate the first schedule for a campaign
    const isFirst = (existingCount ?? 0) === 0;
    const shouldBeActive = body.is_active === true || isFirst;

    // Create schedule
    const [schedule] = await db
      .insert(outreachSchedules)
      .values({
        campaignId,
        name: body.name,
        sendWindowStart: body.send_window_start || "09:00",
        sendWindowEnd: body.send_window_end || "17:00",
        sendDays: body.send_days || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        timezone: body.timezone || "Australia/Perth",
        isActive: shouldBeActive,
      })
      .returning();

    return Response.json(
      { schedule: toSnakeCase(schedule as Record<string, unknown>) },
      { status: 201 },
    );
  } catch (error) {
    logger.error("Error in POST /schedules:", error);
    return Response.json(
      {
        error: "Failed to create schedule",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
