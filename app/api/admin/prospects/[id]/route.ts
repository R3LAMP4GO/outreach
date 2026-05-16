/**
 * PATCH /api/admin/prospects/[id]
 *
 * Generic admin update for a single prospect. Powers:
 *   - Inline edits from the header card (`businessName`, `address`,
 *     `city`, `state`, `industry`, `phone`, `website`, `notes`).
 *   - The Cap video URL field (`capVideoUrl` \u2014 we also derive
 *     `capVideoId` from the pasted URL via `extractCapVideoId`).
 *   - The "Mark called" action (`outreachStage = 'called'` + bumps
 *     `lastTouchedAt`). Writes a `call_made` timeline event.
 *   - Generic stage flips (`outreachStage`).
 *
 * Auth: NextAuth session required (mirrors `/api/admin/prospects/import`).
 * CSRF: enforced by the global middleware via Origin / Referer check.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { extractCapVideoId } from "@/lib/cap/client";
import { writeTimelineEvent } from "@/lib/crm/timeline";
import { db } from "@/lib/db";
import { prospects } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

type RouteParams = { id: string };

const ALLOWED_STAGES = [
  "new",
  "emailed",
  "called",
  "phone_captured",
  "email_captured",
  "booked",
  "promoted",
] as const;

const patchBodySchema = z
  .object({
    businessName: z.string().min(1).max(255).optional(),
    address: z.string().max(500).optional().nullable(),
    city: z.string().max(255).optional().nullable(),
    state: z.string().max(255).optional().nullable(),
    country: z.string().max(255).optional().nullable(),
    industry: z.string().max(255).optional().nullable(),
    phone: z.string().max(50).optional().nullable(),
    website: z.string().max(500).optional().nullable(),
    notes: z.string().max(10000).optional().nullable(),
    outreachStage: z.enum(ALLOWED_STAGES).optional(),
    capVideoUrl: z.string().max(500).optional().nullable(),
    /** When true: also bump `lastTouchedAt` and emit a `call_made` event. */
    markCalled: z.boolean().optional(),
  })
  .strip();

export async function PATCH(
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

  const [existing] = await db
    .select({
      id: prospects.id,
      businessName: prospects.businessName,
      outreachStage: prospects.outreachStage,
    })
    .from(prospects)
    .where(eq(prospects.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  const { markCalled, capVideoUrl, ...fields } = parsed.data;
  const updates: Partial<typeof prospects.$inferInsert> = {};

  // Strip empty strings -> null on optional text fields so the form's empty
  // input doesn't clobber a real DB value with "" instead of NULL.
  const stringFields = [
    "businessName",
    "address",
    "city",
    "state",
    "country",
    "industry",
    "phone",
    "website",
    "notes",
  ] as const;
  for (const field of stringFields) {
    if (field in fields) {
      const value = fields[field];
      if (value === undefined) continue;
      // businessName is NOT NULL \u2014 keep "" out, but don't null-coerce.
      if (field === "businessName") {
        if (typeof value === "string" && value.trim() !== "") {
          updates.businessName = value.trim();
        }
        continue;
      }
      updates[field] = value === "" ? null : value;
    }
  }

  if (parsed.data.outreachStage !== undefined) {
    updates.outreachStage = parsed.data.outreachStage;
  }

  if (capVideoUrl !== undefined) {
    if (capVideoUrl === null || capVideoUrl === "") {
      updates.capVideoUrl = null;
      updates.capVideoId = null;
    } else {
      const trimmed = capVideoUrl.trim();
      const videoId = extractCapVideoId(trimmed);
      if (!videoId) {
        return NextResponse.json(
          {
            error: "capVideoUrl is not a recognised Cap share URL (expected https://cap.so/s/<id>)",
          },
          { status: 400 },
        );
      }
      updates.capVideoUrl = trimmed;
      updates.capVideoId = videoId;
    }
  }

  const nowIso = new Date().toISOString();
  let didMarkCalled = false;

  if (markCalled) {
    updates.outreachStage = "called";
    updates.lastTouchedAt = nowIso;
    didMarkCalled = true;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ prospect: existing });
  }

  updates.updatedAt = nowIso;

  try {
    const [updated] = await db
      .update(prospects)
      .set(updates)
      .where(eq(prospects.id, id))
      .returning();

    if (didMarkCalled) {
      void writeTimelineEvent({
        prospectId: id,
        eventType: "call_made",
        title: `Marked called: ${updated?.businessName ?? existing.businessName}`,
        metadata: {
          source: "admin_action",
          markedBy: session.user.id,
        },
      });
    }

    return NextResponse.json({ prospect: updated });
  } catch (err) {
    logger.error("[prospects PATCH] failed", {
      prospectId: id,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to update prospect" }, { status: 500 });
  }
}
