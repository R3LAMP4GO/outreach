/**
 * PATCH / DELETE /api/admin/prospects/[id]/follow-ups/[followUpId]
 *
 * Admin actions on a single `prospect_follow_ups` row.
 *
 * Auth: NextAuth session required (mirrors `/api/admin/prospects/import`).
 * CSRF: enforced by the global middleware via Origin / Referer check
 *       (see `outreach/middleware.ts` \u2014 every state-changing /api/* request
 *       runs through that gate, no per-route work needed).
 *
 * PATCH body \u2014 `{ status, newDueAt? }`:
 *   - `completed` \u2192 sets `completedAt = now()`, status unchanged downstream
 *     (the row stays visible in history); cancels the pending pg-boss job
 *     so the reminder doesn't fire after the user already closed it.
 *   - `cancelled` \u2192 cancels the pg-boss job; status reflects intent.
 *   - `snoozed`   \u2192 requires `newDueAt`; cancels the old job, enqueues a
 *     fresh one for the new date, and updates `dueAt` + `pgbossJobId`.
 *
 * DELETE \u2192 cancels the pg-boss job then deletes the row.
 *
 * pg-boss cancel failures are non-fatal: the DB row is the source of truth,
 * and the fire handler short-circuits on non-pending status anyway. See
 * `cancelProspectFollowUp` in `lib/queue/index.ts`.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { prospectFollowUps } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { cancelProspectFollowUp, enqueueProspectFollowUp } from "@/lib/queue";

type RouteParams = { id: string; followUpId: string };

const patchBodySchema = z
  .object({
    status: z.enum(["completed", "snoozed", "cancelled"]),
    // ISO-8601 timestamp. Required iff status === 'snoozed'.
    newDueAt: z.string().datetime().optional(),
  })
  .refine((v) => v.status !== "snoozed" || typeof v.newDueAt === "string", {
    message: "newDueAt is required when status is 'snoozed'",
    path: ["newDueAt"],
  });

async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true as const, session };
}

async function loadFollowUp(prospectId: string, followUpId: string) {
  const [row] = await db
    .select({
      id: prospectFollowUps.id,
      prospectId: prospectFollowUps.prospectId,
      status: prospectFollowUps.status,
      pgbossJobId: prospectFollowUps.pgbossJobId,
    })
    .from(prospectFollowUps)
    .where(and(eq(prospectFollowUps.id, followUpId), eq(prospectFollowUps.prospectId, prospectId)))
    .limit(1);
  return row ?? null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<RouteParams> },
): Promise<NextResponse> {
  const gate = await requireSession();
  if (!gate.ok) return gate.response;

  const { id: prospectId, followUpId } = await context.params;
  if (!prospectId || !followUpId) {
    return NextResponse.json({ error: "prospectId and followUpId are required" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const followUp = await loadFollowUp(prospectId, followUpId);
  if (!followUp) {
    return NextResponse.json({ error: "Follow-up not found" }, { status: 404 });
  }

  const { status, newDueAt } = parsed.data;
  const nowIso = new Date().toISOString();

  try {
    if (status === "completed") {
      // Cancel any pending reminder so the user isn't pinged for something
      // they already closed; row stays in the DB for history.
      if (followUp.pgbossJobId) {
        await cancelProspectFollowUp(followUp.pgbossJobId);
      }
      const [updated] = await db
        .update(prospectFollowUps)
        .set({
          status: "completed",
          completedAt: nowIso,
          // Clear the job id once cancelled \u2014 nothing left to cancel later.
          pgbossJobId: null,
        })
        .where(eq(prospectFollowUps.id, followUp.id))
        .returning();
      return NextResponse.json({ followUp: updated });
    }

    if (status === "cancelled") {
      if (followUp.pgbossJobId) {
        await cancelProspectFollowUp(followUp.pgbossJobId);
      }
      const [updated] = await db
        .update(prospectFollowUps)
        .set({
          status: "cancelled",
          pgbossJobId: null,
        })
        .where(eq(prospectFollowUps.id, followUp.id))
        .returning();
      return NextResponse.json({ followUp: updated });
    }

    // status === 'snoozed'
    if (!newDueAt) {
      // Belt-and-braces \u2014 zod refine already guards this.
      return NextResponse.json(
        { error: "newDueAt is required when status is 'snoozed'" },
        { status: 400 },
      );
    }

    if (followUp.pgbossJobId) {
      await cancelProspectFollowUp(followUp.pgbossJobId);
    }

    let newJobId: string | null = null;
    try {
      newJobId = await enqueueProspectFollowUp({ followUpId: followUp.id }, { dueAt: newDueAt });
    } catch (err) {
      // Failure to enqueue the new job is non-fatal: the row update still
      // reflects the new dueAt and an admin can re-snooze. Log loudly.
      logger.error("[follow-ups PATCH] failed to enqueue snoozed reminder", {
        followUpId: followUp.id,
        newDueAt,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    const [updated] = await db
      .update(prospectFollowUps)
      .set({
        status: "snoozed",
        dueAt: newDueAt,
        pgbossJobId: newJobId,
      })
      .where(eq(prospectFollowUps.id, followUp.id))
      .returning();
    return NextResponse.json({ followUp: updated });
  } catch (err) {
    logger.error("[follow-ups PATCH] failed", {
      followUpId,
      prospectId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to update follow-up" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<RouteParams> },
): Promise<NextResponse> {
  const gate = await requireSession();
  if (!gate.ok) return gate.response;

  const { id: prospectId, followUpId } = await context.params;
  if (!prospectId || !followUpId) {
    return NextResponse.json({ error: "prospectId and followUpId are required" }, { status: 400 });
  }

  const followUp = await loadFollowUp(prospectId, followUpId);
  if (!followUp) {
    return NextResponse.json({ error: "Follow-up not found" }, { status: 404 });
  }

  try {
    if (followUp.pgbossJobId) {
      await cancelProspectFollowUp(followUp.pgbossJobId);
    }
    await db.delete(prospectFollowUps).where(eq(prospectFollowUps.id, followUp.id));
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[follow-ups DELETE] failed", {
      followUpId,
      prospectId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to delete follow-up" }, { status: 500 });
  }
}
