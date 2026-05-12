/**
 * Tags API endpoint for autocomplete
 * GET /api/outreach/campaigns/tags - Get all unique tags across campaigns
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";

/**
 * Get all unique tags for autocomplete
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Call database function to get unique tags
    const rows = await db.execute<{ tag: string }>(sql`SELECT * FROM get_unique_tags()`);

    // Extract tag strings from result rows
    const tags = (rows as unknown as { tag: string }[]).map((row) => row.tag);

    return NextResponse.json({ tags });
  } catch (error) {
    logger.error("Exception fetching tags:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
