/**
 * Central model registry for OpenAI calls.
 *
 * Every AI call site MUST import its model id from this file — not hardcode
 * one. That way swapping a model (e.g. gpt-4.1 → gpt-5) is a single-line
 * change here, not a grep-and-replace across the codebase.
 *
 * Provider is always OpenAI (see CLAUDE.md). The "right" model per use case:
 *
 *   callExtraction     gpt-4.1-mini   forced tool call, literal-fact rules
 *                                     — mini handles it, ~8x cheaper than full
 *   newsletterSummary  gpt-4.1-mini   cached + batched summarisation, classic
 *                                     fit for the mini class
 *   replyAnalysis      gpt-4.1        LOCKED brand voice + ~30 hard prompt
 *                                     rules — quality matters, don't downgrade
 */

export const AI_MODELS = {
  /** lib/ai/gg-client.ts — Quo call transcript → structured CRM extraction */
  callExtraction: "gpt-4.1-mini",
  /** lib/newsletter/* — article → JSON summary (cached, batched) */
  newsletterSummary: "gpt-4.1-mini",
  /** lib/outreach/ai/reply-analyzer.ts — inbound reply → sentiment + drafted reply */
  replyAnalysis: "gpt-4.1",
} as const;

export type AIModelId = (typeof AI_MODELS)[keyof typeof AI_MODELS];
