import { NextRequest } from "next/server";
import { eq, and, lt, ilike, or, desc, sql, isNull, notInArray, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachContacts } from "@/lib/db/schema";
import { getCampaign, updateCampaign, deleteCampaign } from "@/lib/outreach/campaigns";
import { getCampaignSchedule } from "@/lib/outreach/campaigns/queries";
import { activateContacts } from "@/lib/outreach/contacts/actions";
import { validateEmailList } from "@/lib/outreach/lib";
import { toSnakeCaseArray } from "@/lib/outreach/lib/drizzle-helpers";
import type { Contact } from "@/lib/outreach/types/index";
import { scheduleToBusinessHours } from "@/lib/outreach/scheduling/business-hours";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";

// Cap on how many contacts we will rescheduled inline inside this HTTP handler.
// Activations larger than this should be dispatched via a queued job to avoid
// long-running requests and timeouts.
const MAX_INLINE_ACTIVATIONS = 1000;

/**
 * GET /api/outreach/campaigns/[campaignId]
 *
 * Get a single campaign by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    // 1. Check authentication
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Check admin permissions
    if (!session.user.role || !["admin", "super_admin"].includes(session.user.role)) {
      return Response.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    const { campaignId } = await params;

    // 3. Validate campaign ID
    if (!campaignId) {
      return Response.json({ error: "Campaign ID is required" }, { status: 400 });
    }

    // 4. Fetch campaign
    const campaign = await getCampaign(campaignId);

    if (!campaign) {
      return Response.json({ error: "Campaign not found" }, { status: 404 });
    }

    // 5. Fetch contacts for this campaign (with optional search, filters, pagination)
    const searchParam = request.nextUrl.searchParams.get("search")?.trim() || "";
    const limitParam = parseInt(request.nextUrl.searchParams.get("limit") || "0", 10);
    const offsetParam = parseInt(request.nextUrl.searchParams.get("offset") || "0", 10);
    // Faceted filters: comma-separated lists, e.g. ?status=contacted,reply_received&step=1,2
    const statusParam = request.nextUrl.searchParams.get("status")?.trim() || "";
    const stepParam = request.nextUrl.searchParams.get("step")?.trim() || "";
    const statusFilters = statusParam ? statusParam.split(",").filter(Boolean) : [];
    const stepFilters = stepParam
      ? stepParam
          .split(",")
          .map((s) => parseInt(s, 10))
          .filter((n) => Number.isFinite(n))
      : [];

    // Build where conditions
    const conditions = [eq(outreachContacts.campaignId, campaignId)];

    if (searchParam) {
      const sanitized = searchParam
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");
      const pattern = `%${sanitized}%`;

      conditions.push(
        or(
          ilike(outreachContacts.email, pattern),
          ilike(outreachContacts.firstName, pattern),
          ilike(outreachContacts.lastName, pattern),
          ilike(outreachContacts.company, pattern),
        )!,
      );
    }

    if (statusFilters.length > 0) {
      conditions.push(inArray(outreachContacts.status, statusFilters));
    }

    if (stepFilters.length > 0) {
      conditions.push(inArray(outreachContacts.currentStep, stepFilters));
    }

    const whereClause = and(...conditions);

    // Get total count
    const [{ count: contactsCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(outreachContacts)
      .where(whereClause);

    // Get contacts with pagination
    let contactsQuery = db
      .select()
      .from(outreachContacts)
      .where(whereClause)
      .orderBy(desc(outreachContacts.createdAt));

    if (limitParam > 0) {
      contactsQuery = contactsQuery.limit(limitParam).offset(offsetParam) as typeof contactsQuery;
    }

    const contacts = await contactsQuery;

    // Drizzle returns camelCase columns (firstName, email1Subject, etc.) but the
    // admin UI expects snake_case (first_name, email_1_subject, ...). Without this
    // mapping every lead detail field renders blank even though the data is present.
    const contactsSnakeCase = toSnakeCaseArray<Contact>(contacts || []);

    // Add contacts to campaign response
    const campaignWithContacts = {
      ...campaign,
      contacts: contactsSnakeCase,
      total_contacts: contactsCount ?? contactsSnakeCase.length,
    };

    return Response.json({ campaign: campaignWithContacts }, { status: 200 });
  } catch (error) {
    logger.error("Error fetching campaign:", error);

    return Response.json(
      {
        error: "Failed to fetch outreach campaign from database",
        message: error instanceof Error ? error.message : "Unknown database error",
        details: "Could not load campaign. Please try refreshing.",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/outreach/campaigns/[campaignId]
 *
 * Update a campaign.
 *
 * @body name - Campaign name (optional)
 * @body status - Campaign status (optional)
 * @body from_name - Sender name (optional)
 * @body from_email - Sender email (optional)
 * @body reply_to - Reply-to email (optional)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    // 1. Check authentication
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Check admin permissions
    if (!session.user.role || !["admin", "super_admin"].includes(session.user.role)) {
      return Response.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    const { campaignId } = await params;

    // 3. Validate campaign ID
    if (!campaignId) {
      return Response.json({ error: "Campaign ID is required" }, { status: 400 });
    }

    // 4. Parse request body
    let updates;
    try {
      updates = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    // 3. Validate email formats if provided
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (updates.from_email && !emailRegex.test(updates.from_email)) {
      return Response.json({ error: "Invalid sender email format" }, { status: 400 });
    }

    if (updates.reply_to && !emailRegex.test(updates.reply_to)) {
      return Response.json({ error: "Invalid reply-to email format" }, { status: 400 });
    }

    // Validate sending pattern fields
    if (updates.min_send_interval_minutes !== undefined) {
      if (
        typeof updates.min_send_interval_minutes !== "number" ||
        updates.min_send_interval_minutes < 1
      ) {
        return Response.json(
          { error: "Minimum send interval must be at least 1 minute" },
          { status: 400 },
        );
      }
    }

    if (updates.random_send_interval_minutes !== undefined) {
      if (
        typeof updates.random_send_interval_minutes !== "number" ||
        updates.random_send_interval_minutes < 0
      ) {
        return Response.json(
          { error: "Random send interval must be 0 or greater" },
          { status: 400 },
        );
      }
    }

    // Validate tags if provided
    if (updates.tags !== undefined) {
      if (!Array.isArray(updates.tags)) {
        return Response.json({ error: "Tags must be an array" }, { status: 400 });
      }

      // Validate each tag is a non-empty string
      if (
        !updates.tags.every(
          (tag: unknown) => typeof tag === "string" && (tag as string).trim().length > 0,
        )
      ) {
        return Response.json({ error: "All tags must be non-empty strings" }, { status: 400 });
      }

      // Trim and lowercase tags for consistency
      updates.tags = updates.tags.map((tag: string) => tag.trim().toLowerCase());
    }

    // Validate max new leads per day if provided
    if (updates.max_new_leads_per_day !== undefined && updates.max_new_leads_per_day !== null) {
      if (typeof updates.max_new_leads_per_day !== "number" || updates.max_new_leads_per_day < 1) {
        return Response.json(
          { error: "Max new leads per day must be at least 1 (or null for unlimited)" },
          { status: 400 },
        );
      }
    }

    // Validate boolean options fields
    const booleanFields = [
      "track_opens",
      "track_clicks",
      "stop_on_auto_reply",
      "insert_unsubscribe_header",
      "text_only",
      "text_only_first",
      "stop_company_on_reply",
      "test_mode",
    ] as const;

    for (const field of booleanFields) {
      if (updates[field] !== undefined && typeof updates[field] !== "boolean") {
        return Response.json({ error: `${field} must be a boolean` }, { status: 400 });
      }
    }

    // Validate CC recipients if provided
    if (updates.cc_recipients !== undefined) {
      if (!Array.isArray(updates.cc_recipients)) {
        return Response.json({ error: "CC recipients must be an array" }, { status: 400 });
      }

      if (updates.cc_recipients.length > 0) {
        const { valid, invalid } = validateEmailList(updates.cc_recipients);
        if (invalid.length > 0) {
          return Response.json(
            { error: `Invalid CC email addresses: ${invalid.join(", ")}` },
            { status: 400 },
          );
        }
        updates.cc_recipients = valid; // Use validated emails
      }
    }

    // Validate BCC recipients if provided
    if (updates.bcc_recipients !== undefined) {
      if (!Array.isArray(updates.bcc_recipients)) {
        return Response.json({ error: "BCC recipients must be an array" }, { status: 400 });
      }

      if (updates.bcc_recipients.length > 0) {
        const { valid, invalid } = validateEmailList(updates.bcc_recipients);
        if (invalid.length > 0) {
          return Response.json(
            { error: `Invalid BCC email addresses: ${invalid.join(", ")}` },
            { status: 400 },
          );
        }
        updates.bcc_recipients = valid; // Use validated emails
      }
    }

    // Validate owner_id if provided
    if (updates.owner_id !== undefined && updates.owner_id !== null) {
      // Basic UUID format validation
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (typeof updates.owner_id !== "string" || !uuidRegex.test(updates.owner_id)) {
        return Response.json({ error: "Invalid owner_id format" }, { status: 400 });
      }
    }

    // 5. Update campaign
    const campaign = await updateCampaign(campaignId, updates);

    if (!campaign) {
      return Response.json({ error: "Campaign not found" }, { status: 404 });
    }

    // 6. When activating a campaign, enroll/schedule every non-terminal contact.
    //
    // This handles BOTH:
    //   - First-time activation: fresh imports come in as status='lead' (or 'pending'/NULL)
    //     with next_send_at=NULL. Without this, clicking Activate did nothing for them.
    //   - Resume-from-pause: already-active contacts get next_send_at recomputed,
    //     catching NULL, stale past dates, and far-future sentinel dates from failed
    //     QStash dispatches.
    //
    // Excludes terminal states (replied, bounced, unsubscribed, completed) and
    // opted-out contacts. Includes NULL current_step (fresh imports).
    let activated = 0;
    let capHit = false;

    if (updates.status === "active") {
      const contactsToActivate = await db
        .select({ id: outreachContacts.id })
        .from(outreachContacts)
        .where(
          and(
            eq(outreachContacts.campaignId, campaignId),
            notInArray(outreachContacts.status, [
              "replied",
              "bounced",
              "unsubscribed",
              "completed",
            ]),
            or(eq(outreachContacts.optOut, false), isNull(outreachContacts.optOut)),
            or(lt(outreachContacts.currentStep, 3), isNull(outreachContacts.currentStep)),
          ),
        )
        .limit(MAX_INLINE_ACTIVATIONS);

      if (contactsToActivate.length > 0) {
        const schedule = await getCampaignSchedule(campaignId);
        const businessHours = schedule ? scheduleToBusinessHours(schedule) : undefined;

        activated = await activateContacts(
          contactsToActivate.map((c) => c.id),
          businessHours,
        );

        logger.info(`Scheduled ${activated} contacts for activated campaign ${campaignId}`);

        if (contactsToActivate.length === MAX_INLINE_ACTIVATIONS) {
          capHit = true;
          logger.warn(
            `Campaign ${campaignId} hit the inline activation cap (${MAX_INLINE_ACTIVATIONS}). ` +
              `Remaining contacts should be rescheduled via a queued job.`,
          );
        }
      }
    }

    return Response.json({ campaign, activated, capHit }, { status: 200 });
  } catch (error) {
    logger.error("Error updating campaign:", error);

    return Response.json(
      {
        error: "Failed to update outreach campaign in database",
        message: error instanceof Error ? error.message : "Unknown database error",
        details: "Could not save campaign changes. Please try again.",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/outreach/campaigns/[campaignId]
 *
 * Delete a campaign and all associated data.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    // 1. Check authentication
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Check admin permissions
    if (!session.user.role || !["admin", "super_admin"].includes(session.user.role)) {
      return Response.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    const { campaignId } = await params;

    // 3. Validate campaign ID
    if (!campaignId) {
      return Response.json({ error: "Campaign ID is required" }, { status: 400 });
    }

    // 4. Delete campaign
    const success = await deleteCampaign(campaignId);

    if (!success) {
      return Response.json({ error: "Campaign not found" }, { status: 404 });
    }

    return Response.json(
      {
        success: true,
        message: "Campaign deleted successfully",
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error("Error deleting campaign:", error);

    return Response.json(
      {
        error: "Failed to delete outreach campaign from database",
        message: error instanceof Error ? error.message : "Unknown database error",
        details: "Could not delete campaign and associated data. Please try again.",
      },
      { status: 500 },
    );
  }
}
