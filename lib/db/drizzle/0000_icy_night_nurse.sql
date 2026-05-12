CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone,
	"details" jsonb,
	"ip_address" text,
	"resource_id" text,
	"resource_type" text,
	"user_agent" text,
	"user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "admin_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by" uuid,
	"last_resent_at" timestamp with time zone,
	"message" text,
	"resent_count" integer,
	"role" text DEFAULT 'admin' NOT NULL,
	"sent_at" timestamp with time zone,
	"status" text,
	"token_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city" text,
	"country" text,
	"created_at" timestamp with time zone,
	"device_name" text,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"is_current" boolean,
	"last_activity_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"session_token" text NOT NULL,
	"user_agent" text,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone,
	"language" text,
	"notification_email" text,
	"notify_cal_booking" boolean,
	"notify_new_contact" boolean,
	"notify_new_subscriber" boolean,
	"theme" text,
	"timezone" text,
	"updated_at" timestamp with time zone,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backup_codes" text[],
	"created_at" timestamp with time zone,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"failed_login_attempts" integer,
	"is_active" boolean,
	"job_title" text,
	"last_login_at" timestamp with time zone,
	"locked_until" timestamp with time zone,
	"name" text,
	"password_changed_at" timestamp with time zone,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"totp_enabled" boolean,
	"totp_secret" text,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_name" text DEFAULT 'Jake Simons' NOT NULL,
	"author_url" text,
	"category" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"date_published" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"image" text NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"read_time" text,
	"slug" text NOT NULL,
	"tags" text[],
	"title" text NOT NULL,
	"tldr" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "chat_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text DEFAULT 'text' NOT NULL,
	"title" text NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chat_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"role" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text,
	"document_created_at" timestamp with time zone NOT NULL,
	"document_id" uuid NOT NULL,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"original_text" text NOT NULL,
	"suggested_text" text NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_votes" (
	"chat_id" uuid NOT NULL,
	"is_upvoted" boolean NOT NULL,
	"message_id" uuid NOT NULL,
	CONSTRAINT "chat_votes_chat_id_message_id_pk" PRIMARY KEY("chat_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"user_id" uuid NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_date_time" timestamp with time zone,
	"business_name" text,
	"cal_booking_id" text,
	"contact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"follow_up_sent_at" timestamp with time zone,
	"last_name" text NOT NULL,
	"mobile" text NOT NULL,
	"notes" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_timeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"created_at" timestamp with time zone,
	"description" text,
	"event_type" text NOT NULL,
	"metadata" jsonb,
	"old_stage_id" uuid,
	"pipeline_id" uuid,
	"stage_id" uuid,
	"title" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company" text,
	"contact_status" text,
	"country" text,
	"created_at" timestamp with time zone,
	"email" text NOT NULL,
	"first_name" text,
	"first_touch_date" timestamp with time zone,
	"industry" text,
	"is_newsletter_subscriber" boolean DEFAULT false NOT NULL,
	"job_title" text,
	"last_name" text,
	"last_touch_date" timestamp with time zone,
	"latest_campaign_id" uuid,
	"latest_source" text,
	"latest_source_detail" text,
	"latest_utm_campaign" text,
	"latest_utm_medium" text,
	"latest_utm_source" text,
	"linkedin_url" text,
	"location" text,
	"notes" text,
	"original_campaign_id" uuid,
	"original_source" text,
	"original_source_detail" text,
	"original_utm_campaign" text,
	"original_utm_medium" text,
	"original_utm_source" text,
	"phone" text,
	"seniority" text,
	"source" text NOT NULL,
	"source_detail" text,
	"tags" text[],
	"updated_at" timestamp with time zone,
	"website" text
);
--> statement-breakpoint
CREATE TABLE "crm_sync_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"submission_id" uuid,
	"contact_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deal_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automated" boolean,
	"changed_at" timestamp with time zone,
	"changed_by" uuid,
	"deal_id" uuid NOT NULL,
	"from_stage_id" uuid,
	"notes" text,
	"to_stage_id" uuid NOT NULL,
	"trigger_source" text
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amount" real,
	"contact_id" uuid NOT NULL,
	"created_at" timestamp with time zone,
	"expected_close_date" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"lost_reason" text,
	"meeting_booked_at" timestamp with time zone,
	"name" text NOT NULL,
	"notes" text,
	"probability" integer,
	"source" text NOT NULL,
	"stage_entered_at" timestamp with time zone,
	"stage_id" uuid NOT NULL,
	"status" text,
	"updated_at" timestamp with time zone,
	"won_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auto_deal_created" boolean,
	"auto_reply_sent" boolean,
	"auto_reply_template" text,
	"campaign_id" uuid,
	"classification_model" text,
	"classification_prompt" text,
	"contact_id" uuid NOT NULL,
	"created_at" timestamp with time zone,
	"deal_id" uuid,
	"from_email" text,
	"intent_score" real,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	"reply_date" timestamp with time zone DEFAULT now() NOT NULL,
	"reply_text" text,
	"sentiment" text,
	"subject" text
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"answer" text NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"question" text NOT NULL,
	"tags" text[],
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credential_type" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"encryption_iv" text NOT NULL,
	"encryption_tag" text NOT NULL,
	"expires_at" timestamp with time zone,
	"integration_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_connected" boolean DEFAULT false NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"last_connected_at" timestamp with time zone,
	"last_error" text,
	"provider" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"author" text,
	"content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"embedding" text,
	"engagement" jsonb,
	"key_insights" text[],
	"metadata" jsonb,
	"psychology_principle" text,
	"published_at" timestamp with time zone NOT NULL,
	"score_engagement" real,
	"score_final" real,
	"score_readability" real,
	"score_recency" real,
	"score_relevance" real,
	"source" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"summary" text,
	"title" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"url" text NOT NULL,
	CONSTRAINT "newsletter_articles_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "newsletter_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_limit" integer DEFAULT 50 NOT NULL,
	"avg_click_rate" real DEFAULT 0 NOT NULL,
	"avg_open_rate" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text,
	"frequency" text NOT NULL,
	"name" text NOT NULL,
	"platforms" text[] DEFAULT ARRAY['email']::text[] NOT NULL,
	"psychology_mode" text DEFAULT 'curiosity-driven' NOT NULL,
	"send_days" integer[] DEFAULT ARRAY[2,3,4]::int[] NOT NULL,
	"send_time" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"summarizer_model" text DEFAULT 'claude-3-5-sonnet-20241022' NOT NULL,
	"template_id" uuid,
	"timezone" text DEFAULT 'Australia/Perth' NOT NULL,
	"total_clicks" integer DEFAULT 0 NOT NULL,
	"total_opens" integer DEFAULT 0 NOT NULL,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_editions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_count" integer DEFAULT 0 NOT NULL,
	"campaign_id" uuid,
	"content_html" text NOT NULL,
	"content_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"curated_articles" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"preheader" text,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"subject" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_data" jsonb,
	"event_type" text NOT NULL,
	"ip_address" text,
	"subscriber_id" uuid,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "newsletter_send_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"to_email" text NOT NULL,
	"subject" text,
	"from_email" text,
	"from_name" text,
	"reply_to" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"first_click_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"complained_at" timestamp with time zone,
	"provider_message_id" text,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"footer" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sender" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"template" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_name" text,
	"consent_given_at" timestamp with time zone,
	"consent_ip_address" text,
	"consent_user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"industry" text,
	"last_name" text,
	"onboarded" boolean,
	"onboarded_at" timestamp with time zone,
	"referrer" text,
	"source" text,
	"unsubscribed" boolean DEFAULT false NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verification_token" text,
	"verification_token_expires_at" timestamp with time zone,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"provider" text NOT NULL,
	"return_url" text,
	"state_token" text NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "oauth_states_state_token_unique" UNIQUE("state_token")
);
--> statement-breakpoint
CREATE TABLE "outreach_blocklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone,
	"email" text NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "outreach_campaign_senders" (
	"campaign_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	CONSTRAINT "outreach_campaign_senders_campaign_id_sender_id_pk" PRIMARY KEY("campaign_id","sender_id")
);
--> statement-breakpoint
CREATE TABLE "outreach_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bcc_recipients" text[],
	"cc_recipients" text[],
	"created_at" timestamp with time zone,
	"description" text,
	"email_2_delay" integer,
	"email_3_delay" integer,
	"email_body" text,
	"email_subject" text,
	"end_date" timestamp with time zone,
	"from_email" text NOT NULL,
	"from_name" text,
	"insert_unsubscribe_header" boolean,
	"max_new_leads_per_day" integer,
	"min_send_interval_minutes" integer,
	"name" text NOT NULL,
	"owner_id" uuid,
	"random_send_interval_minutes" integer,
	"start_date" timestamp with time zone,
	"status" text,
	"stop_company_on_reply" boolean,
	"stop_on_auto_reply" boolean,
	"tags" text[],
	"test_mode" boolean,
	"text_only" boolean,
	"text_only_first" boolean,
	"total_bounced" integer,
	"total_clicked" integer,
	"total_contacts" integer,
	"total_delivered" integer,
	"total_opened" integer,
	"total_replied" integer,
	"total_sent" integer,
	"track_clicks" boolean,
	"track_opens" boolean,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outreach_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"added_to_campaign_at" timestamp with time zone,
	"auto_reply_detected" boolean,
	"auto_reply_detected_at" timestamp with time zone,
	"bounce_count" integer,
	"bounced_at" timestamp with time zone,
	"campaign_id" uuid,
	"company" text,
	"company_revenue" real,
	"company_size" text,
	"created_at" timestamp with time zone,
	"current_step" integer,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"email" text NOT NULL,
	"email_1_body" text NOT NULL,
	"email_1_message_id" text,
	"email_1_resend_id" text,
	"email_1_sent_at" timestamp with time zone,
	"email_1_subject" text NOT NULL,
	"email_2_body" text NOT NULL,
	"email_2_resend_id" text,
	"email_2_sent_at" timestamp with time zone,
	"email_2_subject" text,
	"email_3_body" text NOT NULL,
	"email_3_resend_id" text,
	"email_3_sent_at" timestamp with time zone,
	"email_3_subject" text NOT NULL,
	"email_provider" text,
	"email_security_gateway" text,
	"first_name" text,
	"founded_year" integer,
	"industry" text,
	"job_title" text,
	"last_bounce_type" text,
	"last_name" text,
	"linkedin_url" text,
	"location" text,
	"next_send_at" timestamp with time zone,
	"opt_out" boolean,
	"phone" text,
	"replied_at" timestamp with time zone,
	"research_report" text,
	"security_level" text,
	"security_tier" text,
	"sender_account_id" uuid,
	"seniority" text,
	"status" text,
	"timezone" text,
	"unsubscribed_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"website_url" text
);
--> statement-breakpoint
CREATE TABLE "outreach_email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bounce_message" text,
	"bounce_type" text,
	"contact_id" uuid,
	"created_at" timestamp with time zone,
	"email_number" integer NOT NULL,
	"event_type" text NOT NULL,
	"ip_address" text,
	"link_url" text,
	"resend_email_id" text,
	"svix_id" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "outreach_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_suggested_reply" text,
	"ai_summary" text,
	"body_html" text,
	"body_text" text,
	"campaign_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"crm_contact_id" uuid,
	"crm_deal_id" uuid,
	"from_email" text NOT NULL,
	"inbound_message_id" text,
	"intent" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"pushed_to_crm_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reply_body" text,
	"reply_sender_email" text,
	"reply_sent_at" timestamp with time zone,
	"sentiment" text,
	"subject" text
);
--> statement-breakpoint
CREATE TABLE "outreach_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"created_at" timestamp with time zone,
	"is_active" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"send_days" text[] DEFAULT ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday']::text[] NOT NULL,
	"send_window_end" text DEFAULT '17:00' NOT NULL,
	"send_window_start" text DEFAULT '09:00' NOT NULL,
	"timezone" text DEFAULT 'Australia/Perth' NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outreach_sender_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone,
	"daily_limit" integer,
	"domain" text NOT NULL,
	"email" text NOT NULL,
	"emails_sent_today" integer,
	"is_active" boolean,
	"last_sent_at" timestamp with time zone,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone,
	"display_order" integer,
	"logo_url" text NOT NULL,
	"name" text NOT NULL,
	"published" boolean,
	"updated_at" timestamp with time zone,
	"website_url" text
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"token_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"color" text,
	"created_at" timestamp with time zone,
	"description" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"icon" text,
	"is_active" boolean,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"color" text,
	"created_at" timestamp with time zone,
	"description" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_positive" boolean,
	"is_terminal" boolean,
	"name" text NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"slug" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"avatar_src" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"google_review_id" text,
	"name" text NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"quote" text NOT NULL,
	"rating" integer DEFAULT 5 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "testimonials_google_review_id_unique" UNIQUE("google_review_id")
);
--> statement-breakpoint
CREATE INDEX "contacts_source_idx" ON "contacts" USING btree ("source");--> statement-breakpoint
CREATE INDEX "contacts_created_at_idx" ON "contacts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "deal_stage_history_deal_id_idx" ON "deal_stage_history" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "deal_stage_history_changed_at_idx" ON "deal_stage_history" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "deals_stage_id_idx" ON "deals" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "deals_status_idx" ON "deals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deals_updated_at_idx" ON "deals" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "deals_created_at_idx" ON "deals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "deals_contact_id_idx" ON "deals" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "newsletter_editions_status_idx" ON "newsletter_editions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "newsletter_editions_sent_at_idx" ON "newsletter_editions" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "newsletter_subscribers_verified_idx" ON "newsletter_subscribers" USING btree ("verified");--> statement-breakpoint
CREATE INDEX "newsletter_subscribers_unsubscribed_idx" ON "newsletter_subscribers" USING btree ("unsubscribed");--> statement-breakpoint
CREATE INDEX "outreach_replies_sentiment_idx" ON "outreach_replies" USING btree ("sentiment");--> statement-breakpoint
CREATE INDEX "outreach_replies_received_at_idx" ON "outreach_replies" USING btree ("received_at");