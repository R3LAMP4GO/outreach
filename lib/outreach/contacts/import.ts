/**
 * Contact bulk import functionality
 */

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachContacts, outreachBlocklist } from "@/lib/db/schema";
import type { ImportContactInput, ImportResult, ContactInsert } from "./types";
import { isValidEmail } from "../lib/utils";
import { getBlockedEmails, emailExistsInCampaign } from "./queries";
import { incrementCampaignStat } from "../campaigns/actions";
import { DEFAULT_TIMEZONE } from "../types/config";
import { toCamelCase } from "../lib/drizzle-helpers";

/**
 * Import contacts for a campaign with validation and duplicate checking
 *
 * @param campaignId - Campaign ID
 * @param contacts - Array of contacts to import
 * @returns Import result with counts and errors
 *
 * @example
 * ```typescript
 * const result = await importContacts(campaignId, [
 *   {
 *     email: 'john@example.com',
 *     first_name: 'John',
 *     email_1_subject: 'Quick question',
 *     email_1_body: '<p>Hi John...</p>',
 *     email_2_body: '<p>Following up...</p>',
 *     email_3_subject: 'One more thought',
 *     email_3_body: '<p>I wanted to share...</p>'
 *   }
 * ])
 *
 * console.log(`Imported: ${result.imported}, Duplicates: ${result.duplicates}`)
 * ```
 */
export async function importContacts(
  campaignId: string,
  contacts: ImportContactInput[],
): Promise<ImportResult> {
  const result: ImportResult = {
    success: true,
    imported: 0,
    duplicates: 0,
    blocked: 0,
    errors: [],
  };

  if (contacts.length === 0) {
    return result;
  }

  // Step 1: Validate all contacts
  const validContacts: ImportContactInput[] = [];
  const contactEmails = new Set<string>();

  for (const contact of contacts) {
    const errors = validateContact(contact);
    if (errors.length > 0) {
      result.errors.push({
        email: contact.email,
        reason: "Validation failed",
        details: errors.join(", "),
      });
      continue;
    }

    // Check for duplicates within the batch
    const normalizedEmail = contact.email.toLowerCase();
    if (contactEmails.has(normalizedEmail)) {
      result.duplicates++;
      continue;
    }

    contactEmails.add(normalizedEmail);
    validContacts.push(contact);
  }

  if (validContacts.length === 0) {
    result.success = false;
    return result;
  }

  // Step 2: Check blocklist
  const blockedEmails = await getBlockedEmails(validContacts.map((c) => c.email));

  const nonBlockedContacts = validContacts.filter((contact) => {
    const isBlocked = blockedEmails.has(contact.email.toLowerCase());
    if (isBlocked) {
      result.blocked++;
      result.errors.push({
        email: contact.email,
        reason: "Blocked",
        details: "Email is in blocklist",
      });
    }
    return !isBlocked;
  });

  if (nonBlockedContacts.length === 0) {
    result.success = blockedEmails.size === 0;
    return result;
  }

  // Step 3: Check for existing emails in this campaign
  const newContacts: ImportContactInput[] = [];

  for (const contact of nonBlockedContacts) {
    const exists = await emailExistsInCampaign(campaignId, contact.email);
    if (exists) {
      result.duplicates++;
    } else {
      newContacts.push(contact);
    }
  }

  if (newContacts.length === 0) {
    return result;
  }

  // Note: max_new_leads_per_day is enforced by the sending/processing system,
  // NOT at import time. Imports are unlimited — the daily cap only controls
  // how many new contacts receive their first email each day.

  // Step 4: Insert contacts
  // Prepare snake_case inserts, then convert to camelCase for Drizzle
  const contactInserts = newContacts.map((contact) => prepareContactInsert(campaignId, contact));

  // Convert snake_case keys to camelCase for Drizzle
  const drizzleInserts = contactInserts.map((insert) =>
    toCamelCase(insert as unknown as Record<string, unknown>),
  );

  try {
    const data = await db
      .insert(outreachContacts)
      .values(drizzleInserts as (typeof outreachContacts.$inferInsert)[])
      .returning({ id: outreachContacts.id });

    result.imported = data.length;
  } catch (error) {
    console.error("Error inserting contacts:", error);
    result.success = false;
    result.errors.push({
      email: "batch",
      reason: "Database error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
    return result;
  }

  // Step 5: Update campaign contact count
  if (result.imported > 0) {
    await incrementCampaignStat(campaignId, "total_contacts", result.imported);
  }

  return result;
}

/**
 * Validate a contact for import
 *
 * @param contact - Contact to validate
 * @returns Array of validation error messages
 */
export function validateContact(contact: ImportContactInput): string[] {
  const errors: string[] = [];

  // Required fields
  if (!contact.email) {
    errors.push("Email is required");
  } else if (!isValidEmail(contact.email)) {
    errors.push("Invalid email format");
  }

  if (!contact.email_1_subject) {
    errors.push("Email 1 subject is required");
  }

  if (!contact.email_1_body) {
    errors.push("Email 1 body is required");
  }

  // Note: email_2_subject is optional - defaults to "Re: {email_1_subject}" for threading
  // See lib/outreach/sending/threading.ts for default behavior

  if (!contact.email_2_body) {
    errors.push("Email 2 body is required");
  }

  if (!contact.email_3_subject) {
    errors.push("Email 3 subject is required");
  }

  if (!contact.email_3_body) {
    errors.push("Email 3 body is required");
  }

  // Field length validation
  if (contact.email && contact.email.length > 255) {
    errors.push("Email too long (max 255 characters)");
  }

  if (contact.email_1_subject && contact.email_1_subject.length > 500) {
    errors.push("Email 1 subject too long (max 500 characters)");
  }

  if (contact.email_2_subject && contact.email_2_subject.length > 500) {
    errors.push("Email 2 subject too long (max 500 characters)");
  }

  if (contact.email_3_subject && contact.email_3_subject.length > 500) {
    errors.push("Email 3 subject too long (max 500 characters)");
  }

  return errors;
}

/**
 * Prepare contact for database insert.
 * Explicitly maps known fields. Unknown fields are ignored.
 * N8N aliases (mobile → phone, security_gateway → email_security_gateway) handled here.
 */
function prepareContactInsert(campaignId: string, contact: ImportContactInput): ContactInsert {
  return {
    campaign_id: campaignId,
    email: contact.email.toLowerCase(),
    first_name: contact.first_name || null,
    last_name: contact.last_name || null,
    company: contact.company || null,
    job_title: contact.job_title || null,
    seniority: contact.seniority || null,
    phone: contact.phone || contact.mobile || null,
    location: contact.location || null,
    website_url: contact.website_url || null,
    linkedin_url: contact.linkedin_url || null,
    industry: contact.industry || null,
    company_size: contact.company_size || null,
    company_revenue:
      contact.company_revenue && !isNaN(Number(contact.company_revenue))
        ? Number(contact.company_revenue)
        : null,
    founded_year:
      contact.founded_year && !isNaN(Number(contact.founded_year))
        ? Number(contact.founded_year)
        : null,
    email_provider: contact.email_provider || null,
    email_security_gateway: contact.email_security_gateway || contact.security_gateway || null,
    security_tier: contact.security_tier || null,
    security_level: contact.security_level || null,
    opt_out: contact.opt_out || false,
    research_report: contact.research_report || null,
    email_1_subject: contact.email_1_subject,
    email_1_body: contact.email_1_body,
    email_2_subject: contact.email_2_subject || null,
    email_2_body: contact.email_2_body,
    email_3_subject: contact.email_3_subject,
    email_3_body: contact.email_3_body,
    sender_account_id: contact.sender_account_id || null,
    timezone: contact.timezone || DEFAULT_TIMEZONE,
    status: "lead",
    current_step: 0,
    next_send_at: null,
  } as ContactInsert;
}

/**
 * Add email to blocklist
 *
 * @param email - Email address
 * @param reason - Reason for blocking
 * @returns True if successful
 */
export async function addToBlocklist(email: string, reason: string = "manual"): Promise<boolean> {
  try {
    await db.execute(
      sql`INSERT INTO outreach_blocklist (email, reason, created_at)
          VALUES (${email.toLowerCase()}, ${reason}, ${new Date().toISOString()})
          ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason, created_at = EXCLUDED.created_at`,
    );
    return true;
  } catch (error) {
    console.error("Error adding to blocklist:", error);
    return false;
  }
}

/**
 * Remove email from blocklist
 *
 * @param email - Email address
 * @returns True if successful
 */
export async function removeFromBlocklist(email: string): Promise<boolean> {
  try {
    await db.delete(outreachBlocklist).where(eq(outreachBlocklist.email, email.toLowerCase()));
    return true;
  } catch (error) {
    console.error("Error removing from blocklist:", error);
    return false;
  }
}
