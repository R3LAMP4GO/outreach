/**
 * Quo (formerly OpenPhone) REST client.
 *
 * Server-only. Wraps the Quo v1 REST API with:
 *   - typed request/response shapes (Zod-validated, see ./types)
 *   - one auth header (`Authorization: <API_KEY>` — NO Bearer prefix,
 *     verified against https://www.openphone.com/docs/api-reference/authentication
 *     and real-world usage in activepieces/open-phone)
 *   - retry-once on transient 5xx
 *   - process-wide rate limiting at the documented 10 req/s ceiling
 *
 * Not wired anywhere yet. The Quo webhook handler will be the first caller.
 */

import "server-only";

import Bottleneck from "bottleneck";
import { z } from "zod";
import {
  quoCallSchema,
  quoCallSummarySchema,
  quoCallTranscriptSchema,
  quoContactSchema,
  quoEnvelope,
  quoErrorSchema,
  quoMessageSchema,
  type QuoCall,
  type QuoCallSummary,
  type QuoCallTranscript,
  type QuoContact,
  type QuoErrorBody,
  type QuoMessage,
} from "./types";

// ─── Config ──────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = "https://api.openphone.com/v1";

function getApiKey(): string {
  const key = process.env.QUO_API_KEY;
  if (!key) {
    throw new Error("QUO_API_KEY is not set. Add it to .env.local (see .env.example).");
  }
  return key;
}

function getBaseUrl(): string {
  return (process.env.QUO_API_BASE ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

// ─── Error class ─────────────────────────────────────────────────────────────

export class QuoApiError extends Error {
  readonly status: number;
  readonly body: QuoErrorBody | string | null;

  constructor(status: number, body: QuoErrorBody | string | null, message?: string) {
    const summary =
      message ??
      (body && typeof body === "object" && body.message
        ? body.message
        : `Quo API request failed with status ${status}`);
    super(summary);
    this.name = "QuoApiError";
    this.status = status;
    this.body = body;
  }
}

// ─── Rate limiter ────────────────────────────────────────────────────────────
// Quo limits each API key to 10 requests/second (docs/api-reference/rate-limits).
// 100ms minTime spaces requests evenly; maxConcurrent caps in-flight work
// so a burst from multiple call sites doesn't spike past the ceiling.

let limiter: Bottleneck | null = null;
function getLimiter(): Bottleneck {
  if (!limiter) {
    limiter = new Bottleneck({ minTime: 100, maxConcurrent: 5 });
  }
  return limiter;
}

// ─── Core fetch helper ───────────────────────────────────────────────────────

interface QuoFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Treat HTTP 404 as `null` instead of throwing. */
  allow404?: boolean;
}

interface QuoFetchResult<T> {
  data: T | null;
  status: number;
}

async function quoFetch<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  opts: QuoFetchOptions = {},
): Promise<QuoFetchResult<z.infer<T>>> {
  const url = `${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: {
      Authorization: getApiKey(),
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  };

  const response = await getLimiter().schedule(() => fetchWithRetry(url, init));

  if (opts.allow404 && response.status === 404) {
    return { data: null, status: 404 };
  }

  if (!response.ok) {
    const parsed = await parseErrorBody(response);
    throw new QuoApiError(response.status, parsed);
  }

  // Some endpoints (DELETE) legitimately return empty bodies. Schema-validate
  // a JSON payload when we have one; otherwise return null.
  const text = await response.text();
  if (!text) {
    return { data: null, status: response.status };
  }

  const json = JSON.parse(text) as unknown;
  const data = schema.parse(json) as z.infer<T>;
  return { data, status: response.status };
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const first = await fetch(url, init);
  if (first.status < 500 || first.status >= 600) {
    return first;
  }
  // Single retry on 5xx — covers the transient Cloudflare / upstream blip
  // without turning every real outage into a 2× hammer.
  return fetch(url, init);
}

async function parseErrorBody(response: Response): Promise<QuoErrorBody | string | null> {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    const json = JSON.parse(text) as unknown;
    const parsed = quoErrorSchema.safeParse(json);
    if (parsed.success) return parsed.data;
    return text;
  } catch {
    return text;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Send an SMS through the configured Quo number.
 *
 * `from` accepts either an E.164 phone number you own (`+15551234567`) OR a
 * Quo `phoneNumberId` (`PN…`). The wire API takes `to` as an array; we accept
 * a single recipient for convenience.
 */
export async function sendSms(args: {
  from: string;
  to: string;
  content: string;
}): Promise<QuoMessage> {
  const { data } = await quoFetch("/messages", quoEnvelope(quoMessageSchema), {
    method: "POST",
    body: {
      from: args.from,
      to: [args.to],
      content: args.content,
    },
  });
  if (!data) {
    throw new QuoApiError(500, null, "Quo returned an empty body for sendSms");
  }
  return data.data;
}

/** Fetch metadata for a single call. */
export async function getCall(callId: string): Promise<QuoCall> {
  const { data } = await quoFetch(
    `/calls/${encodeURIComponent(callId)}`,
    quoEnvelope(quoCallSchema),
  );
  if (!data) {
    throw new QuoApiError(500, null, "Quo returned an empty body for getCall");
  }
  return data.data;
}

/**
 * Fetch the AI-generated summary for a call. Returns `null` when the summary
 * doesn't exist yet (Quo returns 404 until the post-call job has finished).
 */
export async function getCallSummary(callId: string): Promise<QuoCallSummary | null> {
  const { data } = await quoFetch(
    `/call-summaries/${encodeURIComponent(callId)}`,
    quoEnvelope(quoCallSummarySchema),
    { allow404: true },
  );
  return data?.data ?? null;
}

/**
 * Fetch the dialogue transcript for a call. Returns `null` when the
 * transcript hasn't been generated (404).
 */
export async function getCallTranscript(callId: string): Promise<QuoCallTranscript | null> {
  const { data } = await quoFetch(
    `/call-transcripts/${encodeURIComponent(callId)}`,
    quoEnvelope(quoCallTranscriptSchema),
    { allow404: true },
  );
  return data?.data ?? null;
}

/**
 * Create a Quo contact.
 *
 * NOTE — this is named `upsertContact` for forward-compat, but Quo has no
 * native upsert primitive (the REST API only supports POST /contacts +
 * PATCH /contacts/{id}; lookup-by-phone is not exposed). For now this just
 * POSTs; deduplication-by-phone will need a follow-up search-or-patch pass
 * once the webhook handler shows whether duplicates are a real problem.
 */
export async function upsertContact(args: {
  name: string;
  phoneNumber: string;
  company?: string;
  source?: string;
}): Promise<QuoContact> {
  const [firstName, ...rest] = args.name.trim().split(/\s+/);
  const lastName = rest.join(" ");

  const body: Record<string, unknown> = {
    defaultFields: {
      firstName: firstName || args.name,
      ...(lastName ? { lastName } : {}),
      ...(args.company ? { company: args.company } : {}),
      phoneNumbers: [{ name: "Mobile", value: args.phoneNumber }],
    },
    ...(args.source ? { source: args.source } : {}),
  };

  const { data } = await quoFetch("/contacts", quoEnvelope(quoContactSchema), {
    method: "POST",
    body,
  });
  if (!data) {
    throw new QuoApiError(500, null, "Quo returned an empty body for upsertContact");
  }
  return data.data;
}
