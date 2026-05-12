import { NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { checkRateLimit, getClientIp, rateLimiters } from "@/lib/rate-limit";
import { activateContacts } from "@/lib/outreach/contacts";
import { getCampaignSchedule } from "@/lib/outreach/campaigns/queries";
import { scheduleToBusinessHours } from "@/lib/outreach/scheduling/business-hours";

const MAX_CONTACT_IDS = 500;

/**
 * POST /api/outreach/contacts/bulk/activate
 *
 * Bulk activate contacts by IDs.
 *
 * @body contact_ids - Array of contact UUIDs to activate (max 500)
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(ip, rateLimiters.api, "api");
    if (!rateLimit.success) {
      return Response.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": Math.ceil(rateLimit.resetIn / 1000).toString() } },
      );
    }

    // Check authentication and admin role
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify admin permissions (both admin and super_admin can access)
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return Response.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    const { contact_ids, campaign_id } = body;

    if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
      return Response.json({ error: "contact_ids must be a non-empty array" }, { status: 400 });
    }

    if (contact_ids.length > MAX_CONTACT_IDS) {
      return Response.json(
        { error: `contact_ids must not exceed ${MAX_CONTACT_IDS} items` },
        { status: 400 },
      );
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      !contact_ids.every((id: unknown) => typeof id === "string" && UUID_REGEX.test(id as string))
    ) {
      return Response.json({ error: "All contact_ids must be valid UUIDs" }, { status: 400 });
    }

    // Fetch campaign schedule if campaign_id provided
    let businessHours;
    if (campaign_id && typeof campaign_id === "string") {
      const schedule = await getCampaignSchedule(campaign_id);
      if (schedule) {
        businessHours = scheduleToBusinessHours(schedule);
      }
    }

    const activated = await activateContacts(contact_ids, businessHours);

    return Response.json({ success: true, activated }, { status: 200 });
  } catch (error) {
    logger.error("Error bulk activating contacts:", error);
    return Response.json(
      {
        error: "Failed to bulk activate contacts",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
