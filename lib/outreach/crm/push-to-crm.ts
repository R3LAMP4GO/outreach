import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, stages, deals } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { writeTimelineEvent } from "@/lib/crm/timeline";

/**
 * Push a positive outreach reply into the CRM as a contact + deal.
 */
export async function pushToCrm(
  contact: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    jobTitle?: string | null;
    phone?: string | null;
    linkedinUrl?: string | null;
    seniority?: string | null;
    location?: string | null;
    industry?: string | null;
    companySize?: string | null;
  },
  campaignName: string,
  options?: {
    aiSummary?: string | null;
    intent?: string | null;
  },
): Promise<{ crmContactId: string; crmDealId: string } | null> {
  try {
    // Upsert contact with hierarchy protection (never downgrades status)
    const contactResult = await db.execute<{
      contact_id: string;
      created: boolean;
      updated: boolean;
      status_applied: string;
    }>(sql`
      SELECT * FROM upsert_contact_with_hierarchy_protection(
        p_email := ${contact.email},
        p_first_name := ${contact.firstName || null},
        p_last_name := ${contact.lastName || null},
        p_company := ${contact.company || null},
        p_contact_status := 'lead',
        p_source := 'outreach_reply'
      )
    `);

    const result = contactResult[0] as Record<string, unknown> | undefined;
    const crmContactId = result?.contact_id as string | undefined;
    if (!crmContactId) {
      logger.error("No contact_id returned from upsert RPC");
      return null;
    }

    // Update enrichment fields on contact (if provided)
    const enrichmentUpdate: Record<string, string | null> = {};
    if (contact.jobTitle != null) enrichmentUpdate.jobTitle = contact.jobTitle;
    if (contact.phone != null) enrichmentUpdate.phone = contact.phone;
    if (contact.linkedinUrl != null) enrichmentUpdate.linkedinUrl = contact.linkedinUrl;
    if (contact.seniority != null) enrichmentUpdate.seniority = contact.seniority;
    if (contact.location != null) enrichmentUpdate.location = contact.location;
    if (contact.industry != null) enrichmentUpdate.industry = contact.industry;

    if (Object.keys(enrichmentUpdate).length > 0) {
      try {
        await db
          .update(contacts)
          .set(enrichmentUpdate as unknown as typeof contacts.$inferInsert)
          .where(eq(contacts.id, crmContactId));
      } catch (enrichErr) {
        logger.warn("Failed to update CRM contact enrichment fields:", enrichErr);
      }
    }

    // Write timeline events
    if (result?.created) {
      void writeTimelineEvent({
        contactId: crmContactId,
        eventType: "contact_created",
        title: "Contact created from outreach reply",
        metadata: { source: "outreach_reply", campaign_name: campaignName },
      });
    }

    void writeTimelineEvent({
      contactId: crmContactId,
      eventType: "outreach_reply",
      title: `Replied to outreach campaign: ${campaignName}`,
      metadata: {
        campaign_name: campaignName,
        sentiment: options?.aiSummary ? "analyzed" : undefined,
        intent: options?.intent ?? undefined,
      },
    });

    // Outreach replies always land at "contacted". Only a real Cal.com booking
    // promotes a deal to "meeting-booked" — see app/api/webhooks/cal/route.ts.
    const [stage] = await db
      .select({ id: stages.id })
      .from(stages)
      .where(eq(stages.slug, "contacted"))
      .limit(1);

    if (!stage) {
      logger.error('Could not find "contacted" stage');
      return null;
    }

    return await createDeal(
      crmContactId,
      stage.id,
      contact,
      campaignName,
      options?.aiSummary ?? null,
      options?.intent ?? null,
    );
  } catch (err) {
    logger.error("Error pushing to CRM:", err);
    return null;
  }
}

/**
 * Build a deal name in the project's standard format:
 *   `{YYYY} {Company} | {FirstInitial}.{LastName}`
 *
 * Mirrors the contact-form path (`app/api/contact/submit/route.ts:434-437`).
 * For outreach replies, falls back to the campaign name when company is
 * missing, and to the email when the contact has no name parsed yet.
 */
function buildOutreachDealName(
  contact: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
  },
  campaignName: string,
): string {
  const year = new Date().getFullYear();
  const company = (contact.company ?? "").trim() || campaignName;

  const firstName = (contact.firstName ?? "").trim();
  const lastName = (contact.lastName ?? "").trim();
  const initial = firstName ? `${firstName.charAt(0).toUpperCase()}.` : "";

  let person: string;
  if (initial && lastName) {
    person = `${initial}${lastName}`;
  } else if (lastName) {
    person = lastName;
  } else if (firstName) {
    person = firstName;
  } else {
    person = contact.email;
  }

  return `${year} ${company} | ${person}`;
}

async function createDeal(
  crmContactId: string,
  stageId: string,
  contact: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
  },
  campaignName: string,
  aiSummary: string | null,
  intent: string | null,
): Promise<{ crmContactId: string; crmDealId: string } | null> {
  const dealName = buildOutreachDealName(contact, campaignName);

  const intentLine = intent ? `Intent: ${intent}` : null;
  const summaryLine = aiSummary ? `AI Summary: ${aiSummary}` : null;
  const notes = [intentLine, summaryLine].filter(Boolean).join("\n\n") || null;

  try {
    const [deal] = await db
      .insert(deals)
      .values({
        contactId: crmContactId,
        name: dealName,
        stageId,
        stageEnteredAt: new Date().toISOString(),
        source: "outreach_reply",
        status: "open",
        ...(notes ? { notes } : {}),
      })
      .returning({ id: deals.id });

    if (!deal) {
      logger.error("Error creating CRM deal: no row returned");
      return null;
    }

    // Write deal_created timeline event
    void writeTimelineEvent({
      contactId: crmContactId,
      eventType: "deal_created",
      title: `Deal created from outreach: ${dealName}`,
      metadata: {
        deal_id: deal.id,
        deal_name: dealName,
        source: "outreach_reply",
        campaign_name: campaignName,
      },
    });

    return { crmContactId, crmDealId: deal.id };
  } catch (err) {
    // Handle unique constraint violation — deal already exists
    const error = err as { code?: string };
    if (error.code === "23505") {
      const [existingDeal] = await db
        .select({ id: deals.id })
        .from(deals)
        .where(and(eq(deals.contactId, crmContactId), eq(deals.status, "open")))
        .limit(1);

      if (existingDeal?.id) {
        return { crmContactId, crmDealId: existingDeal.id };
      }
    }

    logger.error("Error creating CRM deal:", err);
    return null;
  }
}
