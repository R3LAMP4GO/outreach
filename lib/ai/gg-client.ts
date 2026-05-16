/**
 * gg-client: structured-output wrapper around @kenkaiiii/gg-ai.
 *
 * One job: take a Quo phone-call transcript and return CRM-shaped fields.
 *
 * Uses gg-ai's `stream()` with a forced tool call so the model must respond by
 * calling `save_call_extraction` with arguments matching the Zod schema below.
 * The awaited response yields a `StreamResponse`; the tool call lives inside
 * `response.message.content` as a `tool_call` ContentPart whose `args` we
 * re-validate with Zod before handing back to the caller.
 *
 * Standalone utility — not wired anywhere yet. The Quo webhook will call this.
 */

import { stream, type Message, type Tool, type ToolCall } from "@kenkaiiii/gg-ai";
import { z } from "zod";
import { AI_MODELS } from "./models";

// ── Schema ────────────────────────────────────────────────────────────────────

const callExtractionSchema = z.object({
  /** Name of the human we spoke to, if they gave one. */
  personName: z.string().nullable(),
  /** Their role at the business — "front desk", "owner", "manager", etc. */
  personRole: z.string().nullable(),
  /** Direct email mentioned on the call. */
  emailCaptured: z.string().email().nullable(),
  /** Direct phone line if different from the business main number. */
  phoneCaptured: z.string().nullable(),
  /** What kind of call this was. */
  sentiment: z.enum([
    "interested",
    "polite_no",
    "callback",
    "voicemail",
    "wrong_number",
    "gatekeeper",
  ]),
  /** True only if they explicitly asked us to call back / follow up. */
  followUpIntent: z.boolean(),
  /** Resolved ISO date `YYYY-MM-DD` for the follow-up, parsed against TODAY. */
  followUpDate: z.string().nullable(),
  /** Short phrase, e.g. "re: redesign", "after vacation". */
  followUpReason: z.string().nullable(),
  /** 3-5 concise bullets summarising the call. No fluff. */
  summaryBullets: z.array(z.string()).max(5),
  /** True unless the transcript references prior contact with this person. */
  isNewContact: z.boolean(),
});

export type CallExtraction = z.infer<typeof callExtractionSchema>;

// ── Prompt ────────────────────────────────────────────────────────────────────

const TOOL_NAME = "save_call_extraction";

const SYSTEM_PROMPT = `You extract CRM data from phone-call transcripts captured by the Quo agent.

Rules:
- Extract LITERAL facts only. Never speculate, infer beyond what was said, or fill blanks.
- Resolve every relative date ("tomorrow", "in a couple of days", "next week", "after the long weekend") against the TODAY value in the user message. Return a single ISO YYYY-MM-DD. "A couple of days" means TODAY + 2 or 3 days, pick one.
- Use null for any field that was not clearly stated. Null beats a guess.
- followUpIntent is true ONLY when the contact (or a gatekeeper acting for them) explicitly asks us to call back, follow up, or check in later. Polite signoffs do not count.
- sentiment categories: interested = engaged or wants more; polite_no = clean decline; callback = deferred to a future call; voicemail = no live person; wrong_number = not the right business; gatekeeper = reached front desk who would not put us through.
- summaryBullets: 3 to 5 short factual bullets. No salutations, no fluff.
- isNewContact is true unless the transcript references a prior conversation ("as we discussed", "thanks for calling back", existing relationship).
- Always call ${TOOL_NAME} exactly once with the extracted fields.`;

// ── Entry point ───────────────────────────────────────────────────────────────

export async function extractCallData(input: {
  transcript: string;
  summary: string;
  callDurationSeconds: number;
  callerNumber: string;
}): Promise<CallExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const today = new Date().toISOString().slice(0, 10);

  const tool: Tool = {
    name: TOOL_NAME,
    description:
      "Save the structured CRM extraction for this phone call. Must be called exactly once.",
    parameters: callExtractionSchema,
  };

  const userMessage = `TODAY: ${today}

Caller number: ${input.callerNumber}
Call duration: ${input.callDurationSeconds}s

<summary>
${input.summary}
</summary>

<transcript>
${input.transcript}
</transcript>

Call ${TOOL_NAME} with the extracted fields.`;

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  const response = await stream({
    provider: "openai",
    model: AI_MODELS.callExtraction,
    apiKey,
    messages,
    tools: [tool],
    toolChoice: { name: TOOL_NAME },
  });

  const content = response.message.content;
  if (typeof content === "string") {
    throw new Error(`Model returned text instead of a ${TOOL_NAME} tool call`);
  }

  const toolCall = content.find(
    (part): part is ToolCall => part.type === "tool_call" && part.name === TOOL_NAME,
  );
  if (!toolCall) {
    throw new Error(`Model did not call ${TOOL_NAME}`);
  }

  return callExtractionSchema.parse(toolCall.args);
}
