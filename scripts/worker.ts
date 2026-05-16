/**
 * pg-boss worker process
 *
 * Start with: bun scripts/worker.ts
 *
 * Registers handlers for all queues and keeps the process alive.
 * Needs: DATABASE_URL, RESEND_API_KEY, OPENAI_API_KEY,
 *        NEXT_PUBLIC_SITE_URL, UNSUBSCRIBE_SECRET,
 *        DEFAULT_FROM_EMAIL, NEWSLETTER_FROM_EMAIL
 */

import "../lib/env-worker"; // loads .env.local if present (no-op in production)
import { PgBoss } from "pg-boss";
import { Resend } from "resend";

// Job processors
import { processCurateJob } from "../lib/newsletter/lib/queue/jobs/curate-job";
import { processGenerateJob } from "../lib/newsletter/lib/queue/jobs/generate-job";
import { processPublishJob } from "../lib/newsletter/lib/queue/jobs/publish-job";
import { processCleanupJob } from "../lib/newsletter/lib/queue/jobs/cleanup-job";
import { sendEmail } from "../lib/outreach/sending/sender";
import { processDueEmails } from "../lib/outreach/sending/processor";
import {
  getContact,
  getDomainSentLastHour,
  rescheduleContact,
} from "../lib/outreach/contacts/queries";
import { getCampaign, getCampaignSchedule } from "../lib/outreach/campaigns/queries";
import { isBusinessHour, scheduleToBusinessHours } from "../lib/outreach/scheduling/business-hours";
import { getDeliverabilityStrategy } from "../lib/outreach/sending/deliverability";
import { handleGenerateSeoReport } from "../lib/prospects/jobs/generate-seo-report";
import { handleProcessQuoCall } from "../lib/prospects/jobs/process-quo-call";
import { handlePollCapAnalytics } from "../lib/prospects/jobs/poll-cap-analytics";
import { handleFireFollowUp } from "../lib/prospects/jobs/fire-follow-up";
import {
  OUTREACH_BATCH_SIZE,
  OUTREACH_DEFAULT_TIMEZONE,
  OUTREACH_MAX_EMAILS_PER_DOMAIN_PER_HOUR,
  OUTREACH_DOMAIN_THROTTLE_DELAY_MINUTES,
} from "../lib/constants";

import type {
  SendWorkflowPayload,
  CurateWorkflowPayload,
  PublishWorkflowPayload,
  CleanupWorkflowPayload,
} from "../lib/newsletter/lib/queue/types";
import type {
  OutreachSendEmailPayload,
  GenerateSeoReportPayload,
  ProcessQuoCallPayload,
  ProspectFollowUpPayload,
} from "../lib/queue/index";

const QUEUE = {
  NEWSLETTER_SEND: "newsletter-send",
  NEWSLETTER_CURATE: "newsletter-curate",
  NEWSLETTER_PUBLISH: "newsletter-publish",
  NEWSLETTER_CLEANUP: "newsletter-cleanup",
  OUTREACH_SEND_EMAIL: "outreach-send-email",
  GENERATE_SEO_REPORT: "generate-seo-report",
  PROCESS_QUO_CALL: "process-quo-call",
  PROSPECT_FOLLOW_UP: "prospect-follow-up",
  POLL_CAP_ANALYTICS: "poll-cap-analytics",
} as const;

const SEO_REPORT_DEFAULT_CONCURRENCY = 2;
const PROCESS_QUO_CALL_DEFAULT_CONCURRENCY = 2;

const OUTREACH_PROCESS_QUEUE = "outreach-process";
const OUTREACH_PROCESS_CRON = "*/5 * * * *";

// Cap analytics polling: same 5-min cadence as outreach-process. Both are
// in-process pg-boss schedules so no external cron service is required.
const POLL_CAP_ANALYTICS_CRON = "*/5 * * * *";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[worker] DATABASE_URL is not set — exiting");
  process.exit(1);
}

const boss = new PgBoss({
  connectionString: databaseUrl,
  schedule: true,
  supervise: true,
});

boss.on("error", (err) => {
  console.error("[worker] pg-boss error:", err);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  return new Resend(apiKey);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleNewsletterSend([job]: PgBoss.Job<SendWorkflowPayload>[]): Promise<void> {
  console.log(`[worker] newsletter-send job ${job.id}`);
  const data = job.data;

  // Step 1: curate
  const curateResult = await processCurateJob({
    campaignId: data.campaignId,
    sources: data.sources,
    maxArticles: data.maxArticles,
    userId: data.userId,
  });

  if (!curateResult.success || curateResult.articles.length === 0) {
    throw new Error(`Curate step failed: ${curateResult.error ?? "no articles"}`);
  }

  // Step 2: generate
  const generateResult = await processGenerateJob({
    campaignId: data.campaignId,
    articles: curateResult.articles,
    userId: data.userId,
  });

  if (!generateResult.success) {
    throw new Error(`Generate step failed: ${generateResult.error ?? "unknown"}`);
  }

  // Step 3: publish
  const resend = getResend();
  const publishResult = await processPublishJob(
    {
      campaignId: data.campaignId,
      newsletterId: generateResult.newsletterId,
      subscriberIds: data.subscriberIds,
      batchSize: data.batchSize,
      userId: data.userId,
    },
    resend,
  );

  if (!publishResult.success) {
    throw new Error(
      `Publish step failed — sent: ${publishResult.sent}, failed: ${publishResult.failed}`,
    );
  }

  console.log(`[worker] newsletter-send job ${job.id} done — sent: ${publishResult.sent}`);
}

async function handleNewsletterCurate([job]: PgBoss.Job<CurateWorkflowPayload>[]): Promise<void> {
  console.log(`[worker] newsletter-curate job ${job.id}`);
  const result = await processCurateJob(job.data);
  if (!result.success) throw new Error(result.error ?? "Curate failed");
  console.log(
    `[worker] newsletter-curate job ${job.id} done — articles: ${result.articles.length}`,
  );
}

async function handleNewsletterPublish([job]: PgBoss.Job<PublishWorkflowPayload>[]): Promise<void> {
  console.log(`[worker] newsletter-publish job ${job.id}`);
  const resend = getResend();
  const result = await processPublishJob(job.data, resend);
  if (!result.success)
    throw new Error(`Publish failed — sent: ${result.sent}, failed: ${result.failed}`);
  console.log(`[worker] newsletter-publish job ${job.id} done — sent: ${result.sent}`);
}

async function handleNewsletterCleanup([job]: PgBoss.Job<CleanupWorkflowPayload>[]): Promise<void> {
  console.log(`[worker] newsletter-cleanup job ${job.id}`);
  const result = await processCleanupJob({
    olderThan: new Date(job.data.olderThan),
    types: job.data.types,
  });
  if (!result.success) throw new Error("Cleanup failed");
  console.log(`[worker] newsletter-cleanup job ${job.id} done`);
}

async function handleOutreachSendEmail([
  job,
]: PgBoss.Job<OutreachSendEmailPayload>[]): Promise<void> {
  console.log(`[worker] outreach-send-email job ${job.id}`);
  const { contactId, campaignId, emailNumber, unsubscribeUrl, forceTextOnly } = job.data;

  const resend = getResend();

  // Fetch contact
  const contact = await getContact(contactId);
  if (!contact) {
    console.warn(`[worker] contact ${contactId} not found — skipping`);
    return;
  }

  if (contact.status !== "active") {
    console.debug(`[worker] contact ${contactId} status=${contact.status} — skipping`);
    return;
  }
  if (contact.opt_out === true) {
    console.debug(`[worker] contact ${contactId} opted out — skipping`);
    return;
  }

  // Idempotency: skip if already sent
  if ((contact.current_step ?? 0) >= emailNumber) {
    console.debug(
      `[worker] contact ${contactId} already at step ${contact.current_step} — skipping`,
    );
    return;
  }

  // Fetch campaign
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    console.warn(`[worker] campaign ${campaignId} not found — skipping`);
    return;
  }
  if (campaign.status !== "active") {
    console.debug(`[worker] campaign ${campaignId} is ${campaign.status} — skipping`);
    return;
  }
  if (campaign.test_mode === true) {
    console.debug(`[worker] test_mode — would send email ${emailNumber} to ${contact.email}`);
    return;
  }

  // Business hours check
  const schedule = await getCampaignSchedule(campaignId);
  const businessHours = schedule ? scheduleToBusinessHours(schedule) : undefined;
  if (businessHours) {
    const timezone = contact.timezone || schedule?.timezone || OUTREACH_DEFAULT_TIMEZONE;
    if (!isBusinessHour(new Date(), timezone, businessHours)) {
      console.debug(`[worker] outside business hours (${timezone}) — rescheduling`);
      await rescheduleContact(contactId, 60);
      return;
    }
  }

  // Deliverability strategy
  const strategy = getDeliverabilityStrategy(contact, campaign, emailNumber);

  // Domain throttling
  const domain = contact.email.split("@")[1]?.toLowerCase() ?? "";
  if (domain) {
    const domainSentCount = await getDomainSentLastHour(domain);
    if (domainSentCount >= OUTREACH_MAX_EMAILS_PER_DOMAIN_PER_HOUR) {
      console.debug(`[worker] domain throttle ${domain} — rescheduling`);
      await rescheduleContact(contactId, OUTREACH_DOMAIN_THROTTLE_DELAY_MINUTES);
      return;
    }
  }

  const result = await sendEmail(
    resend,
    contact,
    campaign,
    emailNumber as 1 | 2 | 3,
    unsubscribeUrl,
    { forceTextOnly: forceTextOnly ?? strategy.forceTextOnly, businessHours },
  );

  if (!result.success) {
    throw new Error(`sendEmail failed: ${result.error}`);
  }

  console.log(`[worker] outreach-send-email job ${job.id} done — sent to ${contact.email}`);
}

async function handleGenerateSeoReportJob([
  job,
]: PgBoss.Job<GenerateSeoReportPayload>[]): Promise<void> {
  console.log(`[worker] generate-seo-report job ${job.id} — prospect ${job.data.prospectId}`);
  await handleGenerateSeoReport({ data: { prospectId: job.data.prospectId } });
  console.log(`[worker] generate-seo-report job ${job.id} done`);
}

async function handleProcessQuoCallJob([job]: PgBoss.Job<ProcessQuoCallPayload>[]): Promise<void> {
  console.log(`[worker] process-quo-call job ${job.id} — call ${job.data.callId}`);
  await handleProcessQuoCall({
    data: {
      callId: job.data.callId,
      hasSummary: job.data.hasSummary,
      hasTranscript: job.data.hasTranscript,
    },
  });
  console.log(`[worker] process-quo-call job ${job.id} done`);
}

async function handleProspectFollowUpJob([
  job,
]: PgBoss.Job<ProspectFollowUpPayload>[]): Promise<void> {
  console.log(`[worker] prospect-follow-up job ${job.id} — followUp ${job.data.followUpId}`);
  await handleFireFollowUp({ data: { followUpId: job.data.followUpId } });
  console.log(`[worker] prospect-follow-up job ${job.id} done`);
}

async function handlePollCapAnalyticsJob([job]: PgBoss.Job<unknown>[]): Promise<void> {
  console.log(`[worker] poll-cap-analytics job ${job.id}`);
  try {
    const result = await handlePollCapAnalytics();
    console.log(
      `[worker] poll-cap-analytics job ${job.id} done — prospects: ${result.prospectsPolled}, ` +
        `new events: ${result.newEventsWritten}, errors: ${result.errors}`,
    );
  } catch (err) {
    // The handler logs its own errors. Re-throw so pg-boss records the failure
    // and applies the queue's retry policy (1 retry, 60s delay).
    console.error(`[worker] poll-cap-analytics job ${job.id} failed:`, err);
    throw err;
  }
}

async function handleOutreachProcess(): Promise<void> {
  try {
    const result = await processDueEmails(getResend(), {
      batchSize: OUTREACH_BATCH_SIZE,
      unsubscribeBaseUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/unsubscribe`,
    });
    console.log(
      `[worker] outreach-process tick — sent: ${result.sent}, failed: ${result.failed}, skipped: ${result.skipped}`,
    );
  } catch (err) {
    // Swallow errors so a failed tick can't poison the schedule — next tick retries.
    console.error("[worker] outreach-process tick failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await boss.start();
  console.log("[worker] pg-boss started");

  // pg-boss v10+ requires queues to exist before work() / send().
  // createQueue is idempotent — safe to call on every boot.
  const allQueues = [...Object.values(QUEUE), OUTREACH_PROCESS_QUEUE];
  for (const name of allQueues) {
    await boss.createQueue(name);
  }
  console.log("[worker] queues ensured:", allQueues.join(", "));

  const opts = { pollingIntervalSeconds: 5 } as const;

  await boss.work(QUEUE.NEWSLETTER_SEND, opts, handleNewsletterSend);
  await boss.work(QUEUE.NEWSLETTER_CURATE, opts, handleNewsletterCurate);
  await boss.work(QUEUE.NEWSLETTER_PUBLISH, opts, handleNewsletterPublish);
  await boss.work(QUEUE.NEWSLETTER_CLEANUP, opts, handleNewsletterCleanup);
  await boss.work(QUEUE.OUTREACH_SEND_EMAIL, opts, handleOutreachSendEmail);

  // SEO report generation — runs an external CLI per prospect, uploads HTML
  // to object storage, and writes a timeline event. Concurrency is bounded
  // so a slow CLI can't starve other queues on this worker.
  const seoConcurrencyRaw = process.env.SEO_REPORT_WORKER_CONCURRENCY;
  const seoConcurrency =
    seoConcurrencyRaw && Number.isFinite(Number(seoConcurrencyRaw)) && Number(seoConcurrencyRaw) > 0
      ? Number(seoConcurrencyRaw)
      : SEO_REPORT_DEFAULT_CONCURRENCY;
  await boss.work(
    QUEUE.GENERATE_SEO_REPORT,
    { ...opts, localConcurrency: seoConcurrency },
    handleGenerateSeoReportJob,
  );
  console.log(`[worker] generate-seo-report handler — concurrency: ${seoConcurrency}`);

  // Quo call processing — fetches transcript + summary from Quo, runs the
  // AI extraction via gg-ai, and updates the CRM. Same concurrency rationale
  // as the SEO report worker: bounded so a slow Anthropic response can't
  // starve the rest of the queue. Tunable via PROCESS_QUO_CALL_CONCURRENCY.
  const quoConcurrencyRaw = process.env.PROCESS_QUO_CALL_CONCURRENCY;
  const quoConcurrency =
    quoConcurrencyRaw && Number.isFinite(Number(quoConcurrencyRaw)) && Number(quoConcurrencyRaw) > 0
      ? Number(quoConcurrencyRaw)
      : PROCESS_QUO_CALL_DEFAULT_CONCURRENCY;
  await boss.work(
    QUEUE.PROCESS_QUO_CALL,
    { ...opts, localConcurrency: quoConcurrency },
    handleProcessQuoCallJob,
  );
  console.log(`[worker] process-quo-call handler — concurrency: ${quoConcurrency}`);

  // Prospect follow-up reminders — fires at the scheduled `dueAt` of a
  // `prospect_follow_ups` row and creates a `follow_up_due` notification.
  // Low-concurrency (default 2) is plenty: each job is two SELECTs + one
  // INSERT, so this can't realistically saturate.
  await boss.work(QUEUE.PROSPECT_FOLLOW_UP, opts, handleProspectFollowUpJob);
  console.log(`[worker] prospect-follow-up handler registered`);

  // Recurring outreach processor — fires every 5 min in-process via pg-boss schedule.
  await boss.schedule(OUTREACH_PROCESS_QUEUE, OUTREACH_PROCESS_CRON);
  await boss.work(OUTREACH_PROCESS_QUEUE, handleOutreachProcess);
  console.log(`[worker] scheduled outreach-process every 5 min`);

  // Cap analytics polling — same in-process pg-boss schedule pattern.
  // localConcurrency: 1 so overlapping ticks queue instead of racing on the
  // same prospect set.
  await boss.schedule(QUEUE.POLL_CAP_ANALYTICS, POLL_CAP_ANALYTICS_CRON);
  await boss.work(
    QUEUE.POLL_CAP_ANALYTICS,
    { ...opts, localConcurrency: 1 },
    handlePollCapAnalyticsJob,
  );
  console.log(`[worker] scheduled poll-cap-analytics every 5 min`);

  console.log("[worker] all handlers registered — waiting for jobs");

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("[worker] SIGTERM received — stopping pg-boss");
    await boss.stop();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("[worker] SIGINT received — stopping pg-boss");
    await boss.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[worker] fatal error:", err);
  process.exit(1);
});
