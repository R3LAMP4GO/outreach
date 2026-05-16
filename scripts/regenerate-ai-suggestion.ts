/**
 * Regenerate `ai_suggested_reply` (and the related AI fields) for a single
 * outreach reply, using the current locked prompt in `lib/outreach/ai/reply-analyzer.ts`.
 *
 * Use this for backfilling replies that were processed before the prompt was tightened.
 *
 * Usage:
 *   bun scripts/regenerate-ai-suggestion.ts --reply-id <uuid>
 *   bun scripts/regenerate-ai-suggestion.ts --reply-id <uuid> --apply
 *
 * Dry-run by default — prints the new analysis without writing. Pass --apply to commit.
 */
import "../lib/env-worker";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and, ne, asc } from "drizzle-orm";
import {
  outreachReplies,
  outreachContacts,
  outreachCampaigns,
  outreachSenderAccounts,
} from "../lib/db/schema";
import { analyzeReply, type ConversationTurn } from "../lib/outreach/ai/reply-analyzer";

const args = process.argv.slice(2);
const replyIdIdx = args.indexOf("--reply-id");
const replyId = replyIdIdx >= 0 ? args[replyIdIdx + 1] : null;
const apply = args.includes("--apply");

if (!replyId) {
  console.error("Usage: bun scripts/regenerate-ai-suggestion.ts --reply-id <uuid> [--apply]");
  process.exit(2);
}

if (!process.env.DATABASE_URL || !process.env.OPENAI_API_KEY) {
  console.error("DATABASE_URL and OPENAI_API_KEY must be set in .env.local");
  process.exit(1);
}

const client = postgres(process.env.DATABASE_URL, { prepare: false });
const db = drizzle({ client });

console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}\n`);

// 1. Fetch reply + contact + campaign
const [reply] = await db
  .select({
    id: outreachReplies.id,
    contactId: outreachReplies.contactId,
    campaignId: outreachReplies.campaignId,
    bodyText: outreachReplies.bodyText,
    subject: outreachReplies.subject,
    receivedAt: outreachReplies.receivedAt,
    aiSummary: outreachReplies.aiSummary,
    aiSuggestedReply: outreachReplies.aiSuggestedReply,
    sentiment: outreachReplies.sentiment,
    intent: outreachReplies.intent,
  })
  .from(outreachReplies)
  .where(eq(outreachReplies.id, replyId))
  .limit(1);

if (!reply) {
  console.error(`Reply ${replyId} not found`);
  await client.end();
  process.exit(1);
}

const [contact] = await db
  .select({
    firstName: outreachContacts.firstName,
    lastName: outreachContacts.lastName,
    email: outreachContacts.email,
    company: outreachContacts.company,
    jobTitle: outreachContacts.jobTitle,
    senderAccountId: outreachContacts.senderAccountId,
    email1Body: outreachContacts.email1Body,
    email1SentAt: outreachContacts.email1SentAt,
    email2Body: outreachContacts.email2Body,
    email2SentAt: outreachContacts.email2SentAt,
    email3Body: outreachContacts.email3Body,
    email3SentAt: outreachContacts.email3SentAt,
  })
  .from(outreachContacts)
  .where(eq(outreachContacts.id, reply.contactId))
  .limit(1);

if (!contact) {
  console.error(`Contact ${reply.contactId} not found`);
  await client.end();
  process.exit(1);
}

const [campaign] = await db
  .select({ name: outreachCampaigns.name })
  .from(outreachCampaigns)
  .where(eq(outreachCampaigns.id, reply.campaignId))
  .limit(1);

if (!campaign) {
  console.error(`Campaign ${reply.campaignId} not found`);
  await client.end();
  process.exit(1);
}

// 2. Resolve sender first name (matches the auto-suggestion path in received.ts)
let senderFirstName = "Jake";
if (contact.senderAccountId) {
  const [sender] = await db
    .select({ name: outreachSenderAccounts.name })
    .from(outreachSenderAccounts)
    .where(eq(outreachSenderAccounts.id, contact.senderAccountId))
    .limit(1);
  if (sender?.name) {
    const first = sender.name.trim().split(/\s+/)[0];
    if (first) senderFirstName = first;
  }
}

// 3. Build conversation history (mirrors received.ts:buildConversationHistory)
const turns: ConversationTurn[] = [];
if (contact.email1Body && contact.email1SentAt) {
  turns.push({ role: "us", body: contact.email1Body, sentAt: contact.email1SentAt });
}
if (contact.email2Body && contact.email2SentAt) {
  turns.push({ role: "us", body: contact.email2Body, sentAt: contact.email2SentAt });
}
if (contact.email3Body && contact.email3SentAt) {
  turns.push({ role: "us", body: contact.email3Body, sentAt: contact.email3SentAt });
}

const priorReplies = await db
  .select({
    bodyText: outreachReplies.bodyText,
    receivedAt: outreachReplies.receivedAt,
    replyBody: outreachReplies.replyBody,
    replySentAt: outreachReplies.replySentAt,
  })
  .from(outreachReplies)
  .where(and(eq(outreachReplies.contactId, reply.contactId), ne(outreachReplies.id, replyId)))
  .orderBy(asc(outreachReplies.receivedAt));

for (const r of priorReplies) {
  if (r.bodyText && r.receivedAt) {
    turns.push({ role: "them", body: r.bodyText, sentAt: r.receivedAt });
  }
  if (r.replyBody && r.replySentAt) {
    turns.push({ role: "us", body: r.replyBody, sentAt: r.replySentAt });
  }
}
turns.sort((a, b) => (a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0));

// 4. Run the analyzer
const contactName =
  [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email;

console.log(`Reply:        ${replyId}`);
console.log(`Contact:      ${contactName} (${contact.email})`);
console.log(`Campaign:     ${campaign.name}`);
console.log(`Sender:       ${senderFirstName}`);
console.log(`History:      ${turns.length} turn(s)\n`);

console.log("─── BEFORE ───");
console.log(`sentiment:    ${reply.sentiment}`);
console.log(`intent:       ${reply.intent}`);
console.log(`ai_summary:   ${reply.aiSummary}`);
console.log(`ai_suggested_reply:`);
console.log(reply.aiSuggestedReply);
console.log();

const analysis = await analyzeReply(
  contactName,
  contact.company ?? null,
  campaign.name,
  reply.bodyText || "",
  reply.subject ?? null,
  contact.email1Body ?? null,
  contact.jobTitle ?? null,
  senderFirstName,
  turns,
);

console.log("─── AFTER ───");
console.log(`sentiment:    ${analysis.sentiment}`);
console.log(`intent:       ${analysis.intent}`);
console.log(`ai_summary:   ${analysis.summary}`);
console.log(`ai_suggested_reply:`);
console.log(analysis.suggestedReply);
console.log();

if (!apply) {
  console.log("Dry run complete. Re-run with --apply to commit.");
  await client.end();
  process.exit(0);
}

// 5. Update DB
await db
  .update(outreachReplies)
  .set({
    sentiment: analysis.sentiment,
    aiSummary: analysis.summary,
    aiSuggestedReply: analysis.suggestedReply,
    intent: analysis.intent,
  })
  .where(eq(outreachReplies.id, replyId));

console.log("✓ Reply updated in DB.");
await client.end();
process.exit(0);
