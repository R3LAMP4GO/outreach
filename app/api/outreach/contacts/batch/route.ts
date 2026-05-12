import { inArray, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachContacts } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { validateOffsetPaginationParams } from "@/lib/security/input-validation";
import { toSnakeCaseArray } from "@/lib/outreach/lib/drizzle-helpers";
import type { Contact } from "@/lib/outreach/types/index";

// Security constants
const MAX_CAMPAIGN_IDS = 100;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Batch fetch contacts for multiple campaigns
 * GET /api/outreach/contacts/batch?campaignIds=1,2,3&limit=50&offset=0
 */
export async function GET(request: Request) {
  try {
    // Authentication check
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify admin permissions (both admin and super_admin can access)
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const campaignIdsParam = searchParams.get("campaignIds");
    const { limit, offset } = validateOffsetPaginationParams(
      searchParams.get("offset"),
      searchParams.get("limit"),
    );

    if (!campaignIdsParam) {
      return NextResponse.json({ error: "campaignIds parameter is required" }, { status: 400 });
    }

    const campaignIds = campaignIdsParam.split(",").map((id) => id.trim());

    // Validate array size limit
    if (campaignIds.length > MAX_CAMPAIGN_IDS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_CAMPAIGN_IDS} campaign IDs allowed` },
        { status: 400 },
      );
    }

    // Validate all campaign IDs are valid UUIDs
    if (campaignIds.some((id) => !id || !UUID_REGEX.test(id))) {
      return NextResponse.json(
        { error: "Invalid campaign ID format. Expected valid UUIDs" },
        { status: 400 },
      );
    }

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(outreachContacts)
      .where(inArray(outreachContacts.campaignId, campaignIds));

    // Get contacts with pagination
    const data = await db
      .select()
      .from(outreachContacts)
      .where(inArray(outreachContacts.campaignId, campaignIds))
      .orderBy(desc(outreachContacts.createdAt))
      .limit(limit)
      .offset(offset);

    // Drizzle returns camelCase column names; the admin UI expects snake_case.
    return NextResponse.json({
      contacts: toSnakeCaseArray<Contact>(data || []),
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Unexpected error in batch contacts endpoint:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
