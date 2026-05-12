/**
 * Eval harness for the outreach reply analyzer.
 *
 * Runs a small set of representative reply scenarios through `analyzeReply`
 * against the live Anthropic API and prints intent/sentiment pass/fail plus
 * the generated suggested reply for human review.
 *
 * Run: `bun scripts/eval-replies.ts`
 *
 * Exits non-zero if any case mis-classifies, so it can become a CI check
 * later if desired.
 */

import "../lib/env-worker";
import {
  analyzeReply,
  type ConversationTurn,
  type ReplyAnalysis,
} from "../lib/outreach/ai/reply-analyzer";

interface EvalCase {
  name: string;
  contactName: string;
  company: string | null;
  campaignName: string;
  replyText: string;
  jobTitle?: string | null;
  originalSubject?: string | null;
  originalEmailBody?: string | null;
  senderFirstName: string;
  conversationHistory?: ConversationTurn[];
  expectedIntent: ReplyAnalysis["intent"];
  expectedSentiment: ReplyAnalysis["sentiment"];
}

const CASES: EvalCase[] = [
  {
    name: "schedule_call — clear ask for time",
    contactName: "Sarah Nguyen",
    company: "Bluewater Logistics",
    campaignName: "Q1 Logistics Outreach",
    replyText: "Yeah happy to chat. When works for you next week?",
    senderFirstName: "Jake",
    expectedIntent: "schedule_call",
    expectedSentiment: "positive",
  },
  {
    name: "wants_info — asks pricing",
    contactName: "Mark Davis",
    company: "Coastline Build Co",
    campaignName: "Construction Outreach",
    replyText: "Looks interesting. What does something like this cost, and how long does it take?",
    senderFirstName: "Jake",
    expectedIntent: "wants_info",
    expectedSentiment: "positive",
  },
  {
    name: "objection — pricing pushback",
    contactName: "Priya Shah",
    company: "Northwind Group",
    campaignName: "SaaS Outreach",
    replyText:
      "Honestly $5k feels steep for what you're describing. We've had quotes around half that.",
    senderFirstName: "Jake",
    expectedIntent: "objection",
    expectedSentiment: "neutral",
  },
  {
    name: "objection — needs approval",
    contactName: "Ben Carter",
    company: "Eastside Industries",
    campaignName: "B2B Outreach",
    replyText:
      "Interested in principle but I'd need to run it past our ops director before committing to anything.",
    senderFirstName: "Jake",
    expectedIntent: "objection",
    expectedSentiment: "positive",
  },
  {
    name: "future_followup — soft no with door open",
    contactName: "Lara Mitchell",
    company: "Harbour & Co",
    campaignName: "EOFY Push",
    replyText:
      "Thanks for reaching out. We're swamped through end of FY. Maybe ping me again in Q3?",
    senderFirstName: "Jake",
    expectedIntent: "future_followup",
    expectedSentiment: "neutral",
  },
  {
    name: "not_interested — has provider",
    contactName: "Tom Reilly",
    company: "Reliance Partners",
    campaignName: "B2B Outreach",
    replyText: "Appreciate the note but we've already got a provider we're happy with.",
    senderFirstName: "Jake",
    expectedIntent: "not_interested",
    expectedSentiment: "negative",
  },
  {
    name: "unsubscribe — explicit removal",
    contactName: "Chris Doyle",
    company: null,
    campaignName: "B2B Outreach",
    replyText: "Please remove me from your list and don't contact me again.",
    senderFirstName: "Jake",
    expectedIntent: "unsubscribe",
    expectedSentiment: "negative",
  },
  {
    name: "other — out of office",
    contactName: "Karen Liu",
    company: "Atlas Systems",
    campaignName: "B2B Outreach",
    replyText:
      "I am currently out of the office until 14 May with limited access to email. For urgent matters please contact reception.",
    senderFirstName: "Jake",
    expectedIntent: "other",
    expectedSentiment: "neutral",
  },
  {
    // Real-world reproduction: production hit this exact case and the model
    // ignored every format rule (no greeting, no signoff, em-dashes, used
    // "automating", talked about helping the sender's own company instead of
    // the prospect's company, proposed a vague time "this week").
    name: "wants_info — with conversationHistory (real production case)",
    contactName: "Josh Mas",
    company: null,
    campaignName: "__YOUR_BRAND__ Outreach",
    originalSubject: "Quick question about your workflow",
    originalEmailBody:
      'Hey Jake,<br><br>I have been building AI systems that cut admin time by about 40% for small teams.<br><br>Curious whether you find yourself doing a lot of manual data entry or chasing things between apps.<br><br>Worth a quick chat?<br><br>Cheers,<br>Jake<br><br>If you\'d prefer not to receive these emails, <a href="{{unsubscribe_url}}">unsubscribe here</a>.',
    // Includes the actual quoted history from production — stripQuotedText
    // should clean it but the model may still see fragments.
    replyText:
      "Hey mate,\n\u200b\n\u200bCan you explain to me the way you would like to help please?\n\nRegards,\n\n__SENDER_NAME__\nOwner | __YOUR_BRAND__\nM | __SENDER_PHONE__   E | __SENDER_EMAIL__\nW | www.__YOUR_DOMAIN__\n\nOn Thu, 30 Apr 2026 03:52:17 GMT __SENDER_NAME__ <__SENDER_EMAIL__> wrote:\n\nHey,\nI have been looking at ways AI can handle the repetitive side of client onboarding and follow-up for service businesses.\nThought it might be relevant to what you are building.\nOpen to a quick call?\nCheers,\n__SENDER_FIRST_NAME__",
    senderFirstName: "Jake",
    conversationHistory: [
      {
        role: "us",
        sentAt: "2026-04-30T03:52:00.000Z",
        body: "Hey Jake,\n\nI have been building AI systems that cut admin time by about 40% for small teams.\n\nCurious whether you find yourself doing a lot of manual data entry or chasing things between apps.\n\nWorth a quick chat?\n\nCheers,\nJake",
      },
    ],
    expectedIntent: "wants_info",
    expectedSentiment: "positive",
  },
  {
    // Real production failure: a short follow-up reply mid-thread caused the
    // model to drop the greeting, drop the signoff, drop the calendar URL,
    // use the banned phrase "AI systems", and propose a specific duration.
    name: "wants_info — short mid-thread follow-up (real production failure)",
    contactName: "Josh Mas",
    company: null,
    campaignName: "__YOUR_BRAND__ Outreach",
    originalSubject: "Quick question about your workflow",
    originalEmailBody:
      "Hey Jake,<br><br>I have been building AI systems that cut admin time by about 40% for small teams.<br><br>Curious whether you find yourself doing a lot of manual data entry or chasing things between apps.<br><br>Worth a quick chat?<br><br>Cheers,<br>Jake",
    replyText: "What else have you got to offer?",
    senderFirstName: "Jake",
    // No admin reply was sent between Josh's two inbound messages — production
    // had only two outbound-then-inbound-then-inbound turns when this fired.
    conversationHistory: [
      {
        role: "us",
        sentAt: "2026-04-30T03:52:00.000Z",
        body: "Hey Jake,\n\nI have been building AI systems that cut admin time by about 40% for small teams.\n\nCurious whether you find yourself doing a lot of manual data entry or chasing things between apps.\n\nWorth a quick chat?\n\nCheers,\nJake",
      },
      {
        role: "them",
        sentAt: "2026-04-30T04:11:00.000Z",
        body: "This is very interesting. Can you give me some evidence based on all of this? Maybe some people you've helped before?",
      },
    ],
    expectedIntent: "wants_info",
    expectedSentiment: "positive",
  },
];

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

function badge(ok: boolean, label: string): string {
  return ok ? `${colors.green}✓ ${label}${colors.reset}` : `${colors.red}✗ ${label}${colors.reset}`;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set. Add it to .env.local.");
    process.exit(1);
  }

  let failures = 0;
  console.log(
    `${colors.bold}Running ${CASES.length} eval cases against live Anthropic API...${colors.reset}\n`,
  );

  for (const c of CASES) {
    const startedAt = Date.now();
    const result = await analyzeReply(
      c.contactName,
      c.company,
      c.campaignName,
      c.replyText,
      c.originalSubject ?? null,
      c.originalEmailBody ?? null,
      c.jobTitle ?? null,
      c.senderFirstName,
      c.conversationHistory,
    );
    const ms = Date.now() - startedAt;

    const intentOk = result.intent === c.expectedIntent;
    const sentimentOk = result.sentiment === c.expectedSentiment;
    if (!intentOk || !sentimentOk) failures += 1;

    console.log(
      `${colors.cyan}${colors.bold}${c.name}${colors.reset} ${colors.dim}(${ms}ms)${colors.reset}`,
    );
    console.log(`  ${colors.dim}reply:${colors.reset} ${c.replyText}`);
    console.log(
      `  ${badge(intentOk, `intent: ${result.intent}`)} ${colors.dim}(expected ${c.expectedIntent})${colors.reset}`,
    );
    console.log(
      `  ${badge(sentimentOk, `sentiment: ${result.sentiment}`)} ${colors.dim}(expected ${c.expectedSentiment})${colors.reset}`,
    );
    console.log(`  ${colors.dim}summary:${colors.reset} ${result.summary}`);
    console.log(`  ${colors.dim}suggestedReply:${colors.reset}`);
    for (const line of result.suggestedReply.split("\n")) {
      console.log(`    ${line}`);
    }
    console.log();
  }

  const total = CASES.length;
  const passed = total - failures;
  console.log(
    `${colors.bold}Result:${colors.reset} ${passed}/${total} passed${failures > 0 ? `${colors.red}, ${failures} failed${colors.reset}` : ""}`,
  );

  // Voice spot-check across all generated replies
  const allReplies = "(replies will be regenerated per run)";
  void allReplies;

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Eval run crashed:", err);
  process.exit(1);
});
