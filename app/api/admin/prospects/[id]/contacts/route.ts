/**
 * POST /api/admin/prospects/[id]/contacts
 *
 * Manually add a person (contact) to a prospect from the cockpit's
 * "Employees" card. Used when the admin captures someone during a call /
 * email exchange but the call-extraction flow didn't catch them.
 *
 * If the request asks to mark the new contact primary, this clears any
 * existing `is_primary_contact = true` on the same prospect inside a single
 * transaction so the "only one primary" invariant holds.
 *
 * Auth: NextAuth session required.
 * CSRF: enforced by the global middleware via Origin / Referer check.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { writeTimelineEvent } from "@/lib/crm/timeline";
import { db } from "@/lib/db";
import { contacts, prospects } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

type RouteParams = { id: string };

const bodySchema = z
  .object({
    firstName: z.string().trim().max(255).optional().nullable(),
    lastName: z.string().trim().max(255).optional().nullable(),
    email: z.string().trim().email("Invalid email").max(255),
    phone: z.string().trim().max(50).optional().nullable(),
    roleAtCompany: z.string().trim().max(255).optional().nullable(),
    isPrimaryContact: z.boolean().optional(),
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

  const nowIso = new Date().toISOString();
  const data = parsed.data;
  const makePrimary = data.isPrimaryContact === true;

  try {
    const inserted = await db.transaction(async (tx) => {
      // If we're going to mark this new contact as the primary, demote any
      // existing primary for this prospect first so only one row carries
      // `is_primary_contact = true` at a time.
      if (makePrimary) {
        await tx
          .update(contacts)
          .set({ isPrimaryContact: false, updatedAt: nowIso })
          .where(and(eq(contacts.prospectId, id), eq(contacts.isPrimaryContact, true)));
      }

      const [row] = await tx
        .insert(contacts)
        .values({
          prospectId: id,
          firstName: data.firstName ?? null,
          lastName: data.lastName ?? null,
          email: data.email,
          phone: data.phone ?? null,
          roleAtCompany: data.roleAtCompany ?? null,
          isPrimaryContact: makePrimary,
          source: "manual",
          firstTouchDate: nowIso,
          lastTouchDate: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .returning();
      return row;
    });

    const fullName = [data.firstName, data.lastName].filter(Boolean).join(" ").trim();
    void writeTimelineEvent({
      prospectId: id,
      contactId: inserted?.id,
      eventType: "contact_created",
      title: `Person added: ${fullName || data.email}`,
      metadata: {
        source: "manual",
        addedBy: session.user.id,
        email: data.email,
      },
    });

    return NextResponse.json({ contact: inserted }, { status: 201 });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json(
        { error: "A contact with this email already exists" },
        { status: 409 },
      );
    }
    logger.error("[prospects/contacts POST] failed", {
      prospectId: id,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to add contact" }, { status: 500 });
  }
}
