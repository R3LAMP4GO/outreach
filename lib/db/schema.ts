import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ============================================================================
// 1. admin_audit_log
// ============================================================================
export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  resourceId: text("resource_id"),
  resourceType: text("resource_type"),
  userAgent: text("user_agent"),
  userId: uuid("user_id"),
});

// ============================================================================
// 2. admin_invitations
// ============================================================================
export const adminInvitations = pgTable("admin_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  invitedBy: uuid("invited_by"),
  lastResentAt: timestamp("last_resent_at", { withTimezone: true, mode: "string" }),
  message: text("message"),
  resentCount: integer("resent_count"),
  role: text("role").notNull().default("admin"),
  sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }),
  status: text("status"),
  tokenHash: text("token_hash").notNull(),
});

// ============================================================================
// 3. admin_sessions
// ============================================================================
export const adminSessions = pgTable("admin_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  city: text("city"),
  country: text("country"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
  deviceName: text("device_name"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  ipAddress: text("ip_address"),
  isCurrent: boolean("is_current"),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true, mode: "string" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
  sessionToken: text("session_token").notNull(),
  userAgent: text("user_agent"),
  userId: uuid("user_id").notNull(),
});

// ============================================================================
// 4. admin_settings
// ============================================================================
export const adminSettings = pgTable("admin_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
  language: text("language"),
  notificationEmail: text("notification_email"),
  notifyCalBooking: boolean("notify_cal_booking"),
  notifyNewContact: boolean("notify_new_contact"),
  notifyNewSubscriber: boolean("notify_new_subscriber"),
  theme: text("theme"),
  timezone: text("timezone"),
  skinId: text("skin_id").default("concrete"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }),
  userId: uuid("user_id").notNull(),
});

// ============================================================================
// 5. admin_users
// ============================================================================
export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  avatarUrl: text("avatar_url"),
  backupCodes: text("backup_codes").array(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
  email: text("email").notNull(),
  emailVerified: timestamp("email_verified", { withTimezone: true, mode: "string" }),
  failedLoginAttempts: integer("failed_login_attempts"),
  isActive: boolean("is_active"),
  jobTitle: text("job_title"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "string" }),
  lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "string" }),
  name: text("name"),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true, mode: "string" }),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("admin"),
  totpEnabled: boolean("totp_enabled"),
  totpSecret: text("totp_secret"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }),
});

// ============================================================================
// 6. blog_posts
// ============================================================================
export const blogPosts = pgTable("blog_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorName: text("author_name").notNull().default("Jake Simons"),
  authorUrl: text("author_url"),
  category: text("category").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  datePublished: timestamp("date_published", { withTimezone: true, mode: "string" }).notNull(),
  description: text("description").notNull(),
  image: text("image").notNull(),
  published: boolean("published").notNull().default(false),
  readTime: text("read_time"),
  slug: text("slug").notNull().unique(),
  tags: text("tags").array(),
  title: text("title").notNull(),
  tldr: text("tldr"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

// ============================================================================
// 7. chat_documents
// ============================================================================
export const chatDocuments = pgTable("chat_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  content: text("content"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  kind: text("kind").notNull().default("text"),
  title: text("title").notNull(),
  userId: uuid("user_id").notNull(),
});

// ============================================================================
// 8. chat_messages
// ============================================================================
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  attachments: jsonb("attachments").notNull().default([]),
  chatId: uuid("chat_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  parts: jsonb("parts").notNull().default([]),
  role: text("role").notNull(),
});

// ============================================================================
// 9. chat_streams
// ============================================================================
export const chatStreams = pgTable("chat_streams", {
  id: uuid("id").primaryKey().defaultRandom(),
  chatId: uuid("chat_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

// ============================================================================
// 10. chat_suggestions
// ============================================================================
export const chatSuggestions = pgTable("chat_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  description: text("description"),
  documentCreatedAt: timestamp("document_created_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  documentId: uuid("document_id").notNull(),
  isResolved: boolean("is_resolved").notNull().default(false),
  originalText: text("original_text").notNull(),
  suggestedText: text("suggested_text").notNull(),
  userId: uuid("user_id").notNull(),
});

// ============================================================================
// 11. chat_votes (composite primary key)
// ============================================================================
export const chatVotes = pgTable(
  "chat_votes",
  {
    chatId: uuid("chat_id").notNull(),
    isUpvoted: boolean("is_upvoted").notNull(),
    messageId: uuid("message_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.chatId, table.messageId] })],
);

// ============================================================================
// 12. chats
// ============================================================================
export const chats = pgTable("chats", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  title: text("title").notNull(),
  userId: uuid("user_id").notNull(),
  visibility: text("visibility").notNull().default("private"),
});

// ============================================================================
// 13. contact_pipeline_stages
// ============================================================================
export const contactPipelineStages = pgTable("contact_pipeline_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id").notNull(),
  enteredAt: timestamp("entered_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  pipelineId: uuid("pipeline_id").notNull(),
  stageId: uuid("stage_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

// ============================================================================
// 14. contact_submissions
// ============================================================================
export const contactSubmissions = pgTable("contact_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingDateTime: timestamp("booking_date_time", { withTimezone: true, mode: "string" }),
  businessName: text("business_name"),
  calBookingId: text("cal_booking_id"),
  contactId: uuid("contact_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  email: text("email").notNull(),
  firstName: text("first_name").notNull(),
  followUpSentAt: timestamp("follow_up_sent_at", { withTimezone: true, mode: "string" }),
  lastName: text("last_name").notNull(),
  mobile: text("mobile").notNull(),
  notes: text("notes").notNull(),
  productInterest: text("product_interest"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

// ============================================================================
// 15. contact_timeline
// ============================================================================
export const contactTimeline = pgTable("contact_timeline", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
  description: text("description"),
  eventType: text("event_type").notNull(),
  metadata: jsonb("metadata"),
  oldStageId: uuid("old_stage_id"),
  pipelineId: uuid("pipeline_id"),
  stageId: uuid("stage_id"),
  title: text("title").notNull(),
});

// ============================================================================
// 16. contacts
// ============================================================================
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    company: text("company"),
    contactStatus: text("contact_status"),
    country: text("country"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
    email: text("email").notNull(),
    firstName: text("first_name"),
    firstTouchDate: timestamp("first_touch_date", { withTimezone: true, mode: "string" }),
    industry: text("industry"),
    isNewsletterSubscriber: boolean("is_newsletter_subscriber").notNull().default(false),
    jobTitle: text("job_title"),
    lastName: text("last_name"),
    lastTouchDate: timestamp("last_touch_date", { withTimezone: true, mode: "string" }),
    latestCampaignId: uuid("latest_campaign_id"),
    latestSource: text("latest_source"),
    latestSourceDetail: text("latest_source_detail"),
    latestUtmCampaign: text("latest_utm_campaign"),
    latestUtmMedium: text("latest_utm_medium"),
    latestUtmSource: text("latest_utm_source"),
    linkedinUrl: text("linkedin_url"),
    location: text("location"),
    notes: text("notes"),
    originalCampaignId: uuid("original_campaign_id"),
    originalSource: text("original_source"),
    originalSourceDetail: text("original_source_detail"),
    originalUtmCampaign: text("original_utm_campaign"),
    originalUtmMedium: text("original_utm_medium"),
    originalUtmSource: text("original_utm_source"),
    phone: text("phone"),
    seniority: text("seniority"),
    source: text("source").notNull(),
    sourceDetail: text("source_detail"),
    tags: text("tags").array(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }),
    website: text("website"),
  },
  (table) => [
    index("contacts_source_idx").on(table.source),
    index("contacts_created_at_idx").on(table.createdAt),
  ],
);

// ============================================================================
// 17. deal_stage_history
// ============================================================================
export const dealStageHistory = pgTable(
  "deal_stage_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    automated: boolean("automated"),
    changedAt: timestamp("changed_at", { withTimezone: true, mode: "string" }),
    changedBy: uuid("changed_by"),
    dealId: uuid("deal_id").notNull(),
    fromStageId: uuid("from_stage_id"),
    notes: text("notes"),
    toStageId: uuid("to_stage_id").notNull(),
    triggerSource: text("trigger_source"),
  },
  (table) => [
    index("deal_stage_history_deal_id_idx").on(table.dealId),
    index("deal_stage_history_changed_at_idx").on(table.changedAt),
  ],
);

// ============================================================================
// 18. deals
// ============================================================================
export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    amount: real("amount"),
    contactId: uuid("contact_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
    expectedCloseDate: timestamp("expected_close_date", { withTimezone: true, mode: "string" }),
    lostAt: timestamp("lost_at", { withTimezone: true, mode: "string" }),
    lostReason: text("lost_reason"),
    meetingBookedAt: timestamp("meeting_booked_at", { withTimezone: true, mode: "string" }),
    name: text("name").notNull(),
    notes: text("notes"),
    probability: integer("probability"),
    source: text("source").notNull(),
    stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true, mode: "string" }),
    stageId: uuid("stage_id").notNull(),
    status: text("status"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }),
    wonAt: timestamp("won_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("deals_stage_id_idx").on(table.stageId),
    index("deals_status_idx").on(table.status),
    index("deals_updated_at_idx").on(table.updatedAt),
    index("deals_created_at_idx").on(table.createdAt),
    index("deals_contact_id_idx").on(table.contactId),
  ],
);

// ============================================================================
// 19. email_replies
// ============================================================================
export const emailReplies = pgTable("email_replies", {
  id: uuid("id").primaryKey().defaultRandom(),
  autoDealCreated: boolean("auto_deal_created"),
  autoReplySent: boolean("auto_reply_sent"),
  autoReplyTemplate: text("auto_reply_template"),
  campaignId: uuid("campaign_id"),
  classificationModel: text("classification_model"),
  classificationPrompt: text("classification_prompt"),
  contactId: uuid("contact_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
  dealId: uuid("deal_id"),
  fromEmail: text("from_email"),
  intentScore: real("intent_score"),
  processedAt: timestamp("processed_at", { withTimezone: true, mode: "string" }),
  processingError: text("processing_error"),
  replyDate: timestamp("reply_date", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  replyText: text("reply_text"),
  sentiment: text("sentiment"),
  subject: text("subject"),
});

// ============================================================================
// 20. faqs
// ============================================================================
export const faqs = pgTable("faqs", {
  id: uuid("id").primaryKey().defaultRandom(),
  answer: text("answer").notNull(),
  category: text("category").notNull().default("General"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  displayOrder: integer("display_order").notNull().default(0),
  published: boolean("published").notNull().default(false),
  question: text("question").notNull(),
  tags: text("tags").array(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

// ============================================================================
// 21. integration_credentials
// ============================================================================
export const integrationCredentials = pgTable("integration_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  credentialType: text("credential_type").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  encryptionIv: text("encryption_iv").notNull(),
  encryptionTag: text("encryption_tag").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
  integrationId: uuid("integration_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

// ============================================================================
// 22. integrations
// ============================================================================
export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  config: jsonb("config").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  isConnected: boolean("is_connected").notNull().default(false),
  isEnabled: boolean("is_enabled").notNull().default(false),
  lastConnectedAt: timestamp("last_connected_at", { withTimezone: true, mode: "string" }),
  lastError: text("last_error"),
  provider: text("provider").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  userId: uuid("user_id").notNull(),
});

// ============================================================================
// 23. newsletter_articles
// ============================================================================
export const newsletterArticles = pgTable("newsletter_articles", {
  id: text("id").primaryKey(),
  author: text("author"),
  content: text("content"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  embedding: text("embedding"),
  engagement: jsonb("engagement"),
  keyInsights: text("key_insights").array(),
  metadata: jsonb("metadata"),
  psychologyPrinciple: text("psychology_principle"),
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "string" }).notNull(),
  scoreEngagement: real("score_engagement"),
  scoreFinal: real("score_final"),
  scoreReadability: real("score_readability"),
  scoreRecency: real("score_recency"),
  scoreRelevance: real("score_relevance"),
  source: text("source").notNull(),
  status: text("status").notNull().default("pending"),
  summary: text("summary"),
  title: text("title").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  url: text("url").notNull().unique(),
});

// ============================================================================
// 24. newsletter_campaigns
// ============================================================================
export const newsletterCampaigns = pgTable("newsletter_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleLimit: integer("article_limit").notNull().default(50),
  avgClickRate: real("avg_click_rate").notNull().default(0),
  avgOpenRate: real("avg_open_rate").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  description: text("description"),
  frequency: text("frequency").notNull(),
  name: text("name").notNull(),
  platforms: text("platforms").array().notNull().default(sql`ARRAY['email']::text[]`),
  psychologyMode: text("psychology_mode").notNull().default("curiosity-driven"),
  sendDays: integer("send_days").array().notNull().default(sql`ARRAY[2,3,4]::int[]`),
  sendTime: text("send_time").notNull(),
  sources: jsonb("sources").notNull().default([]),
  status: text("status").notNull().default("draft"),
  summarizerModel: text("summarizer_model").notNull().default("claude-3-5-sonnet-20241022"),
  templateId: uuid("template_id"),
  timezone: text("timezone").notNull().default("Australia/Perth"),
  totalClicks: integer("total_clicks").notNull().default(0),
  totalOpens: integer("total_opens").notNull().default(0),
  totalSent: integer("total_sent").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

// ============================================================================
// 25. newsletter_editions
// ============================================================================
export const newsletterEditions = pgTable(
  "newsletter_editions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleCount: integer("article_count").notNull().default(0),
    campaignId: uuid("campaign_id"),
    contentHtml: text("content_html").notNull(),
    contentText: text("content_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    createdBy: uuid("created_by"),
    curatedArticles: text("curated_articles").array().notNull().default(sql`ARRAY[]::text[]`),
    preheader: text("preheader"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: "string" }),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }),
    stats: jsonb("stats").notNull().default({}),
    status: text("status").notNull().default("draft"),
    subject: text("subject").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("newsletter_editions_status_idx").on(table.status),
    index("newsletter_editions_sent_at_idx").on(table.sentAt),
  ],
);

// ============================================================================
// 25b. newsletter_send_queue
// ============================================================================
export const newsletterSendQueue = pgTable("newsletter_send_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  editionId: uuid("edition_id").notNull(),
  subscriberId: uuid("subscriber_id").notNull(),
  toEmail: text("to_email").notNull(),
  subject: text("subject"),
  fromEmail: text("from_email"),
  fromName: text("from_name"),
  replyTo: text("reply_to"),
  status: text("status").notNull().default("queued"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: "string" }),
  sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "string" }),
  openedAt: timestamp("opened_at", { withTimezone: true, mode: "string" }),
  firstClickAt: timestamp("first_click_at", { withTimezone: true, mode: "string" }),
  bouncedAt: timestamp("bounced_at", { withTimezone: true, mode: "string" }),
  complainedAt: timestamp("complained_at", { withTimezone: true, mode: "string" }),
  providerMessageId: text("provider_message_id"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true, mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

// ============================================================================
// 26. newsletter_events
// ============================================================================
export const newsletterEvents = pgTable("newsletter_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  eventData: jsonb("event_data"),
  eventType: text("event_type").notNull(),
  ipAddress: text("ip_address"),
  subscriberId: uuid("subscriber_id"),
  userAgent: text("user_agent"),
});

// ============================================================================
// 27. newsletter_settings
// ============================================================================
export const newsletterSettings = pgTable("newsletter_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  branding: jsonb("branding").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  footer: jsonb("footer").notNull().default({}),
  sender: jsonb("sender").notNull().default({}),
  template: text("template").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

// ============================================================================
// 28. newsletter_subscribers
// ============================================================================
export const newsletterSubscribers = pgTable(
  "newsletter_subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessName: text("business_name"),
    consentGivenAt: timestamp("consent_given_at", { withTimezone: true, mode: "string" }),
    consentIpAddress: text("consent_ip_address"),
    consentUserAgent: text("consent_user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    industry: text("industry"),
    lastName: text("last_name"),
    onboarded: boolean("onboarded"),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true, mode: "string" }),
    referrer: text("referrer"),
    source: text("source"),
    unsubscribed: boolean("unsubscribed").notNull().default(false),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true, mode: "string" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    verificationToken: text("verification_token"),
    verificationTokenExpiresAt: timestamp("verification_token_expires_at", {
      withTimezone: true,
      mode: "string",
    }),
    verified: boolean("verified").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    // Indexes on filter columns used in dashboard count queries and subscriber lookups
    index("newsletter_subscribers_verified_idx").on(table.verified),
    index("newsletter_subscribers_unsubscribed_idx").on(table.unsubscribed),
  ],
);

// ============================================================================
// 29. oauth_states
// ============================================================================
export const oauthStates = pgTable("oauth_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  provider: text("provider").notNull(),
  returnUrl: text("return_url"),
  stateToken: text("state_token").notNull().unique(),
  userId: uuid("user_id").notNull(),
});

// ============================================================================
// 30. outreach_blocklist
// ============================================================================
export const outreachBlocklist = pgTable("outreach_blocklist", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
  email: text("email").notNull(),
  reason: text("reason"),
});

// ============================================================================
// 31. outreach_campaign_senders (composite primary key)
// ============================================================================
export const outreachCampaignSenders = pgTable(
  "outreach_campaign_senders",
  {
    campaignId: uuid("campaign_id").notNull(),
    senderId: uuid("sender_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.campaignId, table.senderId] })],
);

// ============================================================================
// 32. outreach_campaigns
// ============================================================================
export const outreachCampaigns = pgTable("outreach_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  bccRecipients: text("bcc_recipients").array(),
  ccRecipients: text("cc_recipients").array(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
  description: text("description"),
  email2Delay: integer("email_2_delay"),
  email3Delay: integer("email_3_delay"),
  email1Template: text("email_1_template").notNull().default("{{email_1_body}}"),
  email2Template: text("email_2_template").notNull().default("{{email_2_body}}"),
  email3Template: text("email_3_template").notNull().default("{{email_3_body}}"),
  email1SubjectTemplate: text("email_1_subject_template"),
  email2SubjectTemplate: text("email_2_subject_template"),
  email3SubjectTemplate: text("email_3_subject_template"),
  endDate: timestamp("end_date", { withTimezone: true, mode: "string" }),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name"),
  insertUnsubscribeHeader: boolean("insert_unsubscribe_header"),
  maxNewLeadsPerDay: integer("max_new_leads_per_day"),
  minSendIntervalMinutes: integer("min_send_interval_minutes"),
  name: text("name").notNull(),
  ownerId: uuid("owner_id"),
  randomSendIntervalMinutes: integer("random_send_interval_minutes"),
  startDate: timestamp("start_date", { withTimezone: true, mode: "string" }),
  status: text("status"),
  stopCompanyOnReply: boolean("stop_company_on_reply"),
  stopOnAutoReply: boolean("stop_on_auto_reply"),
  tags: text("tags").array(),
  testMode: boolean("test_mode"),
  textOnly: boolean("text_only"),
  textOnlyFirst: boolean("text_only_first"),
  totalBounced: integer("total_bounced"),
  totalClicked: integer("total_clicked"),
  totalContacts: integer("total_contacts"),
  totalDelivered: integer("total_delivered"),
  totalOpened: integer("total_opened"),
  totalReplied: integer("total_replied"),
  totalSent: integer("total_sent"),
  trackClicks: boolean("track_clicks"),
  trackOpens: boolean("track_opens"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }),
});

// ============================================================================
// 33. outreach_contacts
// ============================================================================
export const outreachContacts = pgTable("outreach_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  addedToCampaignAt: timestamp("added_to_campaign_at", { withTimezone: true, mode: "string" }),
  autoReplyDetected: boolean("auto_reply_detected"),
  autoReplyDetectedAt: timestamp("auto_reply_detected_at", { withTimezone: true, mode: "string" }),
  bounceCount: integer("bounce_count"),
  bouncedAt: timestamp("bounced_at", { withTimezone: true, mode: "string" }),
  campaignId: uuid("campaign_id"),
  company: text("company"),
  companyRevenue: real("company_revenue"),
  companySize: text("company_size"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
  currentStep: integer("current_step"),
  customFields: jsonb("custom_fields").notNull().default({}),
  email: text("email").notNull(),
  email1Body: text("email_1_body").notNull(),
  email1MessageId: text("email_1_message_id"),
  email1ResendId: text("email_1_resend_id"),
  email1SentAt: timestamp("email_1_sent_at", { withTimezone: true, mode: "string" }),
  email1Subject: text("email_1_subject").notNull(),
  email2Body: text("email_2_body").notNull(),
  email2ResendId: text("email_2_resend_id"),
  email2SentAt: timestamp("email_2_sent_at", { withTimezone: true, mode: "string" }),
  email2Subject: text("email_2_subject"),
  email3Body: text("email_3_body").notNull(),
  email3ResendId: text("email_3_resend_id"),
  email3SentAt: timestamp("email_3_sent_at", { withTimezone: true, mode: "string" }),
  email3Subject: text("email_3_subject").notNull(),
  emailProvider: text("email_provider"),
  emailSecurityGateway: text("email_security_gateway"),
  firstName: text("first_name"),
  foundedYear: integer("founded_year"),
  industry: text("industry"),
  jobTitle: text("job_title"),
  lastBounceType: text("last_bounce_type"),
  lastName: text("last_name"),
  linkedinUrl: text("linkedin_url"),
  location: text("location"),
  nextSendAt: timestamp("next_send_at", { withTimezone: true, mode: "string" }),
  optOut: boolean("opt_out"),
  phone: text("phone"),
  repliedAt: timestamp("replied_at", { withTimezone: true, mode: "string" }),
  researchReport: text("research_report"),
  securityLevel: text("security_level"),
  securityTier: text("security_tier"),
  senderAccountId: uuid("sender_account_id"),
  seniority: text("seniority"),
  status: text("status"),
  timezone: text("timezone"),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true, mode: "string" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }),
  websiteUrl: text("website_url"),
});

// ============================================================================
// 34. outreach_email_events
// ============================================================================
export const outreachEmailEvents = pgTable("outreach_email_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  bounceMessage: text("bounce_message"),
  bounceType: text("bounce_type"),
  contactId: uuid("contact_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
  emailNumber: integer("email_number").notNull(),
  eventType: text("event_type").notNull(),
  ipAddress: text("ip_address"),
  linkUrl: text("link_url"),
  resendEmailId: text("resend_email_id"),
  svixId: text("svix_id"),
  userAgent: text("user_agent"),
});

// ============================================================================
// 35. outreach_replies
// ============================================================================
export const outreachReplies = pgTable(
  "outreach_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aiSuggestedReply: text("ai_suggested_reply"),
    aiSummary: text("ai_summary"),
    bodyHtml: text("body_html"),
    bodyText: text("body_text"),
    campaignId: uuid("campaign_id").notNull(),
    contactId: uuid("contact_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    crmContactId: uuid("crm_contact_id"),
    crmDealId: uuid("crm_deal_id"),
    fromEmail: text("from_email").notNull(),
    inboundMessageId: text("inbound_message_id"),
    intent: text("intent"),
    isArchived: boolean("is_archived").notNull().default(false),
    isRead: boolean("is_read").notNull().default(false),
    pushedToCrmAt: timestamp("pushed_to_crm_at", { withTimezone: true, mode: "string" }),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    replyBody: text("reply_body"),
    replySenderEmail: text("reply_sender_email"),
    replySentAt: timestamp("reply_sent_at", { withTimezone: true, mode: "string" }),
    sentiment: text("sentiment"),
    subject: text("subject"),
  },
  (table) => [
    index("outreach_replies_sentiment_idx").on(table.sentiment),
    index("outreach_replies_received_at_idx").on(table.receivedAt),
    uniqueIndex("outreach_replies_inbound_message_id_unique")
      .on(table.inboundMessageId)
      .where(sql`inbound_message_id IS NOT NULL`),
  ],
);

// ============================================================================
// 36. outreach_schedules
// ============================================================================
export const outreachSchedules = pgTable("outreach_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
  isActive: boolean("is_active").notNull().default(false),
  name: text("name").notNull(),
  sendDays: text("send_days")
    .array()
    .notNull()
    .default(sql`ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday']::text[]`),
  sendWindowEnd: text("send_window_end").notNull().default("17:00"),
  sendWindowStart: text("send_window_start").notNull().default("09:00"),
  timezone: text("timezone").notNull().default("Australia/Perth"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }),
});

// ============================================================================
// 37. outreach_sender_accounts
// ============================================================================
export const outreachSenderAccounts = pgTable("outreach_sender_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
  dailyLimit: integer("daily_limit"),
  domain: text("domain").notNull(),
  email: text("email").notNull(),
  emailsSentToday: integer("emails_sent_today"),
  isActive: boolean("is_active"),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true, mode: "string" }),
  name: text("name").notNull(),
  signatureHtml: text("signature_html"),
  signaturePlainText: text("signature_plain_text"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }),
});

// ============================================================================
// 38. partners
// ============================================================================
export const partners = pgTable("partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
  displayOrder: integer("display_order"),
  logoUrl: text("logo_url").notNull(),
  name: text("name").notNull(),
  published: boolean("published"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }),
  websiteUrl: text("website_url"),
});

// ============================================================================
// 39. password_reset_tokens
// ============================================================================
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  tokenHash: text("token_hash").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true, mode: "string" }),
  userId: uuid("user_id").notNull(),
});

// ============================================================================
// 40. pipelines
// ============================================================================
export const pipelines = pgTable("pipelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  color: text("color"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
  description: text("description"),
  displayOrder: integer("display_order").notNull().default(0),
  icon: text("icon"),
  isActive: boolean("is_active"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }),
});

// ============================================================================
// 41. stages
// ============================================================================
export const stages = pgTable("stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  color: text("color"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
  description: text("description"),
  displayOrder: integer("display_order").notNull().default(0),
  isPositive: boolean("is_positive"),
  isTerminal: boolean("is_terminal"),
  name: text("name").notNull(),
  pipelineId: uuid("pipeline_id").notNull(),
  slug: text("slug").notNull(),
});

// ============================================================================
// 43. crm_sync_queue
// ============================================================================
export const crmSyncQueue = pgTable("crm_sync_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  operationType: text("operation_type").notNull(),
  payload: jsonb("payload").notNull(),
  submissionId: uuid("submission_id"),
  contactId: uuid("contact_id"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  lastError: text("last_error"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
});

// ============================================================================
// 43. site_settings
// ============================================================================
export const siteSettings = pgTable("site_settings", {
  id: text("id").primaryKey().default("default"),
  businessName: text("business_name"),
  abn: text("abn"),
  phone: text("phone"),
  email: text("email"),
  logoUrl: text("logo_url"),
  addressStreet: text("address_street"),
  addressCity: text("address_city"),
  addressState: text("address_state"),
  addressPostcode: text("address_postcode"),
  website: text("website"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

// ============================================================================
// 42. notifications
// ============================================================================
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    type: text("type").notNull(),
    priority: text("priority").notNull().default("INFO"),
    title: text("title").notNull(),
    message: text("message").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true, mode: "string" }),
    relatedId: text("related_id"),
    relatedType: text("related_type"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notifications_user_id_idx").on(t.userId),
    index("notifications_is_read_idx").on(t.isRead),
  ],
);

// ============================================================================
// 43. testimonials
// ============================================================================
export const testimonials = pgTable("testimonials", {
  id: uuid("id").primaryKey().defaultRandom(),
  avatarSrc: text("avatar_src").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  displayOrder: integer("display_order").notNull().default(0),
  googleReviewId: text("google_review_id").unique(),
  name: text("name").notNull(),
  published: boolean("published").notNull().default(false),
  quote: text("quote").notNull(),
  rating: integer("rating").notNull().default(5),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});
