CREATE TABLE "prospect_follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"completed_at" timestamp with time zone,
	"contact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"pgboss_job_id" uuid,
	"prospect_id" uuid NOT NULL,
	"reason" text,
	"source" text DEFAULT 'ai_extracted' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text,
	"assigned_user_id" uuid,
	"business_name" text NOT NULL,
	"cap_video_id" text,
	"cap_video_url" text,
	"city" text,
	"country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"google_place_id" text,
	"industry" text,
	"last_touched_at" timestamp with time zone,
	"notes" text,
	"outreach_stage" text DEFAULT 'new' NOT NULL,
	"phone" text,
	"seo_report_error" text,
	"seo_report_status" text DEFAULT 'pending' NOT NULL,
	"seo_report_url" text,
	"state" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"website" text
);
--> statement-breakpoint
CREATE TABLE "video_engagement_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cap_video_id" text NOT NULL,
	"contact_id" uuid,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone,
	"prospect_id" uuid,
	"raw_payload" jsonb,
	"viewer_country" text,
	"viewer_ip" text,
	"watch_duration_seconds" integer,
	"watch_percent" integer
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "is_primary_contact" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "last_spoke_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "prospect_id" uuid;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "role_at_company" text;--> statement-breakpoint
CREATE INDEX "prospect_follow_ups_prospect_id_idx" ON "prospect_follow_ups" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "prospect_follow_ups_due_at_idx" ON "prospect_follow_ups" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "prospect_follow_ups_status_idx" ON "prospect_follow_ups" USING btree ("status");--> statement-breakpoint
CREATE INDEX "prospects_outreach_stage_idx" ON "prospects" USING btree ("outreach_stage");--> statement-breakpoint
CREATE INDEX "prospects_assigned_user_id_idx" ON "prospects" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "prospects_created_at_idx" ON "prospects" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "prospects_google_place_id_idx" ON "prospects" USING btree ("google_place_id");--> statement-breakpoint
CREATE INDEX "video_engagement_events_prospect_id_idx" ON "video_engagement_events" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "video_engagement_events_contact_id_idx" ON "video_engagement_events" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "video_engagement_events_cap_video_id_idx" ON "video_engagement_events" USING btree ("cap_video_id");--> statement-breakpoint
CREATE INDEX "video_engagement_events_occurred_at_idx" ON "video_engagement_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "contacts_prospect_id_idx" ON "contacts" USING btree ("prospect_id");
