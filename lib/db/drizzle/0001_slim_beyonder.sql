CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"priority" text DEFAULT 'INFO' NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"related_id" text,
	"related_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"business_name" text,
	"abn" text,
	"phone" text,
	"email" text,
	"logo_url" text,
	"address_street" text,
	"address_city" text,
	"address_state" text,
	"address_postcode" text,
	"website" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_settings" ADD COLUMN "skin_id" text DEFAULT 'concrete';--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "product_interest" text;--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_is_read_idx" ON "notifications" USING btree ("is_read");