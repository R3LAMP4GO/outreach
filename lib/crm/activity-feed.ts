/**
 * Server-side activity feed fetcher for CRM dashboard.
 */

import { sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { contactTimeline, contacts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function fetchActivityFeedUncached(limit = 10) {
  const eventRows = await db
    .select({
      id: contactTimeline.id,
      eventType: contactTimeline.eventType,
      title: contactTimeline.title,
      description: contactTimeline.description,
      metadata: contactTimeline.metadata,
      createdAt: contactTimeline.createdAt,
      contactId: contacts.id,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactEmail: contacts.email,
      contactStatus: contacts.contactStatus,
    })
    .from(contactTimeline)
    .leftJoin(contacts, eq(contactTimeline.contactId, contacts.id))
    .orderBy(sql`${contactTimeline.createdAt} DESC`)
    .limit(limit);

  return eventRows.map((row) => ({
    id: row.id,
    event_type: row.eventType,
    title: row.title,
    description: row.description,
    metadata: row.metadata,
    created_at: row.createdAt,
    contact: row.contactId
      ? {
          id: row.contactId,
          first_name: row.contactFirstName,
          last_name: row.contactLastName,
          email: row.contactEmail,
          contact_status: row.contactStatus,
        }
      : null,
  }));
}

/**
 * Cached activity feed — revalidates every 30 seconds.
 */
export const getActivityFeed = unstable_cache(fetchActivityFeedUncached, ["crm-activity-feed"], {
  revalidate: 30,
  tags: ["crm-metrics"],
});
