import "server-only";

import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { MEDIA_BUCKET } from "@/lib/storage";
import { getStorageClient } from "@/lib/storage/client";
import { testEncryption } from "@/lib/encryption";

export interface IntegrationTestResult {
  ok: boolean;
  /** Human-readable status. NEVER echo a credential value. */
  message: string;
  durationMs: number;
}

const TEST_TIMEOUT_MS = 8000;

function elapsed(start: number): number {
  return Math.round(performance.now() - start);
}

/**
 * Wrap fetch with an abort timeout so a hung upstream doesn't pin the route.
 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * OpenAI — list models. Cheapest authenticated call.
 * Docs: https://platform.openai.com/docs/api-reference/models/list
 */
async function testOpenAI(): Promise<IntegrationTestResult> {
  const start = performance.now();
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, message: "OPENAI_API_KEY is not set.", durationMs: 0 };

  try {
    const res = await fetchWithTimeout("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) {
      return { ok: true, message: "Reached OpenAI API.", durationMs: elapsed(start) };
    }
    if (res.status === 401) {
      return { ok: false, message: "OpenAI rejected the key (401).", durationMs: elapsed(start) };
    }
    return {
      ok: false,
      message: `OpenAI returned HTTP ${res.status}.`,
      durationMs: elapsed(start),
    };
  } catch (err) {
    return {
      ok: false,
      message: `OpenAI request failed: ${(err as Error).message}`,
      durationMs: elapsed(start),
    };
  }
}

/**
 * Resend — list domains. Returns the authed account's verified senders.
 * Docs: https://resend.com/docs/api-reference/domains/list-domains
 */
async function testResend(): Promise<IntegrationTestResult> {
  const start = performance.now();
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, message: "RESEND_API_KEY is not set.", durationMs: 0 };

  try {
    const res = await fetchWithTimeout("https://api.resend.com/domains", {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) {
      return { ok: true, message: "Reached Resend API.", durationMs: elapsed(start) };
    }
    if (res.status === 401) {
      return { ok: false, message: "Resend rejected the key (401).", durationMs: elapsed(start) };
    }
    return {
      ok: false,
      message: `Resend returned HTTP ${res.status}.`,
      durationMs: elapsed(start),
    };
  } catch (err) {
    return {
      ok: false,
      message: `Resend request failed: ${(err as Error).message}`,
      durationMs: elapsed(start),
    };
  }
}

/**
 * Quo — list phone numbers. Quo uses no `Bearer` prefix per lib/quo/client.ts.
 */
async function testQuo(): Promise<IntegrationTestResult> {
  const start = performance.now();
  const key = process.env.QUO_API_KEY;
  if (!key) return { ok: false, message: "QUO_API_KEY is not set.", durationMs: 0 };

  const base = process.env.QUO_API_BASE ?? "https://api.openphone.com/v1";
  try {
    const res = await fetchWithTimeout(`${base}/phone-numbers`, {
      method: "GET",
      headers: { Authorization: key },
    });
    if (res.ok) {
      return { ok: true, message: "Reached Quo API.", durationMs: elapsed(start) };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: `Quo rejected the key (HTTP ${res.status}).`,
        durationMs: elapsed(start),
      };
    }
    return { ok: false, message: `Quo returned HTTP ${res.status}.`, durationMs: elapsed(start) };
  } catch (err) {
    return {
      ok: false,
      message: `Quo request failed: ${(err as Error).message}`,
      durationMs: elapsed(start),
    };
  }
}

/**
 * Database — `select 1` round-trip via Drizzle.
 */
async function testDatabase(): Promise<IntegrationTestResult> {
  const start = performance.now();
  if (!process.env.DATABASE_URL) {
    return { ok: false, message: "DATABASE_URL is not set.", durationMs: 0 };
  }
  try {
    await db.execute(sql`select 1`);
    return { ok: true, message: "Connected to Postgres.", durationMs: elapsed(start) };
  } catch (err) {
    return {
      ok: false,
      message: `Database query failed: ${(err as Error).message}`,
      durationMs: elapsed(start),
    };
  }
}

/**
 * Object storage — HEAD on the configured bucket.
 */
async function testStorage(): Promise<IntegrationTestResult> {
  const start = performance.now();
  if (
    !process.env.BUCKET_ENDPOINT ||
    !process.env.BUCKET_MEDIA_ACCESS_KEY_ID ||
    !process.env.BUCKET_MEDIA_SECRET_ACCESS_KEY
  ) {
    return { ok: false, message: "Bucket credentials are not fully set.", durationMs: 0 };
  }
  try {
    const client = getStorageClient();
    await client.send(new HeadBucketCommand({ Bucket: MEDIA_BUCKET }));
    return {
      ok: true,
      message: `Bucket "${MEDIA_BUCKET}" is reachable.`,
      durationMs: elapsed(start),
    };
  } catch (err) {
    return {
      ok: false,
      message: `Bucket check failed: ${(err as Error).message}`,
      durationMs: elapsed(start),
    };
  }
}

/**
 * Encryption key — round-trip encrypt/decrypt a known string.
 */
async function testEncryptionKey(): Promise<IntegrationTestResult> {
  const start = performance.now();
  try {
    testEncryption();
    return { ok: true, message: "Encryption round-trip succeeded.", durationMs: elapsed(start) };
  } catch (err) {
    return {
      ok: false,
      message: (err as Error).message,
      durationMs: elapsed(start),
    };
  }
}

const RUNNERS: Record<string, () => Promise<IntegrationTestResult>> = {
  openai: testOpenAI,
  resend: testResend,
  quo: testQuo,
  database: testDatabase,
  storage: testStorage,
  encryption: testEncryptionKey,
};

export async function runIntegrationTest(id: string): Promise<IntegrationTestResult | null> {
  const runner = RUNNERS[id];
  if (!runner) return null;
  return runner();
}
