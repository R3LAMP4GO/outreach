/**
 * CRM Timeline Event Writer
 *
 * Centralized utility for writing events to the contact_timeline table.
 * Non-throwing — logs errors but never fails the parent operation.
 */

import { db } from "@/lib/db";
import { contactTimeline } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import type { TimelineEventType, TimelineEventInput } from "./types";

export type { TimelineEventType, TimelineEventInput };

/**
 * Write a single timeline event. Non-throwing — logs errors but never throws.
 *
 * The first parameter is ignored (kept for backward compatibility during migration).
 * Call as writeTimelineEvent(event) or writeTimelineEvent(ignoredClient, event).
 */
export async function writeTimelineEvent(
  eventOrClient: TimelineEventInput | unknown,
  maybeEvent?: TimelineEventInput,
): Promise<void> {
  const event = maybeEvent ?? (eventOrClient as TimelineEventInput);
  try {
    await db.insert(contactTimeline).values({
      contactId: event.contactId,
      eventType: event.eventType,
      title: event.title,
      description: event.description ?? null,
      metadata: event.metadata ?? null,
      pipelineId: event.pipelineId ?? null,
      stageId: event.stageId ?? null,
      oldStageId: event.oldStageId ?? null,
    });
  } catch (err) {
    logger.error("Failed to write timeline event:", {
      eventType: event.eventType,
      contactId: event.contactId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Write multiple timeline events in a single insert. Non-throwing.
 *
 * The first parameter is ignored (kept for backward compatibility during migration).
 * Call as writeTimelineEvents(events) or writeTimelineEvents(ignoredClient, events).
 */
export async function writeTimelineEvents(
  eventsOrClient: TimelineEventInput[] | unknown,
  maybeEvents?: TimelineEventInput[],
): Promise<void> {
  const events = maybeEvents ?? (eventsOrClient as TimelineEventInput[]);
  if (events.length === 0) return;

  try {
    const rows = events.map((event) => ({
      contactId: event.contactId,
      eventType: event.eventType,
      title: event.title,
      description: event.description ?? null,
      metadata: event.metadata ?? null,
      pipelineId: event.pipelineId ?? null,
      stageId: event.stageId ?? null,
      oldStageId: event.oldStageId ?? null,
    }));

    await db.insert(contactTimeline).values(rows);
  } catch (err) {
    logger.error("Failed to write timeline events batch:", {
      count: events.length,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
