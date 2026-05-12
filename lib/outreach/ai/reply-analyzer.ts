import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { stripQuotedText } from "@/lib/email/strip-quoted-history";

export interface ReplyAnalysis {
  sentiment: "positive" | "negative" | "neutral";
  summary: string;
  suggestedReply: string;
  intent:
    | "schedule_call"
    | "wants_info"
    | "objection"
    | "future_followup"
    | "not_interested"
    | "unsubscribe"
    | "other";
}

/**
 * A single turn in an outreach conversation, used to give the AI thread context
 * when classifying a new inbound reply.
 *
 * - `us`   = an outbound campaign email or admin reply we sent
 * - `them` = an inbound reply from the contact
 */
export interface ConversationTurn {
  role: "us" | "them";
  body: string;
  sentAt: string;
}

/** Defensive cap so a runaway thread can't blow the prompt budget. */
const MAX_HISTORY_TURNS = 20;

const replyAnalysisSchema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  summary: z.string(),
  suggestedReply: z.string(),
  intent: z.enum([
    "schedule_call",
    "wants_info",
    "objection",
    "future_followup",
    "not_interested",
    "unsubscribe",
    "other",
  ]),
});

const SYSTEM_PROMPT = `<role>
You draft reply suggestions on behalf of the human signing the email at __YOUR_BRAND__. The sender's first name is provided in the user prompt inside a <sender> tag — use it verbatim in the signoff. Your job: classify the latest inbound reply, summarise it in one sentence, and draft the next reply in the sender's voice.
</role>

<voice>
Direct. Plainspoken. Confident. Australian English (e.g. "organise", "realise", "favour"). Masculine register — short sentences, no hedging, no fluff.

Format every suggestedReply EXACTLY as:
Hi {their_first_name},

{body — 2 to 4 short sentences}

Thanks,
{sender_first_name}

Hard rules:
- NEVER use em-dashes (—) OR en-dashes (–). Use a comma, full stop, or colon instead.
- NEVER use square brackets [ ] anywhere in the reply. No '[calendar link]', no '[Tuesday 10am]', no placeholders of any kind. If you would write a placeholder, write the real value or omit the sentence.
- NEVER propose specific times, days, or time ranges (e.g. 'Tuesday 10-11am', 'Thursday morning', 'next week'). You do NOT have access to the sender's calendar. Always send the calendar link and let the contact pick.
- The calendar link is ALWAYS written verbatim as the full URL: __YOUR_CAL_LINK__ . Never as '[calendar link]', '[link]', or 'my calendar' without the URL.
- NEVER use these phrases: "AI automation", "AI-powered", "circle back", "touch base", "reach out", "I hope this finds you well", "synergy", "leverage", "transform", "just wanted to".
- Open with an acknowledgement of what they actually said. No generic openers.
- If they asked a question, answer it before asking anything back.
- If you're genuinely unsure of sentiment, classify as "neutral" rather than guessing.
- The suggestedReply value is PLAIN EMAIL TEXT. It MUST end with the sender's first name on its own line. NEVER append a quotation mark, closing brace, bracket, semicolon, slash, or any trailing punctuation after the sender's name. The string ends at the last letter of the name, full stop.
</voice>

<business_context>
__YOUR_BRAND__ builds custom systems. Real engineering: CRMs, outreach platforms, internal admin tools, full web apps. Tailored to the client, not off-the-shelf.

We do NOT describe our work as "AI automation" or "AI-powered". We say "we build systems" or "tailored systems".

Pricing: starts at $5,000 AUD. Typical builds run 4 to 8 weeks.

Calendar booking link (use verbatim when proposing a call): __YOUR_CAL_LINK__

We use the WAVE Framework: Workflow, Architecture, Validation, Execution. Mention it when relevant, do not over-explain it.
</business_context>

<task_rules>
You will be given the contact, campaign context, and either a single reply or a full thread. Classify the LATEST inbound message in the context of the whole thread. A "not interested" earlier followed by "actually maybe Q3" is now a future_followup, not a hard decline.

## Sentiment
- positive: interested, asking questions, open to a call, wants to schedule
- negative: not interested, unsubscribe, wrong person, hostile
- neutral: out of office, unclear, forwarding, deferred without warmth

## Intent (pick the most specific)
- schedule_call: explicitly wants to book — "let's chat", "send me a time", asking for availability
- wants_info: interested but asking for details first — pricing, case studies, scope, timelines
- objection: interested but raising a specific concern that needs to be answered — budget, timing, authority, fit
- future_followup: soft no with the door open — "not the right time", "maybe next quarter", "ask again in Q3", "not now but stay in touch"
- not_interested: clean decline, already have a provider, not relevant, not a fit
- unsubscribe: explicit removal request — "remove me", "don't email again", "take me off your list"
- other: out of office, auto-reply, forwarded to colleague, genuinely unclear

## Reply guidance per intent
- schedule_call: short and friendly. Drop the calendar URL verbatim and tell them to grab whatever suits. NEVER propose specific times. 1 to 2 sentences in the body.
- wants_info: answer their question briefly and concretely, then invite a call with the calendar URL verbatim
- objection: address the specific concern head-on. If pricing: be transparent ($5k+ AUD, 4-8 week builds). If timing: offer to revisit. If authority: ask who else should be in the room.
- future_followup: agree to circle back at the timeframe they named, no pressure, leave it warm
- not_interested: short, gracious, leave the door open. One or two sentences.
- unsubscribe: confirm removal, apologise briefly, no pitch
- other: short acknowledgement, ask for clarification if needed

Suggested replies are 2 to 4 sentences in the body. Do not write subject lines.
</task_rules>

<examples>
Examples are split across <analysis> and <suggested_reply> tags so the email body is shown as plain text, not JSON. Your actual output is structured JSON — but the suggestedReply field MUST contain only the plain email text shown between the <suggested_reply> tags. No quotes, braces, or syntax characters around it.

<example>
<input>
<sender>Jake</sender>
Contact: Sarah Nguyen at Bluewater Logistics
Latest reply: Thanks for reaching out. Honestly we're swamped through end of FY. Maybe ping me again in Q3?
</input>
<analysis>
intent: future_followup
sentiment: neutral
summary: Sarah is interested in principle but too busy until Q3.
</analysis>
<suggested_reply>
Hi Sarah,

No worries, end of FY is brutal. I'll put a note in the calendar to come back to you in Q3 when things settle.

Thanks,
Jake
</suggested_reply>
</example>

<example>
<input>
<sender>Aaron</sender>
Contact: Mark Davis at Coastline Build Co
Latest reply: Looks interesting. What does something like this actually cost, and how long does it take?
</input>
<analysis>
intent: wants_info
sentiment: positive
summary: Mark wants pricing and timeline before going further.
</analysis>
<suggested_reply>
Hi Mark,

Fair question. Builds start at $5,000 AUD and typically run 4 to 8 weeks depending on scope. Happy to walk you through what that looks like for your setup, grab a 20-min slot here: __YOUR_CAL_LINK__

Thanks,
Aaron
</suggested_reply>
</example>

<example>
<input>
<sender>Jake</sender>
Contact: Priya Shah at Northwind Group
Latest reply: Honestly $5k feels steep for what you're describing. We've had quotes around half that.
</input>
<analysis>
intent: objection
sentiment: neutral
summary: Priya thinks the pricing is high compared to other quotes she's received.
</analysis>
<suggested_reply>
Hi Priya,

Fair. The cheaper quotes are usually template builds, ours are custom and built around your actual workflow, which is where the difference sits. Worth a quick call to compare scope side by side? __YOUR_CAL_LINK__

Thanks,
Jake
</suggested_reply>
</example>

<example>
<input>
<sender>Jake</sender>
Contact: Josh Mas
Latest reply: Send me through some times you're available, and then we can work our way around from there.
</input>
<analysis>
intent: schedule_call
sentiment: positive
summary: Josh wants to book a call and is asking for availability.
</analysis>
<suggested_reply>
Hi Josh,

Easiest way is to grab whatever suits from my calendar: __YOUR_CAL_LINK__ . Lock in any slot that works and I'll see you there.

Thanks,
Jake
</suggested_reply>
</example>

<example>
<input>
<sender>Jake</sender>
Contact: Tom Reilly at Harbour & Co
Latest reply: Appreciate the note but we've already got a provider we're happy with.
</input>
<analysis>
intent: not_interested
sentiment: negative
summary: Tom is happy with his current provider and not looking to switch.
</analysis>
<suggested_reply>
Hi Tom,

All good, glad it's working. If anything ever changes, you know where to find me.

Thanks,
Jake
</suggested_reply>
</example>
</examples>`;

/**
 * Analyze an inbound reply using Claude to determine sentiment, intent,
 * generate a summary, and suggest a follow-up reply.
 *
 * When `conversationHistory` is supplied, the prompt is reshaped to give the
 * model the full thread in chronological order; classification then reflects
 * the latest message in that context. Omit it (or pass an empty array) for the
 * single-reply path used for first replies.
 *
 * `senderFirstName` is required — it's injected into the prompt verbatim and
 * the model uses it as the signoff. Callers must resolve who is signing
 * (campaign sender for auto-suggestions, logged-in admin for manual regens).
 */
export async function analyzeReply(
  contactName: string,
  company: string | null,
  campaignName: string,
  replyText: string,
  originalSubject: string | null | undefined,
  originalEmailBody: string | null | undefined,
  jobTitle: string | null | undefined,
  senderFirstName: string,
  conversationHistory?: ConversationTurn[],
): Promise<ReplyAnalysis> {
  try {
    const cleanedText = stripQuotedText(replyText);

    const contactLine = [
      contactName,
      jobTitle ? `(${jobTitle})` : null,
      company ? `at ${company}` : null,
    ]
      .filter(Boolean)
      .join(" ");

    const senderTag = `<sender>${senderFirstName}</sender>`;
    const header = `${senderTag}
Contact: ${contactLine}
Campaign: ${campaignName}${originalSubject ? `\nOriginal subject: ${originalSubject}` : ""}`;

    let prompt: string;
    if (conversationHistory && conversationHistory.length > 0) {
      // Cap defensively and keep the most recent turns.
      const trimmed = conversationHistory.slice(-MAX_HISTORY_TURNS);
      const turnsXml = trimmed
        .map((turn) => {
          const tag = turn.role === "us" ? "us" : "them";
          const body = stripQuotedText(turn.body);
          return `<turn role="${tag}" sent_at="${turn.sentAt}">\n${body}\n</turn>`;
        })
        .join("\n");

      prompt = `${header}

This is an ongoing conversation. Earlier turns are provided for context; classify the LATEST reply (shown last) in light of the full thread.

<conversation>
${turnsXml}
<turn role="them" sent_at="latest">
${cleanedText}
</turn>
</conversation>

Classify intent and sentiment of the latest reply, write a one-sentence summary, and draft the next reply signed by ${senderFirstName}.`;
    } else {
      prompt = `${header}
${originalEmailBody ? `\n<original_email>\n${originalEmailBody}\n</original_email>\n` : ""}
Analyze the following reply and classify intent, sentiment, write a one-sentence summary, and draft the next reply signed by ${senderFirstName}:

<reply>
${cleanedText}
</reply>`;
    }

    const { object } = await generateObject({
      model: anthropic("claude-sonnet-4-6"),
      system: SYSTEM_PROMPT,
      prompt,
      schema: replyAnalysisSchema,
    });

    return {
      ...object,
      suggestedReply: sanitizeSuggestedReply(object.suggestedReply),
      summary: sanitizeSuggestedReply(object.summary),
    };
  } catch (err) {
    logger.error("Error analyzing reply:", err);
    return { sentiment: "neutral", summary: "", suggestedReply: "", intent: "other" };
  }
}

/**
 * Defensive sanitiser for model output. Sonnet 4.6 occasionally leaks JSON
 * structural characters into a string field (e.g. trailing `'}`, `"}`,
 * stray closing braces) when the prompt contains JSON-shaped examples or
 * the model gets confused at the boundary of the structured output.
 *
 * We tightened the prompt to remove JSON-shaped examples; this is a belt-
 * and-braces backstop so a corrupted output never reaches the user.
 *
 * Strips:
 *  - Trailing whitespace.
 *  - Trailing combinations of `'`, `"`, `}`, `]`, `;`, `\\`, and whitespace
 *    that have no business at the end of an email body.
 */
export function sanitizeSuggestedReply(text: string): string {
  if (!text) return text;
  // Right-strip any trailing run of JSON-syntax/escape characters and
  // surrounding whitespace. We deliberately do NOT touch the leading edge
  // — a legitimate reply never starts with these characters but might
  // legitimately contain them mid-body (e.g. quotes around a phrase).
  return text.replace(/[\s'"`}\]\\;]+$/u, "");
}
