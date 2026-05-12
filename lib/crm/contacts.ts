/**
 * CRM Contact domain functions
 *
 * Extracted from API route handlers to centralize business logic.
 */

import { eq, ilike, or, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, deals, stages, contactTimeline } from "@/lib/db/schema";
import { sanitizeSearchForOrFilter } from "@/lib/security/input-validation";
import { logger } from "@/lib/logger";
import { STATUS_RANK } from "./constants";
import {
  CrmError,
  type ContactListParams,
  type ContactListResult,
  type ContactDetailResult,
  type BulkUpdateContactsParams,
  type BulkUpdateContactsResult,
  type BulkDeleteContactsResult,
} from "./types";
import { writeTimelineEvent, writeTimelineEvents } from "./timeline";
import type { TimelineEventInput } from "./timeline";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * List contacts with search, status filter, and pagination
 */
export async function getContacts(params: ContactListParams): Promise<ContactListResult> {
  const { search, status, page, limit } = params;

  const conditions = [];

  if (search) {
    const sanitizedSearch = sanitizeSearchForOrFilter(search);
    if (sanitizedSearch.length > 0) {
      const pattern = `%${sanitizedSearch}%`;
      conditions.push(
        or(
          ilike(contacts.firstName, pattern),
          ilike(contacts.lastName, pattern),
          ilike(contacts.email, pattern),
          ilike(contacts.company, pattern),
        ),
      );
    } else {
      return { contacts: [], total: 0, page, limit };
    }
  }

  if (status && status !== "all") {
    conditions.push(eq(contacts.contactStatus, status));
  }

  const whereClause =
    conditions.length > 0
      ? conditions.length === 1
        ? conditions[0]
        : sql`${conditions[0]} AND ${conditions[1]}`
      : undefined;

  const offset = (page - 1) * limit;

  const [contactRows, countResult] = await Promise.all([
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
        contactStatus: contacts.contactStatus,
        source: contacts.source,
        company: contacts.company,
        jobTitle: contacts.jobTitle,
        createdAt: contacts.createdAt,
        updatedAt: contacts.updatedAt,
      })
      .from(contacts)
      .where(whereClause)
      .orderBy(sql`${contacts.createdAt} DESC`)
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(contacts).where(whereClause),
  ]);

  // Map to snake_case keys for API compatibility
  const mappedContacts = contactRows.map((c) => ({
    id: c.id,
    first_name: c.firstName,
    last_name: c.lastName,
    email: c.email,
    phone: c.phone,
    contact_status: c.contactStatus,
    source: c.source,
    company: c.company,
    job_title: c.jobTitle,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }));

  return {
    contacts: mappedContacts,
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  };
}

/**
 * Get a single contact by ID with associated deals and timeline
 */
export async function getContact(id: string): Promise<ContactDetailResult> {
  if (!UUID_REGEX.test(id)) {
    throw new CrmError("Contact not found", 404);
  }

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);

  if (!contact) {
    throw new CrmError("Contact not found", 404);
  }

  // Get associated deals with stage info
  const dealRows = await db
    .select({
      id: deals.id,
      name: deals.name,
      amount: deals.amount,
      stageId: stages.id,
      stageName: stages.name,
      stageSlug: stages.slug,
      stageColor: stages.color,
    })
    .from(deals)
    .leftJoin(stages, eq(deals.stageId, stages.id))
    .where(eq(deals.contactId, id))
    .orderBy(sql`${deals.createdAt} DESC`)
    .limit(50);

  const mappedDeals = dealRows.map((d) => ({
    id: d.id,
    name: d.name,
    amount: d.amount,
    stage: d.stageId
      ? { id: d.stageId, name: d.stageName, slug: d.stageSlug, color: d.stageColor }
      : null,
  }));

  // Get timeline
  let timelineRows: Record<string, unknown>[] = [];
  try {
    const rows = await db
      .select()
      .from(contactTimeline)
      .where(eq(contactTimeline.contactId, id))
      .orderBy(sql`${contactTimeline.createdAt} DESC`)
      .limit(20);
    timelineRows = rows.map((t) => ({
      id: t.id,
      contact_id: t.contactId,
      event_type: t.eventType,
      title: t.title,
      description: t.description,
      metadata: t.metadata,
      pipeline_id: t.pipelineId,
      stage_id: t.stageId,
      old_stage_id: t.oldStageId,
      created_at: t.createdAt,
    }));
  } catch (err) {
    logger.error("Error fetching contact timeline:", err);
  }

  // Map contact to snake_case for API compatibility
  const mappedContact = {
    id: contact.id,
    first_name: contact.firstName,
    last_name: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    company: contact.company,
    job_title: contact.jobTitle,
    contact_status: contact.contactStatus,
    source: contact.source,
    source_detail: contact.sourceDetail,
    tags: contact.tags,
    notes: contact.notes,
    linkedin_url: contact.linkedinUrl,
    website: contact.website,
    industry: contact.industry,
    seniority: contact.seniority,
    location: contact.location,
    country: contact.country,
    is_newsletter_subscriber: contact.isNewsletterSubscriber,
    first_touch_date: contact.firstTouchDate,
    last_touch_date: contact.lastTouchDate,
    latest_source: contact.latestSource,
    latest_source_detail: contact.latestSourceDetail,
    latest_utm_source: contact.latestUtmSource,
    latest_utm_medium: contact.latestUtmMedium,
    latest_utm_campaign: contact.latestUtmCampaign,
    latest_campaign_id: contact.latestCampaignId,
    original_source: contact.originalSource,
    original_source_detail: contact.originalSourceDetail,
    original_utm_source: contact.originalUtmSource,
    original_utm_medium: contact.originalUtmMedium,
    original_utm_campaign: contact.originalUtmCampaign,
    original_campaign_id: contact.originalCampaignId,
    created_at: contact.createdAt,
    updated_at: contact.updatedAt,
  };

  return {
    contact: mappedContact,
    deals: mappedDeals,
    timeline: timelineRows,
  };
}

/**
 * Update a single contact by ID with status hierarchy enforcement
 */
export async function updateContact(
  id: string,
  validatedData: Record<string, unknown>,
): Promise<{ contact: Record<string, unknown> }> {
  if (!UUID_REGEX.test(id)) {
    throw new CrmError("Contact not found", 404);
  }

  const allowedFields = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "company",
    "job_title",
    "contact_status",
    "notes",
    "tags",
    "linkedin_url",
    "website",
    "industry",
    "seniority",
    "location",
    "country",
    "is_newsletter_subscriber",
  ] as const;

  // Map snake_case input to camelCase Drizzle columns
  const fieldMap: Record<string, keyof typeof contacts.$inferInsert> = {
    first_name: "firstName",
    last_name: "lastName",
    email: "email",
    phone: "phone",
    company: "company",
    job_title: "jobTitle",
    contact_status: "contactStatus",
    notes: "notes",
    tags: "tags",
    linkedin_url: "linkedinUrl",
    website: "website",
    industry: "industry",
    seniority: "seniority",
    location: "location",
    country: "country",
    is_newsletter_subscriber: "isNewsletterSubscriber",
  };

  const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  for (const field of allowedFields) {
    if (field in validatedData) {
      const drizzleField = fieldMap[field];
      if (drizzleField) {
        updateData[drizzleField] = validatedData[field];
      }
    }
  }

  // Fetch current contact for status hierarchy check and change detection
  const needsPreFetch = validatedData.contact_status || "notes" in validatedData;
  let previousStatus: string | null = null;
  let previousNotes: string | null = null;

  if (needsPreFetch) {
    const [existing] = await db
      .select({ contactStatus: contacts.contactStatus, notes: contacts.notes })
      .from(contacts)
      .where(eq(contacts.id, id))
      .limit(1);

    if (!existing) {
      throw new CrmError("Contact not found", 404);
    }

    previousStatus = existing.contactStatus;
    previousNotes = existing.notes;

    // Enforce status hierarchy: never downgrade
    if (validatedData.contact_status) {
      const currentRank = previousStatus ? (STATUS_RANK[previousStatus] ?? 0) : 0;
      const newRank = STATUS_RANK[validatedData.contact_status as string] ?? 0;

      if (newRank < currentRank) {
        throw new CrmError(
          `Cannot downgrade contact status from "${previousStatus}" to "${validatedData.contact_status}"`,
          400,
        );
      }
    }
  }

  const [updated] = await db
    .update(contacts)
    .set(updateData as typeof contacts.$inferInsert)
    .where(eq(contacts.id, id))
    .returning();

  if (!updated) {
    throw new CrmError("Failed to update contact", 500);
  }

  // Map back to snake_case for API compatibility
  const contact = {
    id: updated.id,
    first_name: updated.firstName,
    last_name: updated.lastName,
    email: updated.email,
    phone: updated.phone,
    company: updated.company,
    job_title: updated.jobTitle,
    contact_status: updated.contactStatus,
    source: updated.source,
    notes: updated.notes,
    tags: updated.tags,
    created_at: updated.createdAt,
    updated_at: updated.updatedAt,
  };

  // Write timeline events only for actual changes
  if (
    validatedData.contact_status &&
    updated.contactStatus &&
    updated.contactStatus !== previousStatus
  ) {
    void writeTimelineEvent({
      contactId: id,
      eventType: "status_changed",
      title: `Status changed to ${updated.contactStatus}`,
      metadata: { new_status: updated.contactStatus, old_status: previousStatus },
    });
  }

  if ("notes" in validatedData && validatedData.notes !== previousNotes) {
    void writeTimelineEvent({
      contactId: id,
      eventType: "note_added",
      title: "Notes updated",
    });
  }

  return { contact };
}

/**
 * Bulk update contacts (status, tags, or add_tags)
 */
export async function bulkUpdateContacts(
  params: BulkUpdateContactsParams,
): Promise<BulkUpdateContactsResult> {
  const { contact_ids, updates } = params;

  // If adding tags, use atomic RPC to merge tags in a single query
  if (updates.add_tags && updates.add_tags.length > 0) {
    const result = await db.execute<{ bulk_add_tags: number }>(
      sql`SELECT bulk_add_tags(${contact_ids}::uuid[], ${updates.add_tags}::text[])`,
    );

    const updated = ((result[0] as Record<string, unknown>)?.bulk_add_tags as number) ?? 0;

    // Write timeline events for tag additions
    const tagEvents = contact_ids.map((cid) => ({
      contactId: cid,
      eventType: "tags_updated" as const,
      title: `Tags updated: +${updates.add_tags!.join(", +")}`,
      metadata: { added_tags: updates.add_tags },
    }));
    void writeTimelineEvents(tagEvents);

    return {
      updated,
      message: `Added tags to ${updated} of ${contact_ids.length} contacts`,
    };
  }

  // Enforce status hierarchy: never downgrade contact status
  if (updates.contact_status) {
    const newRank = STATUS_RANK[updates.contact_status] ?? 0;

    const currentContacts = await db
      .select({ id: contacts.id, contactStatus: contacts.contactStatus })
      .from(contacts)
      .where(inArray(contacts.id, contact_ids));

    const wouldDowngrade = currentContacts.some(
      (c) => (STATUS_RANK[c.contactStatus ?? ""] ?? 0) > newRank,
    );

    if (wouldDowngrade) {
      throw new CrmError(
        "Cannot downgrade contact status. Some contacts have a higher status.",
        400,
      );
    }
  }

  // Standard bulk update (status, replace tags)
  const updateData: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (updates.contact_status) updateData.contactStatus = updates.contact_status;
  if (updates.tags) updateData.tags = updates.tags;

  const updatedRows = await db
    .update(contacts)
    .set(updateData as typeof contacts.$inferInsert)
    .where(inArray(contacts.id, contact_ids))
    .returning({ id: contacts.id });

  const updatedCount = updatedRows.length;

  // Write timeline events for bulk changes
  if (updatedRows.length > 0) {
    const timelineEvents = updatedRows.flatMap((row) => {
      const events: TimelineEventInput[] = [];
      if (updates.contact_status) {
        events.push({
          contactId: row.id,
          eventType: "status_changed",
          title: `Status changed to ${updates.contact_status}`,
          metadata: { new_status: updates.contact_status },
        });
      }
      if (updates.tags) {
        events.push({
          contactId: row.id,
          eventType: "tags_updated",
          title: `Tags updated`,
          metadata: { tags: updates.tags },
        });
      }
      return events;
    });

    if (timelineEvents.length > 0) {
      void writeTimelineEvents(timelineEvents);
    }
  }

  return {
    updated: updatedCount,
    message: `Updated ${updatedCount} of ${contact_ids.length} contacts`,
  };
}

/**
 * Bulk delete contacts via RPC
 */
export async function bulkDeleteContacts(contactIds: string[]): Promise<BulkDeleteContactsResult> {
  try {
    await db.execute(sql`SELECT bulk_delete_contacts(${contactIds}::uuid[])`);
  } catch (err) {
    logger.error("Error in bulk delete contacts RPC:", err);
    throw new CrmError("Failed to delete contacts", 500);
  }

  return {
    deleted: contactIds.length,
    message: `Successfully deleted ${contactIds.length} contacts`,
  };
}
