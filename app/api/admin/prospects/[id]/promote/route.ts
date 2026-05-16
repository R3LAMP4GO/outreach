/**
 * POST /api/admin/prospects/[id]/promote
 *
 * Promote a prospect into the CRM sales pipeline.
 *
 * Requires an email-captured contact on the prospect \u2014 prefers the row
 * flagged `is_primary_contact = true`, falls back to any other contact with
 * an email if none is marked primary.
 *
 * On success:
 *   1. Flips `prospects.outreachStage` to `promoted` and bumps
 *      `lastTouchedAt`.
 *   2. Creates a `deals` row pointing at the chosen contact, parked on the
 *      "Lead" stage of the `sales-pipeline` (mirrors `lib/outreach/crm/push-to-crm.ts`,
 *      but lands at Lead because this is a fresh prospect, not a positive
 *      outreach reply).
 *   3. Writes a `contact_created` timeline event on the contact (so the CRM
 *      view picks the new origin) and a `prospect_promoted` event on the
 *      prospect.
 *
 * Auth: NextAuth session required.
 * CSRF: enforced by the global middleware via Origin / Referer check.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { writeTimelineEvent } from "@/lib/crm/timeline";
import { db } from "@/lib/db";
import { contacts, deals, pipelines, prospects, stages } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

type RouteParams = { id: string };

const PIPELINE_SLUG = "sales-pipeline";
const TARGET_STAGE_SLUG = "lead";

function buildDealName(args: {
  businessName: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const year = new Date().getFullYear();
  const firstName = (args.firstName ?? "").trim();
  const lastName = (args.lastName ?? "").trim();
  const initial = firstName ? `${firstName.charAt(0).toUpperCase()}.` : "";

  let person: string;
  if (initial && lastName) person = `${initial}${lastName}`;
  else if (lastName) person = lastName;
  else if (firstName) person = firstName;
  else person = args.email;

  return `${year} ${args.businessName} | ${person}`;
}

export async function POST(
  _request: NextRequest,
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

  const [prospect] = await db
    .select({
      id: prospects.id,
      businessName: prospects.businessName,
      industry: prospects.industry,
      outreachStage: prospects.outreachStage,
    })
    .from(prospects)
    .where(eq(prospects.id, id))
    .limit(1);

  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  // Pick the contact to promote. Primary wins; otherwise the most recently
  // created one with an email. Email is required \u2014 a deal lives on a
  // contact, and CRM contacts must have an email.
  const candidateContacts = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      isPrimaryContact: contacts.isPrimaryContact,
      createdAt: contacts.createdAt,
    })
    .from(contacts)
    .where(and(eq(contacts.prospectId, id), isNotNull(contacts.email), ne(contacts.email, "")))
    .orderBy(sql`${contacts.isPrimaryContact} DESC, ${contacts.createdAt} DESC NULLS LAST`)
    .limit(1);

  const chosen = candidateContacts[0];
  if (!chosen) {
    return NextResponse.json(
      {
        error:
          "Promotion needs an email-captured contact on this prospect. Add a person with an email first.",
      },
      { status: 400 },
    );
  }

  // Find the target stage on the sales pipeline.
  const [stage] = await db
    .select({ id: stages.id })
    .from(stages)
    .innerJoin(pipelines, eq(pipelines.id, stages.pipelineId))
    .where(and(eq(stages.slug, TARGET_STAGE_SLUG), eq(pipelines.slug, PIPELINE_SLUG)))
    .limit(1);

  if (!stage) {
    logger.error("[prospects/promote] target stage not found", {
      pipelineSlug: PIPELINE_SLUG,
      stageSlug: TARGET_STAGE_SLUG,
    });
    return NextResponse.json({ error: "Sales pipeline 'Lead' stage is missing" }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const dealName = buildDealName({
    businessName: prospect.businessName,
    firstName: chosen.firstName,
    lastName: chosen.lastName,
    email: chosen.email,
  });

  try {
    const { dealId } = await db.transaction(async (tx) => {
      const [deal] = await tx
        .insert(deals)
        .values({
          contactId: chosen.id,
          name: dealName,
          stageId: stage.id,
          stageEnteredAt: nowIso,
          source: "prospect_promotion",
          status: "open",
        })
        .returning({ id: deals.id });

      await tx
        .update(prospects)
        .set({
          outreachStage: "promoted",
          lastTouchedAt: nowIso,
          updatedAt: nowIso,
        })
        .where(eq(prospects.id, id));

      return { dealId: deal?.id ?? null };
    });

    if (dealId) {
      void writeTimelineEvent({
        contactId: chosen.id,
        eventType: "contact_created",
        title: `Promoted from prospect: ${prospect.businessName}`,
        metadata: {
          source: "prospect_promotion",
          prospectId: id,
          dealId,
          promotedBy: session.user.id,
        },
      });
    }
    void writeTimelineEvent({
      prospectId: id,
      contactId: chosen.id,
      eventType: "prospect_promoted",
      title: `Promoted to CRM: ${dealName}`,
      metadata: {
        source: "admin_action",
        dealId,
        contactId: chosen.id,
        promotedBy: session.user.id,
      },
    });

    return NextResponse.json({ success: true, dealId, contactId: chosen.id });
  } catch (err) {
    logger.error("[prospects/promote] failed", {
      prospectId: id,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to promote prospect" }, { status: 500 });
  }
}
