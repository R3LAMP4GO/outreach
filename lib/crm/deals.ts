/**
 * CRM Deal domain functions
 *
 * Extracted from API route handlers to centralize business logic.
 */

import { eq, ilike, or, inArray, sql, and } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  deals,
  contacts,
  stages,
  dealStageHistory,
  pipelines,
  outreachReplies,
} from "@/lib/db/schema";
import { sanitizeSearchForOrFilter } from "@/lib/security/input-validation";
import { logger } from "@/lib/logger";
import type {
  DealListParams,
  DealListResult,
  DealDetailResult,
  DealUpdateData,
  MoveDealParams,
  BulkUpdateDealsParams,
  BulkUpdateDealsResult,
  BulkDeleteDealsResult,
  PipelineDealsResult,
} from "./types";
import { CrmError } from "./types";
import { writeTimelineEvent, writeTimelineEvents } from "./timeline";

/**
 * List deals with pipeline, search, stage filter, and pagination
 */
export async function getDeals(params: DealListParams): Promise<DealListResult> {
  const { pipelineSlug = "sales-pipeline", search, stageSlug, page, limit } = params;

  // Get pipeline ID
  const [pipeline] = await db
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(eq(pipelines.slug, pipelineSlug))
    .limit(1);

  if (!pipeline) {
    throw new CrmError("Pipeline not found", 404);
  }

  // Build where conditions
  const conditions = [];

  // Apply search filter
  if (search && search.length <= 100) {
    const sanitizedSearch = sanitizeSearchForOrFilter(search);
    if (sanitizedSearch.length > 0) {
      const pattern = `%${sanitizedSearch}%`;
      conditions.push(
        or(
          ilike(deals.name, pattern),
          ilike(contacts.firstName, pattern),
          ilike(contacts.lastName, pattern),
          ilike(contacts.email, pattern),
        ),
      );
    }
  }

  // Apply stage filter
  if (stageSlug && stageSlug !== "all") {
    const [stage] = await db
      .select({ id: stages.id })
      .from(stages)
      .where(and(eq(stages.slug, stageSlug), eq(stages.pipelineId, pipeline.id)))
      .limit(1);

    if (stage) {
      conditions.push(eq(deals.stageId, stage.id));
    }
  }

  const whereClause =
    conditions.length > 0
      ? conditions.length === 1
        ? conditions[0]
        : and(...conditions)
      : undefined;

  // Pagination
  const offset = (page - 1) * limit;

  try {
    const [dealRows, countResult] = await Promise.all([
      db
        .select({
          id: deals.id,
          name: deals.name,
          amount: deals.amount,
          probability: deals.probability,
          expectedCloseDate: deals.expectedCloseDate,
          stageId: deals.stageId,
          contactId: deals.contactId,
          source: deals.source,
          status: deals.status,
          notes: deals.notes,
          stageEnteredAt: deals.stageEnteredAt,
          meetingBookedAt: deals.meetingBookedAt,
          wonAt: deals.wonAt,
          lostAt: deals.lostAt,
          lostReason: deals.lostReason,
          createdAt: deals.createdAt,
          updatedAt: deals.updatedAt,
          // Contact fields
          cId: contacts.id,
          cFirstName: contacts.firstName,
          cLastName: contacts.lastName,
          cEmail: contacts.email,
          cContactStatus: contacts.contactStatus,
          // Stage fields
          sId: stages.id,
          sName: stages.name,
          sSlug: stages.slug,
          sColor: stages.color,
          sDisplayOrder: stages.displayOrder,
        })
        .from(deals)
        .leftJoin(contacts, eq(deals.contactId, contacts.id))
        .leftJoin(stages, eq(deals.stageId, stages.id))
        .where(whereClause)
        .orderBy(sql`${deals.createdAt} DESC`)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(deals)
        .leftJoin(contacts, eq(deals.contactId, contacts.id))
        .leftJoin(stages, eq(deals.stageId, stages.id))
        .where(whereClause),
    ]);

    // Map to snake_case with nested objects for API compatibility
    const mappedDeals = dealRows.map((d) => ({
      id: d.id,
      name: d.name,
      amount: d.amount,
      probability: d.probability,
      expected_close_date: d.expectedCloseDate,
      stage_id: d.stageId,
      contact_id: d.contactId,
      source: d.source,
      status: d.status,
      notes: d.notes,
      stage_entered_at: d.stageEnteredAt,
      meeting_booked_at: d.meetingBookedAt,
      won_at: d.wonAt,
      lost_at: d.lostAt,
      lost_reason: d.lostReason,
      created_at: d.createdAt,
      updated_at: d.updatedAt,
      contact: d.cId
        ? {
            id: d.cId,
            first_name: d.cFirstName,
            last_name: d.cLastName,
            email: d.cEmail,
            contact_status: d.cContactStatus,
          }
        : null,
      stage: d.sId
        ? {
            id: d.sId,
            name: d.sName,
            slug: d.sSlug,
            color: d.sColor,
            display_order: d.sDisplayOrder,
          }
        : null,
    }));

    return {
      deals: mappedDeals,
      total: countResult[0]?.count ?? 0,
      page,
      limit,
    };
  } catch (err) {
    logger.error("Error fetching deals:", err);
    throw new CrmError("Failed to fetch deals", 500);
  }
}

/**
 * Get a single deal by ID with stage history
 */
export async function getDeal(id: string): Promise<DealDetailResult> {
  try {
    const [dealRow] = await db
      .select({
        id: deals.id,
        name: deals.name,
        amount: deals.amount,
        probability: deals.probability,
        expectedCloseDate: deals.expectedCloseDate,
        stageId: deals.stageId,
        contactId: deals.contactId,
        source: deals.source,
        status: deals.status,
        notes: deals.notes,
        stageEnteredAt: deals.stageEnteredAt,
        meetingBookedAt: deals.meetingBookedAt,
        wonAt: deals.wonAt,
        lostAt: deals.lostAt,
        lostReason: deals.lostReason,
        createdAt: deals.createdAt,
        updatedAt: deals.updatedAt,
        // Contact fields
        cId: contacts.id,
        cFirstName: contacts.firstName,
        cLastName: contacts.lastName,
        cEmail: contacts.email,
        cPhone: contacts.phone,
        cContactStatus: contacts.contactStatus,
        cSource: contacts.source,
        // Stage fields
        sId: stages.id,
        sName: stages.name,
        sSlug: stages.slug,
        sColor: stages.color,
        sDisplayOrder: stages.displayOrder,
      })
      .from(deals)
      .leftJoin(contacts, eq(deals.contactId, contacts.id))
      .leftJoin(stages, eq(deals.stageId, stages.id))
      .where(eq(deals.id, id))
      .limit(1);

    if (!dealRow) {
      throw new CrmError("Deal not found", 404);
    }

    // Map deal to snake_case with nested objects
    const deal = {
      id: dealRow.id,
      name: dealRow.name,
      amount: dealRow.amount,
      probability: dealRow.probability,
      expected_close_date: dealRow.expectedCloseDate,
      stage_id: dealRow.stageId,
      contact_id: dealRow.contactId,
      source: dealRow.source,
      status: dealRow.status,
      notes: dealRow.notes,
      stage_entered_at: dealRow.stageEnteredAt,
      meeting_booked_at: dealRow.meetingBookedAt,
      won_at: dealRow.wonAt,
      lost_at: dealRow.lostAt,
      lost_reason: dealRow.lostReason,
      created_at: dealRow.createdAt,
      updated_at: dealRow.updatedAt,
      contact: dealRow.cId
        ? {
            id: dealRow.cId,
            first_name: dealRow.cFirstName,
            last_name: dealRow.cLastName,
            email: dealRow.cEmail,
            phone: dealRow.cPhone,
            contact_status: dealRow.cContactStatus,
            source: dealRow.cSource,
          }
        : null,
      stage: dealRow.sId
        ? {
            id: dealRow.sId,
            name: dealRow.sName,
            slug: dealRow.sSlug,
            color: dealRow.sColor,
            display_order: dealRow.sDisplayOrder,
          }
        : null,
    };

    // Get stage history with from_stage and to_stage aliases
    const fromStage = alias(stages, "from_stage");
    const toStage = alias(stages, "to_stage");

    const historyRows = await db
      .select({
        id: dealStageHistory.id,
        dealId: dealStageHistory.dealId,
        fromStageId: dealStageHistory.fromStageId,
        toStageId: dealStageHistory.toStageId,
        changedBy: dealStageHistory.changedBy,
        changedAt: dealStageHistory.changedAt,
        automated: dealStageHistory.automated,
        notes: dealStageHistory.notes,
        triggerSource: dealStageHistory.triggerSource,
        // from_stage fields
        fsId: fromStage.id,
        fsName: fromStage.name,
        fsSlug: fromStage.slug,
        // to_stage fields
        tsId: toStage.id,
        tsName: toStage.name,
        tsSlug: toStage.slug,
      })
      .from(dealStageHistory)
      .leftJoin(fromStage, eq(dealStageHistory.fromStageId, fromStage.id))
      .leftJoin(toStage, eq(dealStageHistory.toStageId, toStage.id))
      .where(eq(dealStageHistory.dealId, id))
      .orderBy(sql`${dealStageHistory.changedAt} DESC`);

    const history = historyRows.map((h) => ({
      id: h.id,
      deal_id: h.dealId,
      from_stage_id: h.fromStageId,
      to_stage_id: h.toStageId,
      changed_by: h.changedBy,
      changed_at: h.changedAt,
      automated: h.automated,
      notes: h.notes,
      trigger_source: h.triggerSource,
      from_stage: h.fsId ? { id: h.fsId, name: h.fsName, slug: h.fsSlug } : null,
      to_stage: h.tsId ? { id: h.tsId, name: h.tsName, slug: h.tsSlug } : null,
    }));

    return {
      deal,
      history,
    };
  } catch (err) {
    if (err instanceof CrmError) throw err;
    logger.error("Error fetching deal:", err);
    throw new CrmError("Deal not found", 404);
  }
}

/**
 * Update a deal by ID with stage validation and history tracking
 */
export async function updateDeal(
  id: string,
  data: DealUpdateData,
  userId: string,
): Promise<{ deal: Record<string, unknown> }> {
  // Get current deal with stage pipeline info
  const [currentDeal] = await db
    .select({
      stageId: deals.stageId,
      sId: stages.id,
      sName: stages.name,
      sPipelineId: stages.pipelineId,
    })
    .from(deals)
    .leftJoin(stages, eq(deals.stageId, stages.id))
    .where(eq(deals.id, id))
    .limit(1);

  if (!currentDeal) {
    throw new CrmError("Deal not found", 404);
  }

  // If stage is being updated, validate it belongs to the same pipeline
  if (data.stage_id && data.stage_id !== currentDeal.stageId) {
    const [newStage] = await db
      .select({ pipelineId: stages.pipelineId })
      .from(stages)
      .where(eq(stages.id, data.stage_id))
      .limit(1);

    if (!newStage) {
      throw new CrmError("Invalid stage ID", 400);
    }

    // Validate that new stage belongs to the same pipeline as current stage
    if (currentDeal.sPipelineId && newStage.pipelineId !== currentDeal.sPipelineId) {
      throw new CrmError("Cannot move deal to a stage in a different pipeline", 400);
    }
  }

  // Prepare update data — map snake_case input to camelCase Drizzle columns
  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    updatedAt: now,
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.amount !== undefined) updateData.amount = data.amount;
  if (data.probability !== undefined) updateData.probability = data.probability;
  if (data.expected_close_date !== undefined)
    updateData.expectedCloseDate = data.expected_close_date;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.stage_id !== undefined) updateData.stageId = data.stage_id;

  // If stage is being updated, add stageEnteredAt
  if (data.stage_id && data.stage_id !== currentDeal.stageId) {
    updateData.stageEnteredAt = now;
  }

  // Update deal
  try {
    const [updatedRow] = await db
      .update(deals)
      .set(updateData as typeof deals.$inferInsert)
      .where(eq(deals.id, id))
      .returning();

    if (!updatedRow) {
      throw new CrmError("Failed to update deal", 500);
    }

    // Fetch the updated deal with contact and stage info for the response
    const [fullDeal] = await db
      .select({
        id: deals.id,
        name: deals.name,
        amount: deals.amount,
        probability: deals.probability,
        expectedCloseDate: deals.expectedCloseDate,
        stageId: deals.stageId,
        contactId: deals.contactId,
        source: deals.source,
        status: deals.status,
        notes: deals.notes,
        stageEnteredAt: deals.stageEnteredAt,
        meetingBookedAt: deals.meetingBookedAt,
        wonAt: deals.wonAt,
        lostAt: deals.lostAt,
        lostReason: deals.lostReason,
        createdAt: deals.createdAt,
        updatedAt: deals.updatedAt,
        // Contact fields
        cId: contacts.id,
        cFirstName: contacts.firstName,
        cLastName: contacts.lastName,
        cEmail: contacts.email,
        cPhone: contacts.phone,
        cContactStatus: contacts.contactStatus,
        cSource: contacts.source,
        // Stage fields
        sId: stages.id,
        sName: stages.name,
        sSlug: stages.slug,
        sColor: stages.color,
        sDisplayOrder: stages.displayOrder,
      })
      .from(deals)
      .leftJoin(contacts, eq(deals.contactId, contacts.id))
      .leftJoin(stages, eq(deals.stageId, stages.id))
      .where(eq(deals.id, id))
      .limit(1);

    if (!fullDeal) {
      // Deal was deleted concurrently between UPDATE and re-fetch
      throw new CrmError("Deal not found", 404);
    }

    const updatedDeal = {
      id: fullDeal.id,
      name: fullDeal.name,
      amount: fullDeal.amount,
      probability: fullDeal.probability,
      expected_close_date: fullDeal.expectedCloseDate,
      stage_id: fullDeal.stageId,
      contact_id: fullDeal.contactId,
      source: fullDeal.source,
      status: fullDeal.status,
      notes: fullDeal.notes,
      stage_entered_at: fullDeal.stageEnteredAt,
      meeting_booked_at: fullDeal.meetingBookedAt,
      won_at: fullDeal.wonAt,
      lost_at: fullDeal.lostAt,
      lost_reason: fullDeal.lostReason,
      created_at: fullDeal.createdAt,
      updated_at: fullDeal.updatedAt,
      contact: fullDeal.cId
        ? {
            id: fullDeal.cId,
            first_name: fullDeal.cFirstName,
            last_name: fullDeal.cLastName,
            email: fullDeal.cEmail,
            phone: fullDeal.cPhone,
            contact_status: fullDeal.cContactStatus,
            source: fullDeal.cSource,
          }
        : null,
      stage: fullDeal.sId
        ? {
            id: fullDeal.sId,
            name: fullDeal.sName,
            slug: fullDeal.sSlug,
            color: fullDeal.sColor,
            display_order: fullDeal.sDisplayOrder,
          }
        : null,
    };

    // Create stage history if stage changed
    if (data.stage_id && data.stage_id !== currentDeal.stageId) {
      try {
        await db.insert(dealStageHistory).values({
          dealId: id,
          fromStageId: currentDeal.stageId,
          toStageId: data.stage_id,
          changedBy: userId,
          automated: false,
          changedAt: now,
        });
      } catch (historyErr) {
        logger.error("Error creating stage history:", historyErr);
        throw new CrmError("Failed to create stage history", 500);
      }
    }

    // Write timeline event for stage change
    if (data.stage_id && data.stage_id !== currentDeal.stageId && fullDeal.contactId) {
      const toStageName = updatedDeal.stage?.name ?? "Unknown";
      const fromStageName = currentDeal.sName ?? "Unknown";

      void writeTimelineEvent({
        contactId: fullDeal.contactId,
        eventType: "stage_changed",
        title: `Deal moved from ${fromStageName} → ${toStageName}`,
        metadata: {
          deal_id: id,
          deal_name: fullDeal.name,
          from_stage: fromStageName,
          to_stage: toStageName,
        },
        stageId: data.stage_id,
        oldStageId: currentDeal.stageId,
      });
    }

    return { deal: updatedDeal };
  } catch (err) {
    if (err instanceof CrmError) throw err;
    logger.error("Error updating deal:", err);
    throw new CrmError("Failed to update deal", 500);
  }
}

/**
 * Create a deal manually (from the admin UI). Looks up the stage by slug
 * within the given pipeline, verifies the contact exists, inserts the deal,
 * writes a `deal_created` timeline event against the contact, and returns the
 * new deal id. Throws CrmError(404) for unknown pipeline/stage/contact and
 * CrmError(500) for DB failures.
 */
export interface CreateDealInput {
  name: string;
  contactId: string;
  stageSlug: string;
  pipelineSlug?: string;
  amount?: number | null;
  probability?: number | null;
  source?: string;
  notes?: string | null;
  expectedCloseDate?: string | null;
}

export async function createDeal(input: CreateDealInput): Promise<{ id: string; stageId: string }> {
  const pipelineSlug = input.pipelineSlug ?? "sales-pipeline";
  const source = input.source ?? "manual";

  // 1. Resolve pipeline
  const [pipeline] = await db
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(eq(pipelines.slug, pipelineSlug))
    .limit(1);
  if (!pipeline) {
    throw new CrmError(`Pipeline not found: ${pipelineSlug}`, 404);
  }

  // 2. Resolve stage within that pipeline (slug is only unique per-pipeline
  //    in practice, so we filter by both for safety)
  const [stage] = await db
    .select({ id: stages.id })
    .from(stages)
    .where(and(eq(stages.slug, input.stageSlug), eq(stages.pipelineId, pipeline.id)))
    .limit(1);
  if (!stage) {
    throw new CrmError(`Stage not found in pipeline: ${input.stageSlug}`, 404);
  }

  // 3. Verify contact exists (FK is NOT NULL — let the DB fail otherwise
  //    but a friendly 404 is nicer for the dialog)
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.id, input.contactId))
    .limit(1);
  if (!contact) {
    throw new CrmError("Contact not found", 404);
  }

  // 4. Insert the deal
  const now = new Date().toISOString();
  let inserted: { id: string } | undefined;
  try {
    [inserted] = await db
      .insert(deals)
      .values({
        name: input.name.trim(),
        contactId: input.contactId,
        stageId: stage.id,
        source,
        amount: input.amount ?? null,
        probability: input.probability ?? null,
        notes: input.notes ?? null,
        expectedCloseDate: input.expectedCloseDate ?? null,
        status: "open",
        createdAt: now,
        updatedAt: now,
        stageEnteredAt: now,
      })
      .returning({ id: deals.id });
  } catch (err) {
    logger.error("Failed to insert deal:", err);
    throw new CrmError("Failed to create deal", 500);
  }
  if (!inserted) {
    throw new CrmError("Failed to create deal", 500);
  }

  // 5. Timeline event (non-throwing — failure logs but doesn't roll back
  //    the deal insert)
  await writeTimelineEvent({
    contactId: input.contactId,
    eventType: "deal_created",
    title: `Deal created: ${input.name.trim()}`,
    metadata: {
      dealId: inserted.id,
      pipelineSlug,
      stageSlug: input.stageSlug,
      source,
      amount: input.amount ?? null,
    },
    pipelineId: pipeline.id,
    stageId: stage.id,
  });

  return { id: inserted.id, stageId: stage.id };
}

/**
 * Delete a deal by ID with stage history cleanup
 */
export async function deleteDeal(id: string): Promise<{ message: string }> {
  // Verify deal exists
  const [deal] = await db.select({ id: deals.id }).from(deals).where(eq(deals.id, id)).limit(1);

  if (!deal) {
    throw new CrmError("Deal not found", 404);
  }

  // Delete stage history first
  try {
    await db.delete(dealStageHistory).where(eq(dealStageHistory.dealId, id));
  } catch (err) {
    logger.error("Error deleting stage history:", err);
    throw new CrmError("Failed to delete stage history", 500);
  }

  // Null out FK from outreach_replies (constraint is NO ACTION, would block delete)
  try {
    await db
      .update(outreachReplies)
      .set({ crmDealId: null })
      .where(eq(outreachReplies.crmDealId, id));
  } catch (err) {
    logger.error("Error clearing outreach_replies.crm_deal_id:", err);
    throw new CrmError("Failed to detach outreach replies", 500);
  }

  // Delete deal
  try {
    await db.delete(deals).where(eq(deals.id, id));
  } catch (err) {
    logger.error("Error deleting deal:", err);
    throw new CrmError("Failed to delete deal", 500);
  }

  return { message: "Deal deleted successfully" };
}

/**
 * Move a deal to a new stage with pipeline validation and history tracking
 */
export async function moveDeal(
  params: MoveDealParams,
): Promise<{ deal: Record<string, unknown>; message: string }> {
  const { dealId, stageId, userId } = params;

  // Get current deal with stage pipeline info
  const [currentDeal] = await db
    .select({
      stageId: deals.stageId,
      name: deals.name,
      sId: stages.id,
      sName: stages.name,
      sPipelineId: stages.pipelineId,
    })
    .from(deals)
    .leftJoin(stages, eq(deals.stageId, stages.id))
    .where(eq(deals.id, dealId))
    .limit(1);

  if (!currentDeal) {
    throw new CrmError("Deal not found", 404);
  }

  // Verify new stage exists and belongs to the same pipeline
  const [newStage] = await db
    .select({ id: stages.id, pipelineId: stages.pipelineId })
    .from(stages)
    .where(eq(stages.id, stageId))
    .limit(1);

  if (!newStage) {
    throw new CrmError("Invalid stage ID", 400);
  }

  // Validate that new stage belongs to the same pipeline as current stage
  if (currentDeal.sPipelineId && newStage.pipelineId !== currentDeal.sPipelineId) {
    throw new CrmError("Cannot move deal to a stage in a different pipeline", 400);
  }

  const now = new Date().toISOString();

  // Update deal stage
  try {
    await db
      .update(deals)
      .set({
        stageId: stageId,
        stageEnteredAt: now,
        updatedAt: now,
      })
      .where(eq(deals.id, dealId));
  } catch (err) {
    logger.error("Error updating deal:", err);
    throw new CrmError("Failed to update deal", 500);
  }

  // Fetch the updated deal with contact and stage info
  const [fullDeal] = await db
    .select({
      id: deals.id,
      name: deals.name,
      amount: deals.amount,
      probability: deals.probability,
      expectedCloseDate: deals.expectedCloseDate,
      stageId: deals.stageId,
      contactId: deals.contactId,
      source: deals.source,
      status: deals.status,
      notes: deals.notes,
      stageEnteredAt: deals.stageEnteredAt,
      meetingBookedAt: deals.meetingBookedAt,
      wonAt: deals.wonAt,
      lostAt: deals.lostAt,
      lostReason: deals.lostReason,
      createdAt: deals.createdAt,
      updatedAt: deals.updatedAt,
      // Contact fields
      cId: contacts.id,
      cFirstName: contacts.firstName,
      cLastName: contacts.lastName,
      cEmail: contacts.email,
      cContactStatus: contacts.contactStatus,
      // Stage fields
      sId: stages.id,
      sName: stages.name,
      sSlug: stages.slug,
      sColor: stages.color,
      sDisplayOrder: stages.displayOrder,
    })
    .from(deals)
    .leftJoin(contacts, eq(deals.contactId, contacts.id))
    .leftJoin(stages, eq(deals.stageId, stages.id))
    .where(eq(deals.id, dealId))
    .limit(1);

  if (!fullDeal) {
    // Deal was deleted concurrently between UPDATE and re-fetch
    throw new CrmError("Deal not found", 404);
  }

  const updatedDeal = {
    id: fullDeal.id,
    name: fullDeal.name,
    amount: fullDeal.amount,
    probability: fullDeal.probability,
    expected_close_date: fullDeal.expectedCloseDate,
    stage_id: fullDeal.stageId,
    contact_id: fullDeal.contactId,
    source: fullDeal.source,
    status: fullDeal.status,
    notes: fullDeal.notes,
    stage_entered_at: fullDeal.stageEnteredAt,
    meeting_booked_at: fullDeal.meetingBookedAt,
    won_at: fullDeal.wonAt,
    lost_at: fullDeal.lostAt,
    lost_reason: fullDeal.lostReason,
    created_at: fullDeal.createdAt,
    updated_at: fullDeal.updatedAt,
    contact: fullDeal.cId
      ? {
          id: fullDeal.cId,
          first_name: fullDeal.cFirstName,
          last_name: fullDeal.cLastName,
          email: fullDeal.cEmail,
          contact_status: fullDeal.cContactStatus,
        }
      : null,
    stage: fullDeal.sId
      ? {
          id: fullDeal.sId,
          name: fullDeal.sName,
          slug: fullDeal.sSlug,
          color: fullDeal.sColor,
          display_order: fullDeal.sDisplayOrder,
        }
      : null,
  };

  // Create stage history entry
  try {
    await db.insert(dealStageHistory).values({
      dealId: dealId,
      fromStageId: currentDeal.stageId,
      toStageId: stageId,
      changedBy: userId,
      automated: false,
      changedAt: now,
    });
  } catch (historyErr) {
    logger.warn("Failed to create stage history entry (deal move already committed):", historyErr, {
      deal_id: dealId,
      from_stage_id: currentDeal.stageId,
      to_stage_id: stageId,
    });
  }

  // Write timeline event for stage change
  if (fullDeal.contactId) {
    const toStageName = updatedDeal.stage?.name ?? "Unknown";
    const fromStageName = currentDeal.sName ?? "Unknown";

    void writeTimelineEvent({
      contactId: fullDeal.contactId,
      eventType: "stage_changed",
      title: `Deal moved from ${fromStageName} → ${toStageName}`,
      metadata: {
        deal_id: dealId,
        deal_name: fullDeal.name,
        from_stage: fromStageName,
        to_stage: toStageName,
      },
      stageId: stageId,
      oldStageId: currentDeal.stageId,
    });
  }

  return {
    deal: updatedDeal,
    message: "Deal moved successfully",
  };
}

/**
 * Bulk update deals (stage transitions with history tracking)
 */
export async function bulkUpdateDeals(
  params: BulkUpdateDealsParams,
): Promise<BulkUpdateDealsResult> {
  const { deal_ids, updates, userId } = params;

  // Verify all deals exist and get current state FIRST (fix race condition)
  const existingDeals = await db
    .select({ id: deals.id, stageId: deals.stageId, contactId: deals.contactId })
    .from(deals)
    .where(inArray(deals.id, deal_ids));

  if (!existingDeals || existingDeals.length !== deal_ids.length) {
    throw new CrmError("Some deals not found", 404);
  }

  // If updating stage, get stage ID from slug
  let updateData: Record<string, unknown> = {};
  let newStageId: string | null = null;

  if (updates.stage_slug) {
    const [stage] = await db
      .select({ id: stages.id })
      .from(stages)
      .where(eq(stages.slug, updates.stage_slug))
      .limit(1);

    if (!stage) {
      throw new CrmError("Invalid stage", 400);
    }

    newStageId = stage.id;
    updateData = {
      stageId: stage.id,
      stageEnteredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } else {
    updateData.updatedAt = new Date().toISOString();
  }

  // Update deals
  try {
    const updatedRows = await db
      .update(deals)
      .set(updateData as typeof deals.$inferInsert)
      .where(inArray(deals.id, deal_ids))
      .returning();

    // If stage was updated, create history entries
    if (newStageId) {
      const historyEntries = existingDeals.map((deal) => ({
        dealId: deal.id,
        fromStageId: deal.stageId,
        toStageId: newStageId!,
        changedBy: userId,
        automated: false,
        changedAt: new Date().toISOString(),
      }));

      try {
        await db.insert(dealStageHistory).values(historyEntries);
      } catch (historyErr) {
        logger.error("Error creating stage history:", historyErr);
        throw new CrmError("Failed to create stage history", 500);
      }

      // Write timeline events for stage changes
      if (updatedRows.length > 0) {
        const fromStageIds = [...new Set(existingDeals.map((d) => d.stageId))];
        const fromStageRows = await db
          .select({ id: stages.id, name: stages.name })
          .from(stages)
          .where(inArray(stages.id, fromStageIds));
        const fromStageMap = new Map(fromStageRows.map((s) => [s.id, s.name]));

        const [toStageRow] = await db
          .select({ name: stages.name })
          .from(stages)
          .where(eq(stages.id, newStageId))
          .limit(1);
        const toStageName = toStageRow?.name ?? "Unknown";

        const timelineEvents = existingDeals
          .filter((deal) => {
            const updated = updatedRows.find((u) => u.id === deal.id);
            return updated && updated.contactId;
          })
          .map((deal) => {
            const updated = updatedRows.find((u) => u.id === deal.id)!;
            const fromStageName = fromStageMap.get(deal.stageId) ?? "Unknown";
            return {
              contactId: updated.contactId,
              eventType: "stage_changed" as const,
              title: `Deal moved from ${fromStageName} → ${toStageName}`,
              metadata: {
                deal_id: deal.id,
                from_stage: fromStageName,
                to_stage: toStageName,
              },
              stageId: newStageId!,
              oldStageId: deal.stageId,
            };
          });

        if (timelineEvents.length > 0) {
          void writeTimelineEvents(timelineEvents);
        }
      }
    }

    // Map updated rows to snake_case for API compatibility
    const mappedDeals = updatedRows.map((d) => ({
      id: d.id,
      name: d.name,
      amount: d.amount,
      probability: d.probability,
      expected_close_date: d.expectedCloseDate,
      stage_id: d.stageId,
      contact_id: d.contactId,
      source: d.source,
      status: d.status,
      notes: d.notes,
      stage_entered_at: d.stageEnteredAt,
      meeting_booked_at: d.meetingBookedAt,
      won_at: d.wonAt,
      lost_at: d.lostAt,
      lost_reason: d.lostReason,
      created_at: d.createdAt,
      updated_at: d.updatedAt,
    }));

    return {
      updated: updatedRows.length,
      deals: mappedDeals,
    };
  } catch (err) {
    if (err instanceof CrmError) throw err;
    logger.error("Error updating deals:", err);
    throw new CrmError("Failed to update deals", 500);
  }
}

/**
 * Bulk delete deals with stage history cleanup
 */
export async function bulkDeleteDeals(dealIds: string[]): Promise<BulkDeleteDealsResult> {
  // Verify deals exist
  const existingDeals = await db
    .select({ id: deals.id })
    .from(deals)
    .where(inArray(deals.id, dealIds));

  if (!existingDeals || existingDeals.length === 0) {
    throw new CrmError("No deals found", 404);
  }

  // Delete stage history first (cascade)
  try {
    await db.delete(dealStageHistory).where(inArray(dealStageHistory.dealId, dealIds));
  } catch (err) {
    logger.error("Error deleting stage history:", err);
    throw new CrmError("Failed to delete stage history", 500);
  }

  // Null out FK from outreach_replies (constraint is NO ACTION, would block delete)
  try {
    await db
      .update(outreachReplies)
      .set({ crmDealId: null })
      .where(inArray(outreachReplies.crmDealId, dealIds));
  } catch (err) {
    logger.error("Error clearing outreach_replies.crm_deal_id:", err);
    throw new CrmError("Failed to detach outreach replies", 500);
  }

  // Delete deals
  try {
    await db.delete(deals).where(inArray(deals.id, dealIds));
  } catch (err) {
    logger.error("Error deleting deals:", err);
    throw new CrmError("Failed to delete deals", 500);
  }

  return {
    deleted: existingDeals.length,
    message: `Successfully deleted ${existingDeals.length} deals`,
  };
}

/**
 * Get pipeline deals grouped by stage
 */
export async function getPipelineDeals(
  pipelineSlug: string = "sales-pipeline",
): Promise<PipelineDealsResult> {
  // Get pipeline ID from slug
  const [pipeline] = await db
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(eq(pipelines.slug, pipelineSlug))
    .limit(1);

  if (!pipeline) {
    throw new CrmError("Pipeline not found", 404);
  }

  // Get all stages for this pipeline
  const stageRows = await db
    .select()
    .from(stages)
    .where(eq(stages.pipelineId, pipeline.id))
    .orderBy(sql`${stages.displayOrder} ASC`);

  // Get all deals with contact info (filtered to this pipeline's stages)
  const stageIds = stageRows.map((s) => s.id);

  if (stageIds.length === 0) {
    return {
      stages: [],
      dealsByStage: {},
      totalDeals: 0,
    };
  }

  const dealRows = await db
    .select({
      id: deals.id,
      name: deals.name,
      amount: deals.amount,
      probability: deals.probability,
      expectedCloseDate: deals.expectedCloseDate,
      stageId: deals.stageId,
      contactId: deals.contactId,
      source: deals.source,
      status: deals.status,
      notes: deals.notes,
      stageEnteredAt: deals.stageEnteredAt,
      meetingBookedAt: deals.meetingBookedAt,
      wonAt: deals.wonAt,
      lostAt: deals.lostAt,
      lostReason: deals.lostReason,
      createdAt: deals.createdAt,
      updatedAt: deals.updatedAt,
      // Contact fields
      cId: contacts.id,
      cFirstName: contacts.firstName,
      cLastName: contacts.lastName,
      cEmail: contacts.email,
      cContactStatus: contacts.contactStatus,
      // Stage fields
      sId: stages.id,
      sName: stages.name,
      sSlug: stages.slug,
      sColor: stages.color,
      sDisplayOrder: stages.displayOrder,
    })
    .from(deals)
    .leftJoin(contacts, eq(deals.contactId, contacts.id))
    .leftJoin(stages, eq(deals.stageId, stages.id))
    .where(inArray(deals.stageId, stageIds))
    .orderBy(sql`${deals.createdAt} DESC`);

  // Map stages to snake_case for API compatibility
  const mappedStages = stageRows.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    color: s.color,
    description: s.description,
    display_order: s.displayOrder,
    is_terminal: s.isTerminal,
    is_positive: s.isPositive,
    pipeline_id: s.pipelineId,
    created_at: s.createdAt,
  }));

  // Map deals to snake_case with nested objects
  const mappedDeals = dealRows.map((d) => ({
    id: d.id,
    name: d.name,
    amount: d.amount,
    probability: d.probability,
    expected_close_date: d.expectedCloseDate,
    stage_id: d.stageId,
    contact_id: d.contactId,
    source: d.source,
    status: d.status,
    notes: d.notes,
    stage_entered_at: d.stageEnteredAt,
    meeting_booked_at: d.meetingBookedAt,
    won_at: d.wonAt,
    lost_at: d.lostAt,
    lost_reason: d.lostReason,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
    contact: d.cId
      ? {
          id: d.cId,
          first_name: d.cFirstName,
          last_name: d.cLastName,
          email: d.cEmail,
          contact_status: d.cContactStatus,
        }
      : null,
    stage: d.sId
      ? {
          id: d.sId,
          name: d.sName,
          slug: d.sSlug,
          color: d.sColor,
          display_order: d.sDisplayOrder,
        }
      : null,
  }));

  // Group deals by stage
  const dealsByStage: Record<string, Record<string, unknown>[]> = {};

  // Initialize all stages with empty arrays
  stageRows.forEach((stage) => {
    dealsByStage[stage.slug] = [];
  });

  // Populate deals into their stages
  mappedDeals.forEach((deal) => {
    if (deal.stage?.slug && dealsByStage[deal.stage.slug]) {
      dealsByStage[deal.stage.slug].push(deal);
    }
  });

  return {
    stages: mappedStages,
    dealsByStage,
    totalDeals: mappedDeals.length,
  };
}
