/**
 * PATCH /api/admin/prospects/[id]/contacts/[contactId]
 *
 * Update a single contact attached to a prospect. Currently scoped to the
 * "primary contact" toggle from the cockpit's Employees card.
 *
 * When `isPrimaryContact = true` is sent, this clears any other primary on
 * the same prospect inside one transaction so the "only one primary" rule
 * holds.
 *
 * Auth: NextAuth session required.
 * CSRF: enforced by the global middleware via Origin / Referer check.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

type RouteParams = { id: string; contactId: string };

const bodySchema = z
  .object({
    isPrimaryContact: z.boolean().optional(),
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

  const { id: prospectId, contactId } = await context.params;
  if (!prospectId || !contactId) {
    return NextResponse.json({ error: "prospectId and contactId are required" }, { status: 400 });
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

  if (parsed.data.isPrimaryContact === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Belt-and-braces: ensure the contact actually belongs to this prospect so
  // a request swapping the URL params can't reach into someone else's data.
  const [existing] = await db
    .select({ id: contacts.id, prospectId: contacts.prospectId })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!existing || existing.prospectId !== prospectId) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const wantsPrimary = parsed.data.isPrimaryContact === true;

  try {
    const updated = await db.transaction(async (tx) => {
      if (wantsPrimary) {
        // Demote any other primary on this prospect.
        await tx
          .update(contacts)
          .set({ isPrimaryContact: false, updatedAt: nowIso })
          .where(
            and(
              eq(contacts.prospectId, prospectId),
              eq(contacts.isPrimaryContact, true),
              ne(contacts.id, contactId),
            ),
          );
      }

      const [row] = await tx
        .update(contacts)
        .set({ isPrimaryContact: wantsPrimary, updatedAt: nowIso })
        .where(eq(contacts.id, contactId))
        .returning();
      return row;
    });

    return NextResponse.json({ contact: updated });
  } catch (err) {
    logger.error("[prospects/contacts PATCH] failed", {
      prospectId,
      contactId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
  }
}
