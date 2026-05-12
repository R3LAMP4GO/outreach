import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachContacts, outreachCampaigns } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { checkRateLimit, getClientIp, rateLimiters } from "@/lib/rate-limit";
import { toSnakeCase } from "@/lib/outreach/lib/drizzle-helpers";
import type { Contact } from "@/lib/outreach/types/index";

/**
 * GET /api/outreach/contacts/[contactId]
 *
 * Get a single contact by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    const { contactId } = await params;

    if (!contactId) {
      return Response.json({ error: "Contact ID is required" }, { status: 400 });
    }

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

    const [contact] = await db
      .select()
      .from(outreachContacts)
      .where(eq(outreachContacts.id, contactId))
      .limit(1);

    if (!contact) {
      return Response.json({ error: "Contact not found" }, { status: 404 });
    }

    // Drizzle returns camelCase; the admin UI expects snake_case keys.
    return Response.json({ contact: toSnakeCase<Contact>(contact) }, { status: 200 });
  } catch (error) {
    logger.error("Error fetching contact:", error);
    return Response.json(
      {
        error: "Failed to fetch contact",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/outreach/contacts/[contactId]
 *
 * Update a contact's email content and other fields.
 *
 * @body email_1_subject - Email 1 subject (optional)
 * @body email_1_body - Email 1 body (optional)
 * @body email_2_subject - Email 2 subject (optional)
 * @body email_2_body - Email 2 body (optional)
 * @body email_3_subject - Email 3 subject (optional)
 * @body email_3_body - Email 3 body (optional)
 * @body status - Contact status (optional)
 * @body email - Contact email (optional)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    const { contactId } = await params;

    if (!contactId) {
      return Response.json({ error: "Contact ID is required" }, { status: 400 });
    }

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

    let updates;
    try {
      updates = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    // Allowed fields to update
    const allowedFields = [
      "email",
      "email_1_subject",
      "email_1_body",
      "email_2_subject",
      "email_2_body",
      "email_3_subject",
      "email_3_body",
      "first_name",
      "last_name",
      "company",
      "job_title",
      "seniority",
      "phone",
      "location",
      "website_url",
      "linkedin_url",
      "industry",
      "company_size",
      "company_revenue",
      "founded_year",
      "email_provider",
      "email_security_gateway",
      "security_tier",
      "security_level",
      "status",
      "opt_out",
      "research_report",
      "timezone",
    ];

    // Filter to only allowed fields and validate types
    const filteredUpdates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        // Type validation for numeric fields
        if (field === "company_revenue" || field === "founded_year") {
          const value = updates[field];
          if (value !== null && value !== "") {
            const numValue = Number(value);
            if (isNaN(numValue)) {
              return Response.json({ error: `${field} must be a valid number` }, { status: 400 });
            }
            filteredUpdates[field] = numValue;
          } else {
            filteredUpdates[field] = null;
          }
        } else {
          filteredUpdates[field] = updates[field];
        }
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return Response.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Validate email format if provided
    if (filteredUpdates.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(filteredUpdates.email as string)) {
        return Response.json({ error: "Invalid email format" }, { status: 400 });
      }
    }

    // Validate status if provided
    if (filteredUpdates.status) {
      const validStatuses = [
        // System-controlled statuses (set by automation)
        "reply_received",
        "link_clicked",
        "completed_no_reply",
        "email_opened",
        "no_emails_opened",
        "unsubscribed",
        "bounced",
        "skipped",
        "contacted",
        "not_yet_contacted",
        "risky",
        "invalid",
        "valid",
        "in_subsequence",
        "completed",
        // Manual lead statuses (user can set these)
        "lead",
        "interested",
        "meeting_booked",
        "meeting_complete",
        "won",
        "out_of_office",
        "wrong_person",
        "not_interested",
        "lost",
        // Legacy statuses
        "pending",
        "active",
        "paused",
        "replied",
      ];
      if (!validStatuses.includes(filteredUpdates.status as string)) {
        return Response.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 },
        );
      }
    }

    // Handle scheduling when status changes
    if (filteredUpdates.status === "active") {
      // Fetch current contact to check if next_send_at needs to be set
      const [currentContact] = await db
        .select({
          timezone: outreachContacts.timezone,
          currentStep: outreachContacts.currentStep,
          nextSendAt: outreachContacts.nextSendAt,
          optOut: outreachContacts.optOut,
          campaignId: outreachContacts.campaignId,
        })
        .from(outreachContacts)
        .where(eq(outreachContacts.id, contactId))
        .limit(1);

      if (currentContact?.optOut) {
        return Response.json({ error: "Cannot activate opted-out contact" }, { status: 400 });
      }

      if (currentContact && !currentContact.nextSendAt) {
        const { calculateEmail1SendTime } = await import("@/lib/outreach/scheduling/calculator");
        const { getCampaignSchedule } = await import("@/lib/outreach/campaigns/queries");
        const { scheduleToBusinessHours } = await import(
          "@/lib/outreach/scheduling/business-hours"
        );

        let businessHours;
        if (currentContact.campaignId) {
          const schedule = await getCampaignSchedule(currentContact.campaignId);
          if (schedule) {
            businessHours = scheduleToBusinessHours(schedule);
          }
        }

        const nextSendAt = calculateEmail1SendTime(
          { timezone: currentContact.timezone },
          true,
          businessHours,
        );
        filteredUpdates.next_send_at = nextSendAt.toISOString();
      }
    } else if (filteredUpdates.status === "paused") {
      // Clear scheduled send time when pausing
      filteredUpdates.next_send_at = null;
    }

    // Add updated_at timestamp
    filteredUpdates.updated_at = new Date().toISOString();

    // Map snake_case keys to camelCase for Drizzle
    const snakeToCamel: Record<string, string> = {
      email_1_subject: "email1Subject",
      email_1_body: "email1Body",
      email_2_subject: "email2Subject",
      email_2_body: "email2Body",
      email_3_subject: "email3Subject",
      email_3_body: "email3Body",
      first_name: "firstName",
      last_name: "lastName",
      job_title: "jobTitle",
      website_url: "websiteUrl",
      linkedin_url: "linkedinUrl",
      company_size: "companySize",
      company_revenue: "companyRevenue",
      founded_year: "foundedYear",
      email_provider: "emailProvider",
      email_security_gateway: "emailSecurityGateway",
      security_tier: "securityTier",
      security_level: "securityLevel",
      opt_out: "optOut",
      research_report: "researchReport",
      next_send_at: "nextSendAt",
      updated_at: "updatedAt",
    };

    const drizzleUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(filteredUpdates)) {
      const camelKey = snakeToCamel[key] || key;
      drizzleUpdates[camelKey] = value;
    }

    const [contact] = await db
      .update(outreachContacts)
      .set(drizzleUpdates)
      .where(eq(outreachContacts.id, contactId))
      .returning();

    if (!contact) {
      return Response.json({ error: "Contact not found" }, { status: 404 });
    }

    return Response.json({ contact: toSnakeCase<Contact>(contact) }, { status: 200 });
  } catch (error) {
    logger.error("Error updating contact:", error);
    return Response.json(
      {
        error: "Failed to update contact",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/outreach/contacts/[contactId]
 *
 * Delete a contact.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    const { contactId } = await params;

    if (!contactId) {
      return Response.json({ error: "Contact ID is required" }, { status: 400 });
    }

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

    // Get the contact's campaign_id before deleting
    const [contact] = await db
      .select({ campaignId: outreachContacts.campaignId })
      .from(outreachContacts)
      .where(eq(outreachContacts.id, contactId))
      .limit(1);

    if (!contact || !contact.campaignId) {
      return Response.json({ error: "Contact not found" }, { status: 404 });
    }

    const campaignId = contact.campaignId;

    await db.delete(outreachContacts).where(eq(outreachContacts.id, contactId));

    // Decrement campaign total_contacts counter
    const [campaign] = await db
      .select({ totalContacts: outreachCampaigns.totalContacts })
      .from(outreachCampaigns)
      .where(eq(outreachCampaigns.id, campaignId))
      .limit(1);

    if (campaign) {
      await db
        .update(outreachCampaigns)
        .set({
          totalContacts: Math.max(0, (campaign.totalContacts || 0) - 1),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(outreachCampaigns.id, campaignId));
    }

    return Response.json(
      { success: true, message: "Contact deleted successfully" },
      { status: 200 },
    );
  } catch (error) {
    logger.error("Error deleting contact:", error);
    return Response.json(
      {
        error: "Failed to delete contact",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
