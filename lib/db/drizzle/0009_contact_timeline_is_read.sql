-- Add an `is_read` flag to `contact_timeline` so the SMS inbox can show
-- unread counts on inbound messages and let admins clear them on visit.
--
-- Default false: every newly written timeline row starts unread. The inbox
-- view flips inbound SMS rows to read when the thread is opened.
-- Apply via: node scripts/apply-migration.mjs lib/db/drizzle/0009_contact_timeline_is_read.sql

ALTER TABLE "contact_timeline"
  ADD COLUMN IF NOT EXISTS "is_read" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- Partial index covering the inbox-unread query path: only unread inbound SMS
-- rows. Tiny, fast, and avoids bloating a generic is_read index.
CREATE INDEX IF NOT EXISTS "contact_timeline_sms_unread_idx"
  ON "contact_timeline" ("prospect_id")
  WHERE "is_read" = false AND "event_type" = 'sms_received';
