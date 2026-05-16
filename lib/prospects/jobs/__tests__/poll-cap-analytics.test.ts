/**
 * Tests for the `poll-cap-analytics` pg-boss handler.
 *
 * Strategy
 * --------
 * - Cap client (`getVideoAnalytics`), `writeTimelineEvent`, and the worker
 *   `db` are mocked individually so the handler runs end-to-end without I/O.
 * - The DB stub uses an ordered `_queue` of SELECT results — the handler's
 *   SELECT order is deterministic per prospect (existing-events → primary
 *   contact → [admin fallback if any hot lead with no assigned user]), so each
 *   test scripts its expected row sets up front.
 * - INSERT and UPDATE chains record their values so we can assert on what the
 *   handler tried to write.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CapVideoAnalytics } from "@/lib/cap/types";
import { CapApiError } from "@/lib/cap/client";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockSelect,
  mockInsert,
  mockUpdate,
  selectChain,
  insertChain,
  updateChain,
  mockGetVideoAnalytics,
  mockWriteTimelineEvent,
} = vi.hoisted(() => {
  // ----- SELECT --------------------------------------------------------------
  // Each .from(...).where(...).limit(N) returns the next item off _queue.
  // .where on its own also resolves (some callers omit .limit) — implemented
  // by making the chain itself awaitable via .then.
  function createSelectChain() {
    const chain: Record<string, unknown> & {
      _queue: unknown[][];
      from: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
      limit: ReturnType<typeof vi.fn>;
    } = {
      _queue: [],
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
    };
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockImplementation(() => Promise.resolve(chain._queue.shift() ?? []));
    return chain;
  }

  // ----- INSERT --------------------------------------------------------------
  // .insert(table).values(v) records the (table, values) tuple and resolves.
  function createInsertChain() {
    const calls: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    let currentTable: unknown = null;
    const chain: Record<string, unknown> & {
      _calls: typeof calls;
      _setTable: (t: unknown) => void;
      values: ReturnType<typeof vi.fn>;
      returning: ReturnType<typeof vi.fn>;
      onConflictDoNothing: ReturnType<typeof vi.fn>;
    } = {
      _calls: calls,
      _setTable: (t) => {
        currentTable = t;
      },
      values: vi.fn(),
      returning: vi.fn(),
      onConflictDoNothing: vi.fn(),
    };
    chain.values = vi.fn().mockImplementation((v: Record<string, unknown>) => {
      calls.push({ table: currentTable, values: v });
      return chain;
    });
    chain.returning = vi.fn().mockResolvedValue([]);
    chain.onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    // Also resolve when awaited directly without .returning/.onConflictDoNothing.
    (chain as unknown as PromiseLike<unknown>).then = ((
      onFulfilled?: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve(undefined).then(onFulfilled, onRejected)) as PromiseLike<unknown>["then"];
    return chain;
  }

  // ----- UPDATE --------------------------------------------------------------
  function createUpdateChain() {
    const calls: Array<{ table: unknown; set: Record<string, unknown> }> = [];
    let currentTable: unknown = null;
    const chain: Record<string, unknown> & {
      _calls: typeof calls;
      _setTable: (t: unknown) => void;
      set: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
    } = {
      _calls: calls,
      _setTable: (t) => {
        currentTable = t;
      },
      set: vi.fn(),
      where: vi.fn(),
    };
    chain.set = vi.fn().mockImplementation((s: Record<string, unknown>) => {
      calls.push({ table: currentTable, set: s });
      return chain;
    });
    chain.where = vi.fn().mockResolvedValue(undefined);
    return chain;
  }

  const selectChain = createSelectChain();
  const insertChain = createInsertChain();
  const updateChain = createUpdateChain();

  const mockSelect = vi.fn().mockReturnValue(selectChain);
  const mockInsert = vi.fn().mockImplementation((table: unknown) => {
    insertChain._setTable(table);
    return insertChain;
  });
  const mockUpdate = vi.fn().mockImplementation((table: unknown) => {
    updateChain._setTable(table);
    return updateChain;
  });

  return {
    mockSelect,
    mockInsert,
    mockUpdate,
    selectChain,
    insertChain,
    updateChain,
    mockGetVideoAnalytics: vi.fn(),
    mockWriteTimelineEvent: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/db/worker", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@/lib/cap/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cap/client")>("@/lib/cap/client");
  return {
    ...actual,
    getVideoAnalytics: (...args: unknown[]) => mockGetVideoAnalytics(...args),
  };
});

vi.mock("@/lib/crm/timeline", () => ({
  writeTimelineEvent: (...args: unknown[]) => mockWriteTimelineEvent(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { classifyEngagement, handlePollCapAnalytics } from "../poll-cap-analytics";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROSPECT_A = {
  id: "00000000-0000-0000-0000-00000000000a",
  businessName: "Acme Co",
  capVideoId: "vid_acme_001",
  assignedUserId: "11111111-1111-1111-1111-111111111111",
  outreachStage: "emailed",
  lastTouchedAt: "2026-05-01T00:00:00.000Z",
};

const PROSPECT_B = {
  id: "00000000-0000-0000-0000-00000000000b",
  businessName: "Beta Corp",
  capVideoId: "vid_beta_001",
  assignedUserId: "22222222-2222-2222-2222-222222222222",
  outreachStage: "emailed",
  lastTouchedAt: "2026-05-01T00:00:00.000Z",
};

const PROSPECT_C = {
  id: "00000000-0000-0000-0000-00000000000c",
  businessName: "Gamma Ltd",
  capVideoId: "vid_gamma_001",
  assignedUserId: "33333333-3333-3333-3333-333333333333",
  outreachStage: "emailed",
  lastTouchedAt: "2026-05-01T00:00:00.000Z",
};

function buildAnalytics(capVideoId: string, views: CapVideoAnalytics["views"]): CapVideoAnalytics {
  return {
    videoId: capVideoId,
    totalViews: views.length,
    uniqueViewers: new Set(views.map((v) => v.viewerIp ?? `anon-${Math.random()}`)).size,
    avgWatchPercent: null,
    completionRate: null,
    views,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectChain._queue.length = 0;
  insertChain._calls.length = 0;
  updateChain._calls.length = 0;
  vi.stubEnv("CAP_API_KEY", "csk_test");
  vi.stubEnv("CAP_API_BASE", "https://cap.so/api");
  vi.stubEnv("CAP_POLL_LOOKBACK_DAYS", "30");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// classifyEngagement (pure function — quick sanity)
// ---------------------------------------------------------------------------

describe("classifyEngagement", () => {
  it("engagement signals beat the first-view marker — 90% on a fresh video is watched_completed", () => {
    expect(
      classifyEngagement({
        videoHasAnyPriorView: false,
        priorViewerCount: 0,
        watchPercent: 0.95,
      }),
    ).toBe("watched_completed");
  });

  it("a low-engagement first view (e.g. 10%) is recorded as first_view", () => {
    expect(
      classifyEngagement({
        videoHasAnyPriorView: false,
        priorViewerCount: 0,
        watchPercent: 0.1,
      }),
    ).toBe("first_view");
  });

  it("same viewer (by IP) returning is video_rewatched even on a low watchPercent", () => {
    expect(
      classifyEngagement({
        videoHasAnyPriorView: true,
        priorViewerCount: 1,
        watchPercent: 0.1,
      }),
    ).toBe("video_rewatched");
  });

  it("≥ 0.90 is watched_completed", () => {
    expect(
      classifyEngagement({
        videoHasAnyPriorView: true,
        priorViewerCount: 0,
        watchPercent: 0.9,
      }),
    ).toBe("watched_completed");
  });

  it("≥ 0.75 (and < 0.90) is watched_75", () => {
    expect(
      classifyEngagement({
        videoHasAnyPriorView: true,
        priorViewerCount: 0,
        watchPercent: 0.75,
      }),
    ).toBe("watched_75");
  });

  it("≥ 0.50 (and < 0.75) is watched_50", () => {
    expect(
      classifyEngagement({
        videoHasAnyPriorView: true,
        priorViewerCount: 0,
        watchPercent: 0.5,
      }),
    ).toBe("watched_50");
  });

  it("anonymous viewer (null) is never a rewatch", () => {
    expect(
      classifyEngagement({
        videoHasAnyPriorView: true,
        priorViewerCount: null,
        watchPercent: 0.6,
      }),
    ).toBe("watched_50");
  });
});

// ---------------------------------------------------------------------------
// handlePollCapAnalytics
// ---------------------------------------------------------------------------

describe("handlePollCapAnalytics", () => {
  it("returns zeros and writes nothing when no prospects are active", async () => {
    // SELECT prospects → empty
    selectChain._queue.push([]);

    const result = await handlePollCapAnalytics();

    expect(result).toEqual({ prospectsPolled: 0, newEventsWritten: 0, errors: 0 });
    expect(mockGetVideoAnalytics).not.toHaveBeenCalled();
    expect(insertChain._calls).toHaveLength(0);
    expect(updateChain._calls).toHaveLength(0);
  });

  it("new view at 90% (first view ever) → engagement row, timeline event, hot-lead notification", async () => {
    selectChain._queue.push([PROSPECT_A]); // active prospects
    selectChain._queue.push([]); // existing engagement events (none)
    selectChain._queue.push([{ id: "contact-1" }]); // primary contact

    mockGetVideoAnalytics.mockResolvedValueOnce(
      buildAnalytics(PROSPECT_A.capVideoId, [
        {
          viewerIp: "1.2.3.4",
          country: "AU",
          watchedAt: "2026-05-15T10:00:00.000Z",
          watchDurationSeconds: 180,
          watchPercent: 0.9,
        },
      ]),
    );

    const result = await handlePollCapAnalytics();

    expect(result).toEqual({ prospectsPolled: 1, newEventsWritten: 1, errors: 0 });

    // Two inserts: engagement row + hot-lead notification (because 90% ≥ 0.90
    // → watched_completed, which IS in the hot-lead set).
    expect(insertChain._calls).toHaveLength(2);
    const [engagementInsert, notificationInsert] = insertChain._calls;
    expect(engagementInsert.values).toMatchObject({
      capVideoId: PROSPECT_A.capVideoId,
      prospectId: PROSPECT_A.id,
      contactId: "contact-1",
      eventType: "watched_completed",
      occurredAt: "2026-05-15T10:00:00.000Z",
      viewerIp: "1.2.3.4",
      viewerCountry: "AU",
      watchDurationSeconds: 180,
      watchPercent: 90,
    });

    // Timeline event maps watched_completed → video_completed.
    expect(mockWriteTimelineEvent).toHaveBeenCalledTimes(1);
    const timelineArgs = mockWriteTimelineEvent.mock.calls[0][0];
    expect(timelineArgs).toMatchObject({
      prospectId: PROSPECT_A.id,
      contactId: "contact-1",
      eventType: "video_completed",
    });
    expect(timelineArgs.metadata).toMatchObject({
      capVideoId: PROSPECT_A.capVideoId,
      engagementEventType: "watched_completed",
      watchPercent: 90,
    });

    // Hot-lead notification routed to the prospect's assigned admin user
    // (no fallback SELECT against admin_users since assignedUserId is set).
    expect(notificationInsert.values).toMatchObject({
      userId: PROSPECT_A.assignedUserId,
      type: "video_engagement",
      priority: "HIGH",
      relatedId: PROSPECT_A.id,
      relatedType: "prospect",
    });
    expect(notificationInsert.values.message).toContain("Acme Co");

    // lastTouchedAt bumped on the prospect.
    expect(updateChain._calls).toHaveLength(1);
    expect(updateChain._calls[0].set.lastTouchedAt).toBeTypeOf("string");
  });

  it("new view at 90% on a video with prior views → watched_completed + hot-lead notification", async () => {
    selectChain._queue.push([PROSPECT_A]); // active prospects
    selectChain._queue.push([
      // One prior view exists for this video (different viewer + earlier time).
      { viewerIp: "9.9.9.9", occurredAt: "2026-05-14T10:00:00.000Z" },
    ]);
    selectChain._queue.push([{ id: "contact-1" }]); // primary contact

    mockGetVideoAnalytics.mockResolvedValueOnce(
      buildAnalytics(PROSPECT_A.capVideoId, [
        // Include the prior view (will be deduped) and a new 90% view.
        {
          viewerIp: "9.9.9.9",
          country: "AU",
          watchedAt: "2026-05-14T10:00:00.000Z",
          watchDurationSeconds: 30,
          watchPercent: 0.2,
        },
        {
          viewerIp: "1.2.3.4",
          country: "AU",
          watchedAt: "2026-05-15T10:00:00.000Z",
          watchDurationSeconds: 200,
          watchPercent: 0.95,
        },
      ]),
    );

    const result = await handlePollCapAnalytics();

    expect(result).toEqual({ prospectsPolled: 1, newEventsWritten: 1, errors: 0 });

    expect(insertChain._calls).toHaveLength(2); // engagement + notification
    const [engagement, notif] = insertChain._calls;
    expect(engagement.values).toMatchObject({
      eventType: "watched_completed",
      viewerIp: "1.2.3.4",
      watchPercent: 95,
    });

    // Hot-lead notification: assigned user gets it, no admin SELECT needed.
    expect(notif.values).toMatchObject({
      userId: PROSPECT_A.assignedUserId,
      type: "video_engagement",
      priority: "HIGH",
      relatedId: PROSPECT_A.id,
      relatedType: "prospect",
    });
    expect(notif.values.message).toContain("Acme Co");
    expect(notif.values.message).toContain("95");
  });

  it("duplicate view (same IP + occurredAt) is not re-recorded", async () => {
    selectChain._queue.push([PROSPECT_A]);
    selectChain._queue.push([
      // The "new" view's exact (ip, occurredAt) is already in the DB.
      { viewerIp: "1.2.3.4", occurredAt: "2026-05-15T10:00:00.000Z" },
    ]);
    selectChain._queue.push([{ id: "contact-1" }]); // primary contact

    mockGetVideoAnalytics.mockResolvedValueOnce(
      buildAnalytics(PROSPECT_A.capVideoId, [
        {
          viewerIp: "1.2.3.4",
          country: "AU",
          watchedAt: "2026-05-15T10:00:00.000Z",
          watchDurationSeconds: 180,
          watchPercent: 0.9,
        },
      ]),
    );

    const result = await handlePollCapAnalytics();

    expect(result).toEqual({ prospectsPolled: 1, newEventsWritten: 0, errors: 0 });
    expect(insertChain._calls).toHaveLength(0); // no engagement, no notification
    expect(mockWriteTimelineEvent).not.toHaveBeenCalled();
    expect(updateChain._calls).toHaveLength(0); // no lastTouchedAt bump
  });

  it("one prospect erroring doesn't stop the batch — others still process", async () => {
    // 3 active prospects: A throws, B + C succeed.
    selectChain._queue.push([PROSPECT_A, PROSPECT_B, PROSPECT_C]);
    // Prospect A: getVideoAnalytics will throw before any SELECT happens for it,
    //   so the next queued items are for prospect B.
    selectChain._queue.push([]); // B: existing events
    selectChain._queue.push([{ id: "contact-b" }]); // B: primary contact
    selectChain._queue.push([]); // C: existing events
    selectChain._queue.push([{ id: "contact-c" }]); // C: primary contact

    // Real unauthenticated 401 from Cap (not the 501 the client throws when no
    // analytics endpoint exists — that one is silently skipped, not an error).
    mockGetVideoAnalytics
      .mockRejectedValueOnce(new CapApiError(401, null, "Invalid key"))
      .mockResolvedValueOnce(
        buildAnalytics(PROSPECT_B.capVideoId, [
          {
            viewerIp: "8.8.8.8",
            country: "AU",
            watchedAt: "2026-05-15T11:00:00.000Z",
            watchDurationSeconds: 100,
            watchPercent: 0.6,
          },
        ]),
      )
      .mockResolvedValueOnce(
        buildAnalytics(PROSPECT_C.capVideoId, [
          {
            viewerIp: "7.7.7.7",
            country: "AU",
            watchedAt: "2026-05-15T12:00:00.000Z",
            watchDurationSeconds: 100,
            watchPercent: 0.55,
          },
        ]),
      );

    const result = await handlePollCapAnalytics();

    // A failed, B + C succeeded → 1 error, 3 polled (A counted before throw), 2 new events.
    expect(result.prospectsPolled).toBe(3);
    expect(result.errors).toBe(1);
    expect(result.newEventsWritten).toBe(2);

    // B + C engagement rows both inserted (no notification — neither hit hot-lead thresholds).
    expect(insertChain._calls).toHaveLength(2);
    const inserted = insertChain._calls.map((c) => c.values);
    expect(inserted.some((v) => v.prospectId === PROSPECT_B.id && v.viewerIp === "8.8.8.8")).toBe(
      true,
    );
    expect(inserted.some((v) => v.prospectId === PROSPECT_C.id && v.viewerIp === "7.7.7.7")).toBe(
      true,
    );

    // Timeline events were written for B and C; A failed before reaching that point.
    expect(mockWriteTimelineEvent).toHaveBeenCalledTimes(2);
  });

  it("Cap returning 501 (no public analytics endpoint) is treated as a silent skip", async () => {
    selectChain._queue.push([PROSPECT_A]);
    // No existing-events or contact SELECTs are expected; the handler should
    // short-circuit on the 501 before any DB write happens.

    mockGetVideoAnalytics.mockRejectedValueOnce(
      new CapApiError(501, null, "Cap has no public analytics endpoint"),
    );

    const result = await handlePollCapAnalytics();

    expect(result).toEqual({ prospectsPolled: 1, newEventsWritten: 0, errors: 0 });
    expect(insertChain._calls).toHaveLength(0);
    expect(updateChain._calls).toHaveLength(0);
    expect(mockWriteTimelineEvent).not.toHaveBeenCalled();
  });
});
