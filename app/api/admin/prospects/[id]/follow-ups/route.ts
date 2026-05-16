/**
 * POST /api/admin/prospects/[id]/follow-ups
 *
 * Create a manual follow-up reminder from the prospect cockpit. Mirrors the
 * AI-extraction insert in `lib/prospects/jobs/process-quo-call.ts`:
 *   1. Insert the `prospect_follow_ups` row (source = 'manual').
 *   2. Schedule a pg-boss reminder via `enqueueProspectFollowUp` so the
 *      worker fires a notification at `dueAt`.
 *   3. Patch the row with the pg-boss job id so the PATCH/DELETE route
 *      under `./[followUpId]/` can cancel it cleanly.
 *   4. Write a `follow_up_scheduled` timeline event on the prospect.
 *
 * Auth: NextAuth session required.
 * CSRF: enforced by the global middleware via Origin / Referer check.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { writeTimelineEvent } from "@/lib/crm/timeline";
import { db } from "@/lib/db";
import { prospectFollowUps, prospects } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { enqueueProspectFollowUp } from "@/lib/queue";

type RouteParams = { id: string };

const bodySchema = z
  .object({
    /** ISO-8601 timestamp for the reminder. */
    dueAt: z.string().datetime(),
    reason: z.string().trim().max(500).optional().nullable(),
  })
  .strip();

export async function POST(
  request: NextRequest,
  context: { params: Promise<RouteParams> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const [prospect] = await db
    .select({ id: prospects.id, businessName: prospects.businessName })
    .from(prospects)
    .where(eq(prospects.id, id))
    .limit(1);

  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  const { dueAt, reason } = parsed.data;

  try {
    const [followUp] = await db
      .insert(prospectFollowUps)
      .values({
        prospectId: id,
        dueAt,
        reason: reason ?? null,
        source: "manual",
        status: "pending",
      })
      .returning();

    if (!followUp) {
      return NextResponse.json({ error: "Insert returned no row" }, { status: 500 });
    }

    let jobId: string | null = null;
    try {
      jobId = await enqueueProspectFollowUp({ followUpId: followUp.id }, { dueAt });
      if (jobId) {
        await db
          .update(prospectFollowUps)
          .set({ pgbossJobId: jobId })
          .where(eq(prospectFollowUps.id, followUp.id));
      }
    } catch (err) {
      // Non-fatal: the DB row stands and an admin can re-snooze to retry.
      logger.error("[prospects/follow-ups POST] failed to enqueue reminder", {
        prospectId: id,
        followUpId: followUp.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    void writeTimelineEvent({
      prospectId: id,
      eventType: "follow_up_scheduled",
      title: reason
        ? `Follow-up scheduled: ${reason}`
        : `Follow-up scheduled for ${prospect.businessName}`,
      metadata: {
        source: "manual",
        followUpId: followUp.id,
        dueAt,
        scheduledBy: session.user.id,
      },
    });

    return NextResponse.json(
      { followUp: { ...followUp, pgbossJobId: jobId ?? followUp.pgbossJobId } },
      { status: 201 },
    );
  } catch (err) {
    logger.error("[prospects/follow-ups POST] failed", {
      prospectId: id,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to create follow-up" }, { status: 500 });
  }
}
