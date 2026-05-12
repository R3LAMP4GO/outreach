import { NextRequest } from "next/server";
import { eq, and, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachSchedules } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { toSnakeCase } from "@/lib/outreach/lib/drizzle-helpers";

/**
 * GET /api/outreach/campaigns/[campaignId]/schedules/[scheduleId]
 *
 * Get a single schedule by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string; scheduleId: string }> },
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

    const { campaignId, scheduleId } = await params;

    // Validate IDs
    if (!campaignId || !scheduleId) {
      return Response.json({ error: "Campaign ID and Schedule ID are required" }, { status: 400 });
    }

    // Fetch schedule
    const [schedule] = await db
      .select()
      .from(outreachSchedules)
      .where(
        and(eq(outreachSchedules.id, scheduleId), eq(outreachSchedules.campaignId, campaignId)),
      )
      .limit(1);

    if (!schedule) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }

    return Response.json(
      { schedule: toSnakeCase(schedule as Record<string, unknown>) },
      { status: 200 },
    );
  } catch (error) {
    logger.error("Error in GET /schedules/[scheduleId]:", error);
    return Response.json(
      {
        error: "Failed to fetch schedule",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/outreach/campaigns/[campaignId]/schedules/[scheduleId]
 *
 * Update a schedule.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string; scheduleId: string }> },
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

    const { campaignId, scheduleId } = await params;

    // Validate IDs
    if (!campaignId || !scheduleId) {
      return Response.json({ error: "Campaign ID and Schedule ID are required" }, { status: 400 });
    }

    // Parse request body and whitelist allowed fields
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    const allowedFields = [
      "name",
      "send_window_start",
      "send_window_end",
      "send_days",
      "timezone",
      "is_active",
    ] as const;
    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Validate time window if both provided — parse as minutes from midnight
    // to avoid lexicographic comparison issues with HH:MM strings
    if (updates.send_window_start && updates.send_window_end) {
      const toMinutes = (t: string) => {
        const [h, m] = String(t).split(":").map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      if (
        toMinutes(updates.send_window_start as string) >=
        toMinutes(updates.send_window_end as string)
      ) {
        return Response.json({ error: "Start time must be before end time" }, { status: 400 });
      }
    }

    // Validate send_days if provided
    if (updates.send_days !== undefined) {
      if (!Array.isArray(updates.send_days) || updates.send_days.length === 0) {
        return Response.json({ error: "At least one day must be selected" }, { status: 400 });
      }
    }

    // If activating this schedule, deactivate all other schedules for the same campaign first
    if (updates.is_active === true) {
      await db
        .update(outreachSchedules)
        .set({ isActive: false })
        .where(
          and(eq(outreachSchedules.campaignId, campaignId), ne(outreachSchedules.id, scheduleId)),
        );
    }

    // Map snake_case body keys to camelCase schema columns
    const drizzleUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) drizzleUpdates.name = updates.name;
    if (updates.send_window_start !== undefined)
      drizzleUpdates.sendWindowStart = updates.send_window_start;
    if (updates.send_window_end !== undefined)
      drizzleUpdates.sendWindowEnd = updates.send_window_end;
    if (updates.send_days !== undefined) drizzleUpdates.sendDays = updates.send_days;
    if (updates.timezone !== undefined) drizzleUpdates.timezone = updates.timezone;
    if (updates.is_active !== undefined) drizzleUpdates.isActive = updates.is_active;

    // Update schedule
    const [schedule] = await db
      .update(outreachSchedules)
      .set(drizzleUpdates)
      .where(
        and(eq(outreachSchedules.id, scheduleId), eq(outreachSchedules.campaignId, campaignId)),
      )
      .returning();

    if (!schedule) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }

    return Response.json(
      { schedule: toSnakeCase(schedule as Record<string, unknown>) },
      { status: 200 },
    );
  } catch (error) {
    logger.error("Error in PATCH /schedules/[scheduleId]:", error);
    return Response.json(
      {
        error: "Failed to update schedule",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/outreach/campaigns/[campaignId]/schedules/[scheduleId]
 *
 * Delete a schedule.
 * Prevents deletion if it's the last schedule for the campaign.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string; scheduleId: string }> },
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

    const { campaignId, scheduleId } = await params;

    // Validate IDs
    if (!campaignId || !scheduleId) {
      return Response.json({ error: "Campaign ID and Schedule ID are required" }, { status: 400 });
    }

    // Check if this is the last schedule
    const schedules = await db
      .select({ id: outreachSchedules.id })
      .from(outreachSchedules)
      .where(eq(outreachSchedules.campaignId, campaignId));

    if (schedules && schedules.length <= 1) {
      return Response.json(
        {
          error: "Cannot delete the last schedule. Each campaign must have at least one schedule.",
        },
        { status: 400 },
      );
    }

    // Delete schedule
    await db
      .delete(outreachSchedules)
      .where(
        and(eq(outreachSchedules.id, scheduleId), eq(outreachSchedules.campaignId, campaignId)),
      );

    return Response.json(
      { success: true, message: "Schedule deleted successfully" },
      { status: 200 },
    );
  } catch (error) {
    logger.error("Error in DELETE /schedules/[scheduleId]:", error);
    return Response.json(
      {
        error: "Failed to delete schedule",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
