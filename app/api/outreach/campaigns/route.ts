import { NextRequest } from "next/server";
import { createCampaign, listCampaigns, countCampaigns } from "@/lib/outreach/campaigns";
import type { CampaignStatus } from "@/lib/outreach/types";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { validateOffsetPaginationParams } from "@/lib/security/input-validation";

/**
 * GET /api/outreach/campaigns
 *
 * List campaigns with optional filtering and pagination.
 *
 * @query status - Filter by status (draft, active, paused, completed)
 * @query limit - Number of campaigns per page (default: 50)
 * @query offset - Offset for pagination (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Check authentication
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const search = searchParams.get("search") || undefined;
    const { limit, offset } = validateOffsetPaginationParams(
      searchParams.get("offset"),
      searchParams.get("limit"),
    );

    // 3. Build filters
    const filters: { status?: CampaignStatus; search?: string; limit: number; offset: number } = {
      status: status as CampaignStatus,
      search,
      limit,
      offset,
    };

    // 4. Fetch campaigns and total count
    const [campaigns, total] = await Promise.all([
      listCampaigns(filters),
      countCampaigns({ status: status as CampaignStatus, search }),
    ]);

    return Response.json(
      {
        campaigns,
        total,
        limit,
        offset,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error("Error listing campaigns:", error);

    return Response.json(
      {
        error: "Failed to fetch outreach campaigns from database",
        message: error instanceof Error ? error.message : "Unknown database error",
        details: "Could not load campaigns. Please try refreshing.",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/outreach/campaigns
 *
 * Create a new campaign.
 *
 * @body name - Campaign name (required)
 * @body from_name - Sender name (required)
 * @body from_email - Sender email (required)
 * @body reply_to - Reply-to email (optional)
 * @body status - Campaign status (default: draft)
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Check authentication + admin role
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Parse request body
    let data;
    try {
      data = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    // 3. Validate required fields
    const { name, from_name, from_email } = data;

    if (!name || typeof name !== "string") {
      return Response.json({ error: "Campaign name is required" }, { status: 400 });
    }

    if (!from_name || typeof from_name !== "string") {
      return Response.json({ error: "Sender name (from_name) is required" }, { status: 400 });
    }

    if (!from_email || typeof from_email !== "string") {
      return Response.json({ error: "Sender email (from_email) is required" }, { status: 400 });
    }

    // 4. Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(from_email)) {
      return Response.json({ error: "Invalid sender email format" }, { status: 400 });
    }

    if (data.reply_to && !emailRegex.test(data.reply_to)) {
      return Response.json({ error: "Invalid reply-to email format" }, { status: 400 });
    }

    // 5. Create campaign with owner_id
    const campaign = await createCampaign({
      ...data,
      owner_id: session.user.id,
    });

    if (!campaign) {
      return Response.json(
        {
          error: "Failed to create outreach campaign in database",
          details: "Campaign creation returned no data. Please try again.",
        },
        { status: 500 },
      );
    }

    return Response.json(
      {
        campaign,
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error("Error creating campaign:", error);

    return Response.json(
      {
        error: "Failed to create outreach campaign",
        message: error instanceof Error ? error.message : "Unknown error",
        details: "Could not save campaign to database. Please check your input and try again.",
      },
      { status: 500 },
    );
  }
}
