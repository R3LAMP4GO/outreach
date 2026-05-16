-- Quo (formerly OpenPhone) webhook idempotency + per-call processing dedupe.
--
-- `quo_webhook_events`: every accepted webhook delivery is recorded here by
-- event id BEFORE downstream dispatch. Mirrors `outreach_email_events.svix_id`
-- — Quo's at-least-once delivery means the same event id may arrive multiple
-- times even after a 2xx ack. The PK conflict on the second attempt is the
-- idempotency signal.
--
-- `quo_calls_processed`: the `process-quo-call` pg-boss handler writes here
-- once a call has been fully extracted (summary + transcript fetched, AI run,
-- prospect/contact upserted). All three call-related webhooks
-- (`call.completed`, `call.summary.completed`, `call.transcript.completed`)
-- enqueue the same job for the same callId; this table is how the handler
-- knows it's already done the work.
--
-- Apply via: node scripts/apply-migration.mjs lib/db/drizzle/0008_quo_webhook_events.sql

CREATE TABLE IF NOT EXISTS "quo_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quo_webhook_events_received_at_idx" ON "quo_webhook_events" USING btree ("received_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quo_calls_processed" (
	"call_id" text PRIMARY KEY NOT NULL,
	"prospect_id" uuid,
	"contact_id" uuid,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quo_calls_processed_prospect_id_idx" ON "quo_calls_processed" USING btree ("prospect_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quo_calls_processed_processed_at_idx" ON "quo_calls_processed" USING btree ("processed_at");
