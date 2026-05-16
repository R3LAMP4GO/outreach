/**
 * Tests for the generate-seo-report pg-boss handler.
 *
 * Strategy
 * --------
 * - The DB is a chainable Drizzle stub recorded with vi.fn() so we can assert
 *   exactly which UPDATE statements fired and in what order.
 * - `runCli` (Bun.spawn wrapper) is mocked so tests run on Node without Bun.
 * - Storage upload + timeline writer + logger are mocked individually so the
 *   handler is exercised end-to-end without any I/O.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockSelect,
  mockUpdate,
  selectChain,
  updateChain,
  mockRunCli,
  mockUploadFile,
  mockWriteTimelineEvent,
} = vi.hoisted(() => {
  function createSelectChain() {
    const chain: Record<string, unknown> & { _result: unknown[] } = {
      _result: [],
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
    };
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockImplementation(() => Promise.resolve(chain._result));
    return chain;
  }

  function createUpdateChain() {
    const calls: Array<{ set: Record<string, unknown> }> = [];
    const chain: Record<string, unknown> & {
      _calls: typeof calls;
      _lastSet: Record<string, unknown> | null;
    } = {
      _calls: calls,
      _lastSet: null,
      set: vi.fn(),
      where: vi.fn(),
    };
    chain.set = vi.fn().mockImplementation((values: Record<string, unknown>) => {
      chain._lastSet = values;
      calls.push({ set: values });
      return chain;
    });
    chain.where = vi.fn().mockResolvedValue(undefined);
    return chain;
  }

  const selectChain = createSelectChain();
  const updateChain = createUpdateChain();
  const mockSelect = vi.fn().mockReturnValue(selectChain);
  const mockUpdate = vi.fn().mockReturnValue(updateChain);

  return {
    mockSelect,
    mockUpdate,
    selectChain,
    updateChain,
    mockRunCli: vi.fn(),
    mockUploadFile: vi.fn().mockResolvedValue(undefined),
    mockWriteTimelineEvent: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/db/worker", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@/lib/storage", () => ({
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
}));

vi.mock("@/lib/crm/timeline", () => ({
  writeTimelineEvent: (...args: unknown[]) => mockWriteTimelineEvent(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../run-cli", () => ({
  runCli: (...args: unknown[]) => mockRunCli(...args),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { handleGenerateSeoReport, buildCliArgv } from "../generate-seo-report";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const PROSPECT_ID = "00000000-0000-0000-0000-000000000001";

const PENDING_PROSPECT = {
  id: PROSPECT_ID,
  businessName: "Acme Co",
  website: "https://acme.example",
  seoReportStatus: "pending" as const,
  seoReportError: null,
  seoReportUrl: null,
  lastTouchedAt: null,
};

let tmpDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  selectChain._result = [];
  updateChain._calls.length = 0;
  updateChain._lastSet = null;

  // Use a per-test temp dir so the handler's `mkdir(outDir, recursive)` + the
  // `expectedOutputPath` lookup hits a real filesystem we control.
  tmpDir = mkdtempSync(path.join(tmpdir(), "seo-report-test-"));
  vi.stubEnv(
    "SEO_REPORT_CLI_CMD",
    "/usr/bin/true --url {website} --out {outDir}/{prospectId}.html",
  );
  vi.stubEnv("SEO_REPORT_OUT_DIR", tmpDir);
  vi.stubEnv("SEO_REPORT_TIMEOUT_MS", "10000");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// buildCliArgv (pure function — quick sanity check + security shape)
// ---------------------------------------------------------------------------

describe("buildCliArgv", () => {
  it("splits on whitespace before substituting so a value with spaces stays one arg", () => {
    const argv = buildCliArgv("seo-report --url {website} --out {outDir}/{prospectId}.html", {
      website: "https://acme.example",
      businessName: "O'Hare; rm -rf /",
      prospectId: "abc-123",
      outDir: "./reports",
    });

    expect(argv).toEqual([
      "seo-report",
      "--url",
      "https://acme.example",
      "--out",
      "./reports/abc-123.html",
    ]);
  });

  it("throws on an empty template", () => {
    expect(() =>
      buildCliArgv("   ", { website: "", businessName: "x", prospectId: "y", outDir: "z" }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// handleGenerateSeoReport
// ---------------------------------------------------------------------------

describe("handleGenerateSeoReport", () => {
  it("skips when the prospect does not exist", async () => {
    selectChain._result = [];

    await expect(
      handleGenerateSeoReport({ data: { prospectId: PROSPECT_ID } }),
    ).resolves.toBeUndefined();

    // No status flip — the handler should return before any UPDATE.
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRunCli).not.toHaveBeenCalled();
    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(mockWriteTimelineEvent).not.toHaveBeenCalled();
  });

  it("skips when the prospect status is already 'ready' (idempotent on re-enqueue)", async () => {
    selectChain._result = [{ ...PENDING_PROSPECT, seoReportStatus: "ready" }];

    await handleGenerateSeoReport({ data: { prospectId: PROSPECT_ID } });

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRunCli).not.toHaveBeenCalled();
  });

  it("success path: flips status to ready, uploads to storage, writes timeline event", async () => {
    selectChain._result = [PENDING_PROSPECT];

    // CLI exits 0 and writes the expected output file.
    const outPath = path.join(tmpDir, `${PROSPECT_ID}.html`);
    mockRunCli.mockImplementation(async () => {
      writeFileSync(outPath, "<h1>report body</h1>");
      return { exitCode: 0, stdout: "", stderr: "", timedOut: false };
    });

    await handleGenerateSeoReport({ data: { prospectId: PROSPECT_ID } });

    // 1. Status was flipped to `generating` before the CLI ran, then to `ready`.
    const sets = updateChain._calls.map((c) => c.set);
    expect(sets[0]).toMatchObject({ seoReportStatus: "generating", seoReportError: null });
    const finalSet = sets[sets.length - 1];
    expect(finalSet).toMatchObject({
      seoReportStatus: "ready",
      seoReportError: null,
      seoReportUrl: `/api/media/reports/${PROSPECT_ID}.html`,
    });
    expect(finalSet.lastTouchedAt).toBeTypeOf("string");

    // 2. CLI was invoked with a properly-substituted argv (no shell).
    expect(mockRunCli).toHaveBeenCalledTimes(1);
    const [argv, timeoutMs] = mockRunCli.mock.calls[0];
    expect(argv).toEqual([
      "/usr/bin/true",
      "--url",
      "https://acme.example",
      "--out",
      `${tmpDir}/${PROSPECT_ID}.html`,
    ]);
    expect(timeoutMs).toBe(10000);

    // 3. Storage upload received the file body + an HTML content-type.
    expect(mockUploadFile).toHaveBeenCalledTimes(1);
    const [storageKey, body, opts] = mockUploadFile.mock.calls[0];
    expect(storageKey).toBe(`reports/${PROSPECT_ID}.html`);
    expect(Buffer.isBuffer(body)).toBe(true);
    expect((body as Buffer).toString("utf8")).toBe("<h1>report body</h1>");
    expect(opts).toEqual({ contentType: "text/html" });

    // 4. A `seo_report_generated` timeline event was written with the proxy URL.
    expect(mockWriteTimelineEvent).toHaveBeenCalledTimes(1);
    const event = mockWriteTimelineEvent.mock.calls[0][0];
    expect(event).toMatchObject({
      prospectId: PROSPECT_ID,
      eventType: "seo_report_generated",
      metadata: expect.objectContaining({
        prospectId: PROSPECT_ID,
        reportUrl: `/api/media/reports/${PROSPECT_ID}.html`,
      }),
    });
    expect(typeof event.metadata.durationMs).toBe("number");
  });

  it("failure path: non-zero exit flips status to failed, captures stderr tail, re-throws", async () => {
    selectChain._result = [PENDING_PROSPECT];

    mockRunCli.mockResolvedValue({
      exitCode: 2,
      stdout: "",
      stderr: "fatal: target host unreachable",
      timedOut: false,
    });

    await expect(handleGenerateSeoReport({ data: { prospectId: PROSPECT_ID } })).rejects.toThrow(
      /CLI exited 2/,
    );

    // No upload, no success-side update.
    expect(mockUploadFile).not.toHaveBeenCalled();

    const sets = updateChain._calls.map((c) => c.set);
    // First UPDATE = generating, last UPDATE = failed (with stderr captured).
    expect(sets[0]).toMatchObject({ seoReportStatus: "generating" });
    const finalSet = sets[sets.length - 1];
    expect(finalSet).toMatchObject({ seoReportStatus: "failed" });
    expect(finalSet.seoReportError).toContain("CLI exited 2");
    expect(finalSet.seoReportError).toContain("target host unreachable");

    // Timeline event records the failure.
    expect(mockWriteTimelineEvent).toHaveBeenCalledTimes(1);
    const event = mockWriteTimelineEvent.mock.calls[0][0];
    expect(event.eventType).toBe("seo_report_failed");
    expect(event.metadata.error).toContain("CLI exited 2");
  });

  it("failure path: exit 0 but the expected output file is missing is treated as failure", async () => {
    selectChain._result = [PENDING_PROSPECT];

    // Exit 0 but the CLI deliberately writes nothing to the expected path.
    mockRunCli.mockResolvedValue({
      exitCode: 0,
      stdout: "looks ok",
      stderr: "",
      timedOut: false,
    });

    await expect(handleGenerateSeoReport({ data: { prospectId: PROSPECT_ID } })).rejects.toThrow(
      /Expected output file missing/,
    );

    expect(mockUploadFile).not.toHaveBeenCalled();

    const sets = updateChain._calls.map((c) => c.set);
    const finalSet = sets[sets.length - 1];
    expect(finalSet).toMatchObject({ seoReportStatus: "failed" });
    expect(finalSet.seoReportError).toContain("Expected output file missing");

    expect(mockWriteTimelineEvent).toHaveBeenCalledTimes(1);
    expect(mockWriteTimelineEvent.mock.calls[0][0].eventType).toBe("seo_report_failed");
  });

  it("missing SEO_REPORT_CLI_CMD env flips to failed without invoking the CLI", async () => {
    vi.stubEnv("SEO_REPORT_CLI_CMD", "");
    selectChain._result = [PENDING_PROSPECT];

    await expect(handleGenerateSeoReport({ data: { prospectId: PROSPECT_ID } })).rejects.toThrow(
      /SEO_REPORT_CLI_CMD/,
    );

    expect(mockRunCli).not.toHaveBeenCalled();
    expect(mockUploadFile).not.toHaveBeenCalled();

    const sets = updateChain._calls.map((c) => c.set);
    const finalSet = sets[sets.length - 1];
    expect(finalSet).toMatchObject({ seoReportStatus: "failed" });
  });
});
