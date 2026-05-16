/**
 * pg-boss handler: generate-seo-report
 *
 * Runs an external SEO/AEO report CLI (configured via env) for a single
 * prospect, uploads the resulting HTML to object storage, and records a
 * timeline event with the proxied URL.
 *
 * Registered in `scripts/worker.ts`.
 *
 * Idempotency
 * -----------
 * The handler is a no-op for any prospect whose status is not `pending` —
 * already-`ready`, already-`generating`, or previously-`failed` prospects are
 * skipped on a re-enqueue so we never overwrite a successful run or fight
 * another worker.
 *
 * Failure model
 * -------------
 * Any failure (non-zero exit, timeout, missing output file, upload error)
 * flips the prospect to `failed`, writes a `seo_report_failed` timeline
 * event, then re-throws so pg-boss records the job failure. pg-boss will
 * retry per the queue's retry config; on each retry the idempotency check
 * above causes a silent no-op (status is no longer `pending`).
 *
 * Security
 * --------
 * The CLI template is split into argv BEFORE substitution and passed to
 * `Bun.spawn` as an arg array — never concatenated into a shell string. A
 * prospect website containing `; rm -rf /` is treated as a single argv item,
 * not a shell metacharacter.
 */

import { eq } from "drizzle-orm";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { db } from "@/lib/db/worker";
import { prospects } from "@/lib/db/schema";
import { writeTimelineEvent } from "@/lib/crm/timeline";
import { logger } from "@/lib/logger";
import { uploadFile } from "@/lib/storage";

import { runCli } from "./run-cli";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min
const DEFAULT_OUT_DIR = "./reports";
const MAX_ERROR_LENGTH = 500;

export interface GenerateSeoReportJob {
  data: { prospectId: string };
}

interface CommandSubstitutions {
  website: string;
  businessName: string;
  prospectId: string;
  outDir: string;
}

/**
 * Split the CLI template into argv FIRST, then substitute placeholders. This
 * keeps user-controlled values (website, businessName) inside a single argv
 * slot — they cannot escape into adjacent arguments or inject shell tokens
 * because we never go through a shell.
 */
export function buildCliArgv(template: string, vars: CommandSubstitutions): string[] {
  const trimmed = template.trim();
  if (trimmed === "") {
    throw new Error("SEO_REPORT_CLI_CMD is empty");
  }
  const argv = trimmed.split(/\s+/);
  const lookup = vars as unknown as Record<string, string>;
  return argv.map((arg) =>
    arg.replace(/\{(\w+)\}/g, (match, key: string) => {
      const value = lookup[key];
      return value !== undefined ? value : match;
    }),
  );
}

function tail(str: string, n: number): string {
  return str.length <= n ? str : str.slice(str.length - n);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

async function markFailed(prospectId: string, error: string): Promise<void> {
  await db
    .update(prospects)
    .set({ seoReportStatus: "failed", seoReportError: tail(error, MAX_ERROR_LENGTH) })
    .where(eq(prospects.id, prospectId));
}

export async function handleGenerateSeoReport(job: GenerateSeoReportJob): Promise<void> {
  const { prospectId } = job.data;
  const startedAt = Date.now();

  logger.info("[seo-report] start", { prospectId });

  // ---------------------------------------------------------------------------
  // 1. Load + idempotency check
  // ---------------------------------------------------------------------------
  const rows = await db.select().from(prospects).where(eq(prospects.id, prospectId)).limit(1);

  const prospect = rows[0];
  if (!prospect) {
    logger.warn("[seo-report] prospect not found — skipping", { prospectId });
    return;
  }
  if (prospect.seoReportStatus !== "pending") {
    logger.info("[seo-report] status is not pending — skipping", {
      prospectId,
      status: prospect.seoReportStatus,
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // 2. Read config
  // ---------------------------------------------------------------------------
  const cliTemplate = process.env.SEO_REPORT_CLI_CMD;
  const outDir = process.env.SEO_REPORT_OUT_DIR ?? DEFAULT_OUT_DIR;
  const timeoutRaw = process.env.SEO_REPORT_TIMEOUT_MS;
  const timeoutMs =
    timeoutRaw && Number.isFinite(Number(timeoutRaw)) && Number(timeoutRaw) > 0
      ? Number(timeoutRaw)
      : DEFAULT_TIMEOUT_MS;

  if (!cliTemplate || cliTemplate.trim() === "") {
    const error = "SEO_REPORT_CLI_CMD environment variable is not set";
    await markFailed(prospectId, error);
    await writeTimelineEvent({
      prospectId,
      eventType: "seo_report_failed",
      title: `SEO report failed: ${prospect.businessName}`,
      metadata: { prospectId, error },
    });
    logger.error("[seo-report] config missing", { prospectId, error });
    throw new Error(error);
  }

  // ---------------------------------------------------------------------------
  // 3. Flip to `generating` and clear any prior error
  // ---------------------------------------------------------------------------
  await db
    .update(prospects)
    .set({ seoReportStatus: "generating", seoReportError: null })
    .where(eq(prospects.id, prospectId));

  // ---------------------------------------------------------------------------
  // 4. Build argv + ensure output dir exists
  // ---------------------------------------------------------------------------
  const argv = buildCliArgv(cliTemplate, {
    website: prospect.website ?? "",
    businessName: prospect.businessName,
    prospectId: prospect.id,
    outDir,
  });

  await mkdir(outDir, { recursive: true });

  // Convention: the CLI writes to `<outDir>/<prospectId>.html`. The template
  // is free to encode this however it likes; this is the path we expect.
  const expectedOutputPath = path.join(outDir, `${prospectId}.html`);
  const filename = `${prospectId}.html`;
  const storageKey = `reports/${filename}`;
  const proxyUrl = `/api/media/reports/${filename}`;

  // ---------------------------------------------------------------------------
  // 5. Spawn + upload + record success / failure
  // ---------------------------------------------------------------------------
  try {
    const result = await runCli(argv, timeoutMs);

    if (result.timedOut) {
      throw new Error(
        `CLI timed out after ${timeoutMs}ms: ${tail(result.stderr, MAX_ERROR_LENGTH)}`,
      );
    }
    if (result.exitCode !== 0) {
      throw new Error(`CLI exited ${result.exitCode}: ${tail(result.stderr, MAX_ERROR_LENGTH)}`);
    }
    if (!(await fileExists(expectedOutputPath))) {
      throw new Error(`Expected output file missing: ${expectedOutputPath}`);
    }

    const body = await readFile(expectedOutputPath);
    await uploadFile(storageKey, body, { contentType: "text/html" });

    const nowIso = new Date().toISOString();
    await db
      .update(prospects)
      .set({
        seoReportUrl: proxyUrl,
        seoReportStatus: "ready",
        seoReportError: null,
        lastTouchedAt: nowIso,
      })
      .where(eq(prospects.id, prospectId));

    const durationMs = Date.now() - startedAt;
    await writeTimelineEvent({
      prospectId,
      eventType: "seo_report_generated",
      title: `SEO report ready: ${prospect.businessName}`,
      metadata: { prospectId, reportUrl: proxyUrl, durationMs },
    });

    logger.info("[seo-report] success", { prospectId, durationMs, reportUrl: proxyUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const truncated = tail(message, MAX_ERROR_LENGTH);

    await markFailed(prospectId, truncated);
    await writeTimelineEvent({
      prospectId,
      eventType: "seo_report_failed",
      title: `SEO report failed: ${prospect.businessName}`,
      metadata: { prospectId, error: truncated, durationMs: Date.now() - startedAt },
    });

    logger.error("[seo-report] failed", { prospectId, error: truncated });

    // Re-throw so pg-boss records the job failure and applies its retry policy.
    throw err;
  }
}
