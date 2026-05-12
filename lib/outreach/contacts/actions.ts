/**
 * Contact actions (activate, pause, update status)
 */

import { eq, and, ilike, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachContacts } from "@/lib/db/schema";
import type { Contact, ContactUpdate, ContactAction } from "./types";
import type { BusinessHoursConfig } from "../types/config";
import { calculateEmail1SendTime } from "../scheduling/calculator";
import { addToBlocklist } from "./import";
import { rescheduleContact } from "./queries";
import { escapeForPostgresLike } from "@/lib/security/input-validation";
import { getCampaignSchedule } from "../campaigns/queries";
import { scheduleToBusinessHours } from "../scheduling/business-hours";
import { OUTREACH_MAX_SOFT_BOUNCES, OUTREACH_SOFT_BOUNCE_DELAY_MINUTES } from "@/lib/constants";
import { toSnakeCase, toCamelCase } from "../lib/drizzle-helpers";

/**
 * Update a contact
 *
 * @param id - Contact ID
 * @param updates - Fields to update (snake_case keys)
 * @returns Updated contact or null if error
 */
export async function updateContact(id: string, updates: ContactUpdate): Promise<Contact | null> {
  try {
    // Convert snake_case update keys to camelCase for Drizzle
    const camelUpdates = toCamelCase({
      ...updates,
      updated_at: new Date().toISOString(),
    });

    const [row] = await db
      .update(outreachContacts)
      .set(camelUpdates)
      .where(eq(outreachContacts.id, id))
      .returning();

    if (!row) return null;
    return toSnakeCase<Contact>(row);
  } catch (error) {
    console.error("Error updating contact:", error);
    return null;
  }
}

/**
 * Activate a contact (schedule first email)
 *
 * @param id - Contact ID
 * @returns Updated contact or null if error
 *
 * @example
 * ```typescript
 * const contact = await activateContact(contactId)
 * ```
 */
export async function activateContact(id: string): Promise<Contact | null> {
  try {
    // Get the contact first
    const [row] = await db
      .select()
      .from(outreachContacts)
      .where(eq(outreachContacts.id, id))
      .limit(1);

    if (!row) {
      console.error("Error fetching contact for activation: not found");
      return null;
    }

    const contact = toSnakeCase<Contact>(row);

    // Fetch campaign schedule for business hours
    let businessHours: BusinessHoursConfig | undefined;
    if (contact.campaign_id) {
      const schedule = await getCampaignSchedule(contact.campaign_id);
      if (schedule) {
        businessHours = scheduleToBusinessHours(schedule);
      }
    }

    // Calculate next send time
    const nextSendAt = calculateEmail1SendTime(contact, true, businessHours);

    return updateContact(id, {
      status: "active",
      next_send_at: nextSendAt.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching contact for activation:", error);
    return null;
  }
}

/**
 * Activate multiple contacts at once
 *
 * @param ids - Array of contact IDs
 * @param businessHours - Optional business hours config
 * @returns Number of contacts activated
 */
export async function activateContacts(
  ids: string[],
  businessHours?: BusinessHoursConfig,
): Promise<number> {
  if (ids.length === 0) return 0;

  try {
    // Get all contacts
    const rows = await db.select().from(outreachContacts).where(inArray(outreachContacts.id, ids));

    if (!rows || rows.length === 0) {
      console.error("Error fetching contacts for activation: none found");
      return 0;
    }

    // Group contacts by their computed nextSendAt so each unique value only
    // requires a single bulk UPDATE instead of one per row.
    const groups = new Map<string, string[]>();
    for (const row of rows) {
      const contact = toSnakeCase<Contact>(row);
      const nextSendAt = calculateEmail1SendTime(contact, true, businessHours).toISOString();
      const group = groups.get(nextSendAt);
      if (group) {
        group.push(contact.id);
      } else {
        groups.set(nextSendAt, [contact.id]);
      }
    }

    const updatedAt = new Date().toISOString();
    const updateResults = await Promise.all(
      Array.from(groups.entries()).map(([nextSendAt, groupIds]) =>
        db
          .update(outreachContacts)
          .set({
            status: "active",
            nextSendAt,
            updatedAt,
          })
          .where(inArray(outreachContacts.id, groupIds))
          .returning({ id: outreachContacts.id }),
      ),
    );

    return updateResults.reduce((total, result) => total + result.length, 0);
  } catch (error) {
    console.error("Error fetching contacts for activation:", error);
    return 0;
  }
}

/**
 * Pause a contact (stop sequence)
 *
 * @param id - Contact ID
 * @returns Updated contact or null if error
 */
export async function pauseContact(id: string): Promise<Contact | null> {
  return updateContact(id, {
    status: "paused",
    next_send_at: null,
  });
}

/**
 * Resume a paused contact
 *
 * @param id - Contact ID
 * @returns Updated contact or null if error
 */
export async function resumeContact(id: string): Promise<Contact | null> {
  try {
    const [row] = await db
      .select()
      .from(outreachContacts)
      .where(eq(outreachContacts.id, id))
      .limit(1);

    if (!row) {
      console.error("Error fetching contact for resume: not found");
      return null;
    }

    const contact = toSnakeCase<Contact>(row);

    // Fetch campaign schedule for business hours
    let businessHours: BusinessHoursConfig | undefined;
    if (contact.campaign_id) {
      const schedule = await getCampaignSchedule(contact.campaign_id);
      if (schedule) {
        businessHours = scheduleToBusinessHours(schedule);
      }
    }

    const nextSendAt = calculateEmail1SendTime(contact, true, businessHours);

    return updateContact(id, {
      status: "active",
      next_send_at: nextSendAt.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching contact for resume:", error);
    return null;
  }
}

/**
 * Mark contact as replied (stops sequence)
 *
 * @param id - Contact ID
 * @returns Updated contact or null if error
 */
export async function markContactReplied(id: string): Promise<Contact | null> {
  return updateContact(id, {
    status: "replied",
    replied_at: new Date().toISOString(),
    next_send_at: null,
  });
}

/**
 * Mark contact as bounced (stops sequence and adds to blocklist)
 *
 * @param id - Contact ID
 * @param bounceType - Type of bounce
 * @returns Updated contact or null if error
 */
export async function markContactBounced(id: string, bounceType?: string): Promise<Contact | null> {
  try {
    const [row] = await db
      .select({ email: outreachContacts.email })
      .from(outreachContacts)
      .where(eq(outreachContacts.id, id))
      .limit(1);

    if (!row) {
      console.error("Error fetching contact for bounce: not found");
      return null;
    }

    // Add to blocklist
    await addToBlocklist(row.email, `bounced:${bounceType || "unknown"}`);

    return updateContact(id, {
      status: "bounced",
      bounced_at: new Date().toISOString(),
      next_send_at: null,
    });
  } catch (error) {
    console.error("Error fetching contact for bounce:", error);
    return null;
  }
}

/**
 * Handle a soft bounce for a contact
 * Increments bounce_count and either reschedules or treats as hard bounce
 *
 * @param id - Contact ID
 * @param bounceType - Type of bounce from Resend
 * @returns 'rescheduled' if contact stays active, 'hard_bounced' if promoted to hard bounce
 */
export async function handleSoftBounce(
  id: string,
  bounceType?: string,
): Promise<"rescheduled" | "hard_bounced"> {
  try {
    // Atomically increment bounce_count and get the new value
    const rpcResult = await db.execute(sql`SELECT increment_bounce_count(${id})`);

    const newBounceCount: number | null = (
      rpcResult as unknown as Array<Record<string, unknown>>
    )?.[0]?.increment_bounce_count as number | null;

    if (newBounceCount == null) {
      console.error("Error incrementing bounce_count via RPC: null result");
      // Fall back to hard bounce if we can't atomically increment
      await markContactBounced(id, bounceType);
      return "hard_bounced";
    }

    // Update last_bounce_type separately (non-critical metadata)
    await updateContact(id, {
      last_bounce_type: bounceType || "soft_bounce",
    });

    // Fetch email for logging
    const [contact] = await db
      .select({ email: outreachContacts.email })
      .from(outreachContacts)
      .where(eq(outreachContacts.id, id))
      .limit(1);

    const email = contact?.email ?? id;

    // If too many soft bounces, treat as hard bounce
    if (newBounceCount >= OUTREACH_MAX_SOFT_BOUNCES) {
      console.log(
        `Contact ${id} (${email}) hit ${newBounceCount} soft bounces, treating as hard bounce`,
      );
      await markContactBounced(id, `soft_bounce_escalated:${bounceType || "unknown"}`);
      return "hard_bounced";
    }

    // Reschedule for later retry
    console.log(
      `Soft bounce ${newBounceCount}/${OUTREACH_MAX_SOFT_BOUNCES} for ${email}, rescheduling`,
    );
    await rescheduleContact(id, OUTREACH_SOFT_BOUNCE_DELAY_MINUTES);
    return "rescheduled";
  } catch (error) {
    console.error("Error incrementing bounce_count via RPC:", error);
    // Fall back to hard bounce if we can't atomically increment
    await markContactBounced(id, bounceType);
    return "hard_bounced";
  }
}

/**
 * Mark contact as unsubscribed (stops sequence and adds to blocklist)
 *
 * @param id - Contact ID
 * @returns Updated contact or null if error
 */
export async function markContactUnsubscribed(id: string): Promise<Contact | null> {
  try {
    const [row] = await db
      .select({ email: outreachContacts.email })
      .from(outreachContacts)
      .where(eq(outreachContacts.id, id))
      .limit(1);

    if (!row) {
      console.error("Error fetching contact for unsubscribe: not found");
      return null;
    }

    // Add to blocklist
    await addToBlocklist(row.email, "unsubscribed");

    return updateContact(id, {
      status: "unsubscribed",
      opt_out: true,
      unsubscribed_at: new Date().toISOString(),
      next_send_at: null,
    });
  } catch (error) {
    console.error("Error fetching contact for unsubscribe:", error);
    return null;
  }
}

/**
 * Delete a contact
 *
 * @param id - Contact ID
 * @returns True if successful
 */
export async function deleteContact(id: string): Promise<boolean> {
  try {
    await db.delete(outreachContacts).where(eq(outreachContacts.id, id));
    return true;
  } catch (error) {
    console.error("Error deleting contact:", error);
    return false;
  }
}

/**
 * Perform an action on a contact
 *
 * @param id - Contact ID
 * @param action - Action to perform
 * @returns Updated contact or null if error
 *
 * @example
 * ```typescript
 * const contact = await performContactAction(contactId, 'pause')
 * ```
 */
export async function performContactAction(
  id: string,
  action: ContactAction,
): Promise<Contact | null> {
  switch (action) {
    case "pause":
      return pauseContact(id);
    case "resume":
      return resumeContact(id);
    case "mark_replied":
      return markContactReplied(id);
    case "unsubscribe":
      return markContactUnsubscribed(id);
    default:
      console.error("Unknown contact action:", action);
      return null;
  }
}

/**
 * Pause all contacts from a specific company domain in a campaign
 * Used for company-wide reply stop feature
 *
 * @param campaignId - Campaign ID
 * @param companyDomain - Company domain (e.g., 'acme.com')
 * @returns Number of contacts paused
 *
 * @example
 * ```typescript
 * const pausedCount = await pauseContactsByDomain(campaignId, 'acme.com')
 * console.log(`Paused ${pausedCount} contacts from acme.com`)
 * ```
 */
export async function pauseContactsByDomain(
  campaignId: string,
  companyDomain: string,
): Promise<number> {
  try {
    const rows = await db
      .update(outreachContacts)
      .set({
        status: "paused",
        nextSendAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(outreachContacts.campaignId, campaignId),
          ilike(outreachContacts.email, `%@${escapeForPostgresLike(companyDomain)}`),
          eq(outreachContacts.status, "active"),
        ),
      )
      .returning({ id: outreachContacts.id });

    return rows.length;
  } catch (error) {
    console.error("Error pausing contacts by domain:", error);
    return 0;
  }
}
