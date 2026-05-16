/**
 * Tests for the `process-quo-call` pg-boss handler.
 *
 * Mocking strategy
 * ----------------
 * Same shape as `generate-seo-report.test.ts`:
 * - DB is a chainable Drizzle stub recorded with vi.fn() so we can assert
 *   exactly which SELECT/INSERT/UPDATE fired and in what order.
 * - Quo REST client + extractCallData are mocked per-test so each scenario
 *   can wire its own response without an outbound HTTP call.
 * - writeTimelineEvent + enqueueProspectFollowUp are mocked so the handler
 *   runs end-to-end without touching the DB or pg-boss.
 *
 * The DB stub is intentionally simple: it pulls scripted results off an
 * ordered list (`selectChain._queue`) so each call to `db.select(...)`
 * returns the next scripted row set. This keeps assertions readable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockSelect,
  mockUpdate,
  mockInsert,
  selectChain,
  updateChain,
  insertChain,
  mockGetCall,
  mockGetCallSummary,
  mockGetCallTranscript,
  mockExtractCallData,
  mockWriteTimelineEvent,
  mockEnqueueProspectFollowUp,
} = vi.hoisted(() => {
  // ----- SELECT --------------------------------------------------------------
  // Drizzle SELECT chain: .from().where().orderBy().limit() -> rows
  // We script return values via _queue so successive calls return the next item.
  function createSelectChain() {
    const chain: Record<string, unknown> & {
      _queue: unknown[][];
      from: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
      orderBy: ReturnType<typeof vi.fn>;
      limit: ReturnType<typeof vi.fn>;
    } = {
      _queue: [],
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    };
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockImplementation(() => Promise.resolve(chain._queue.shift() ?? []));
    return chain;
  }

  // ----- UPDATE --------------------------------------------------------------
  function createUpdateChain() {
    const calls: Array<{ set: Record<string, unknown> }> = [];
    const chain: Record<string, unknown> & {
      _calls: typeof calls;
      set: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
    } = {
      _calls: calls,
      set: vi.fn(),
      where: vi.fn(),
    };
    chain.set = vi.fn().mockImplementation((values: Record<string, unknown>) => {
      calls.push({ set: values });
      return chain;
    });
    chain.where = vi.fn().mockResolvedValue(undefined);
    return chain;
  }

  // ----- INSERT --------------------------------------------------------------
  // The handler's INSERTs:
  //   prospect stub      -> .insert().values().returning([{id, businessName}])
  //   contact            -> .insert().values().returning([{id}])
  //   prospect_follow_ups-> .insert().values().returning([{id}])
  //   quo_calls_processed-> .insert().values().onConflictDoNothing()
  function createInsertChain() {
    const calls: Array<{ values: Record<string, unknown> }> = [];
    const chain: Record<string, unknown> & {
      _calls: typeof calls;
      _returningQueue: unknown[][];
      values: ReturnType<typeof vi.fn>;
      onConflictDoNothing: ReturnType<typeof vi.fn>;
      returning: ReturnType<typeof vi.fn>;
    } = {
      _calls: calls,
      _returningQueue: [],
      values: vi.fn(),
      onConflictDoNothing: vi.fn(),
      returning: vi.fn(),
    };
    chain.values = vi.fn().mockImplementation((v: Record<string, unknown>) => {
      calls.push({ values: v });
      return chain;
    });
    chain.onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    chain.returning = vi
      .fn()
      .mockImplementation(() => Promise.resolve(chain._returningQueue.shift() ?? []));
    return chain;
  }

  const selectChain = createSelectChain();
  const updateChain = createUpdateChain();
  const insertChain = createInsertChain();

  return {
    selectChain,
    updateChain,
    insertChain,
    mockSelect: vi.fn().mockReturnValue(selectChain),
    mockUpdate: vi.fn().mockReturnValue(updateChain),
    mockInsert: vi.fn().mockReturnValue(insertChain),
    mockGetCall: vi.fn(),
    mockGetCallSummary: vi.fn(),
    mockGetCallTranscript: vi.fn(),
    mockExtractCallData: vi.fn(),
    mockWriteTimelineEvent: vi.fn().mockResolvedValue(undefined),
    mockEnqueueProspectFollowUp: vi.fn().mockResolvedValue("pgboss_follow_up_id"),
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/worker", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  contacts: "contacts_table",
  prospects: "prospects_table",
  prospectFollowUps: "prospect_follow_ups_table",
  quoCallsProcessed: "quo_calls_processed_table",
}));

// drizzle-orm helpers are unused inside the chain stubs but the handler
// imports them at module-eval time, so they need to exist.
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((..._args) => "eq-cond"),
  and: vi.fn((..._args) => "and-cond"),
  or: vi.fn((..._args) => "or-cond"),
  desc: vi.fn((col) => col),
  sql: new Proxy(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values, _tag: "sql" }),
    { get: () => vi.fn() },
  ),
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/crm/timeline", () => ({
  writeTimelineEvent: (...args: unknown[]) => mockWriteTimelineEvent(...args),
}));

vi.mock("@/lib/queue", () => ({
  enqueueProspectFollowUp: (...args: unknown[]) => mockEnqueueProspectFollowUp(...args),
}));

vi.mock("@/lib/quo/client", () => ({
  getCall: (...args: unknown[]) => mockGetCall(...args),
  getCallSummary: (...args: unknown[]) => mockGetCallSummary(...args),
  getCallTranscript: (...args: unknown[]) => mockGetCallTranscript(...args),
}));

vi.mock("@/lib/ai/gg-client", () => ({
  extractCallData: (...args: unknown[]) => mockExtractCallData(...args),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { handleProcessQuoCall, QuoArtefactsNotReadyError } from "../process-quo-call";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CALL_ID = "ACtest001";
const OUR_QUO_NUMBER = "+15550001111";
const PROSPECT_PHONE = "+15552223333";
const PROSPECT_ID = "00000000-0000-0000-0000-000000000aaa";
const CONTACT_ID = "00000000-0000-0000-0000-000000000bbb";

const baseCall = {
  id: CALL_ID,
  direction: "outgoing" as const,
  status: "completed",
  duration: 65,
  createdAt: "2026-05-15T09:59:00Z",
  completedAt: "2026-05-15T10:00:05Z",
  from: OUR_QUO_NUMBER,
  to: PROSPECT_PHONE,
  participants: [PROSPECT_PHONE],
  phoneNumberId: "PN1",
};

const baseSummary = {
  callId: CALL_ID,
  summary: "Discussed pricing.\nFollow up next week.",
  nextSteps: ["Send quote"],
};

const baseTranscript = {
  callId: CALL_ID,
  dialogue: [
    { speaker: OUR_QUO_NUMBER, content: "Hi, this is Jake.", start: 0, end: 1.5 },
    { speaker: PROSPECT_PHONE, content: "Sarah here.", start: 1.6, end: 2.4 },
  ],
};

const baseExtraction = {
  personName: "Sarah",
  personRole: "Manager",
  emailCaptured: "sarah@acme.example",
  phoneCaptured: null,
  sentiment: "interested" as const,
  followUpIntent: false,
  followUpDate: null,
  followUpReason: null,
  summaryBullets: ["Spoke with Sarah", "Discussed pricing"],
  isNewContact: true,
};

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  selectChain._queue = [];
  updateChain._calls.length = 0;
  insertChain._calls.length = 0;
  insertChain._returningQueue = [];

  vi.stubEnv("QUO_PHONE_NUMBER", OUR_QUO_NUMBER);
  vi.stubEnv("OPENAI_API_KEY", "sk-test");

  mockGetCall.mockResolvedValue(baseCall);
  mockGetCallSummary.mockResolvedValue(baseSummary);
  mockGetCallTranscript.mockResolvedValue(baseTranscript);
  mockExtractCallData.mockResolvedValue(baseExtraction);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe("handleProcessQuoCall \u2014 idempotency", () => {
  it("short-circuits when the call is already in quo_calls_processed", async () => {
    selectChain._queue = [
      [{ callId: CALL_ID }], // idempotency check returns a row
    ];

    await handleProcessQuoCall({ data: { callId: CALL_ID } });

    // No Quo fetch, no AI call, no DB writes.
    expect(mockGetCall).not.toHaveBeenCalled();
    expect(mockExtractCallData).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Partial-ready (Quo AI not done yet)
// ---------------------------------------------------------------------------

describe("handleProcessQuoCall \u2014 partial-ready", () => {
  it("throws QuoArtefactsNotReadyError when the summary hasn't been generated yet", async () => {
    selectChain._queue = [[]]; // not processed
    mockGetCallSummary.mockResolvedValueOnce(null);

    await expect(handleProcessQuoCall({ data: { callId: CALL_ID } })).rejects.toBeInstanceOf(
      QuoArtefactsNotReadyError,
    );

    // No AI call, no contact upsert, no timeline.
    expect(mockExtractCallData).not.toHaveBeenCalled();
    expect(mockWriteTimelineEvent).not.toHaveBeenCalled();
  });

  it("throws QuoArtefactsNotReadyError when the transcript dialogue is empty", async () => {
    selectChain._queue = [[]];
    mockGetCallTranscript.mockResolvedValueOnce({ callId: CALL_ID, dialogue: [] });

    await expect(handleProcessQuoCall({ data: { callId: CALL_ID } })).rejects.toBeInstanceOf(
      QuoArtefactsNotReadyError,
    );

    expect(mockExtractCallData).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Happy path (existing prospect, new contact w/ email)
// ---------------------------------------------------------------------------

describe("handleProcessQuoCall \u2014 happy path", () => {
  it("creates a contact, updates the prospect, writes a timeline event", async () => {
    selectChain._queue = [
      [], // idempotency check \u2014 not processed
      [{ id: PROSPECT_ID, businessName: "Acme Salon" }], // findOrCreate \u2014 prospect exists
      [], // contact lookup \u2014 none exists for this name
    ];
    insertChain._returningQueue = [
      [{ id: CONTACT_ID }], // contact insert
    ];

    await handleProcessQuoCall({
      data: { callId: CALL_ID, hasSummary: true, hasTranscript: true },
    });

    // ----- AI was invoked with transcript + summary text -----
    expect(mockExtractCallData).toHaveBeenCalledTimes(1);
    const aiArgs = mockExtractCallData.mock.calls[0][0];
    expect(aiArgs.summary).toBe(baseSummary.summary);
    expect(aiArgs.transcript).toContain("Hi, this is Jake.");
    expect(aiArgs.transcript).toContain("Sarah here.");
    expect(aiArgs.callerNumber).toBe(PROSPECT_PHONE);
    expect(aiArgs.callDurationSeconds).toBe(65);

    // ----- Contact was inserted with the AI's captured fields -----
    const contactInsertCall = insertChain._calls.find(
      (c) => (c.values as { email?: unknown }).email !== undefined,
    );
    expect(contactInsertCall).toBeDefined();
    const contactValues = contactInsertCall!.values as Record<string, unknown>;
    expect(contactValues.prospectId).toBe(PROSPECT_ID);
    expect(contactValues.firstName).toBe("Sarah");
    expect(contactValues.email).toBe("sarah@acme.example");
    expect(contactValues.roleAtCompany).toBe("Manager");
    expect(contactValues.source).toBe("quo_call");

    // ----- Prospect stage advanced to email_captured -----
    const prospectUpdate = updateChain._calls.find(
      (c) => (c.set as { outreachStage?: unknown }).outreachStage !== undefined,
    );
    expect(prospectUpdate).toBeDefined();
    expect((prospectUpdate!.set as Record<string, unknown>).outreachStage).toBe("email_captured");
    expect((prospectUpdate!.set as Record<string, unknown>).lastTouchedAt).toBeTypeOf("string");

    // ----- Timeline event was a call_made (outgoing call) with full extraction -----
    expect(mockWriteTimelineEvent).toHaveBeenCalledTimes(1);
    const timelineEvent = mockWriteTimelineEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(timelineEvent.eventType).toBe("call_made");
    expect(timelineEvent.prospectId).toBe(PROSPECT_ID);
    expect(timelineEvent.contactId).toBe(CONTACT_ID);
    expect(timelineEvent.title).toContain("Sarah");
    const meta = timelineEvent.metadata as Record<string, unknown>;
    expect(meta.callId).toBe(CALL_ID);
    expect(meta.direction).toBe("outgoing");
    expect(meta.sentiment).toBe("interested");
    expect(meta.summaryBullets).toEqual(baseExtraction.summaryBullets);

    // ----- Call recorded as processed -----
    const processedInsert = insertChain._calls.find(
      (c) => (c.values as { callId?: unknown }).callId === CALL_ID,
    );
    expect(processedInsert).toBeDefined();
    expect((processedInsert!.values as Record<string, unknown>).prospectId).toBe(PROSPECT_ID);
    expect((processedInsert!.values as Record<string, unknown>).contactId).toBe(CONTACT_ID);

    // ----- No follow-up enqueued (extraction had followUpIntent: false) -----
    expect(mockEnqueueProspectFollowUp).not.toHaveBeenCalled();
  });

  it("uses call_received for incoming calls", async () => {
    mockGetCall.mockResolvedValueOnce({
      ...baseCall,
      direction: "incoming",
      from: PROSPECT_PHONE,
      to: OUR_QUO_NUMBER,
    });
    selectChain._queue = [
      [], // idempotency
      [{ id: PROSPECT_ID, businessName: "Acme" }], // prospect exists
      [], // contact lookup empty
    ];
    insertChain._returningQueue = [[{ id: CONTACT_ID }]];

    await handleProcessQuoCall({ data: { callId: CALL_ID } });

    const event = mockWriteTimelineEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(event.eventType).toBe("call_received");
    expect((event.metadata as Record<string, unknown>).direction).toBe("incoming");
  });
});

// ---------------------------------------------------------------------------
// Contact upsert paths
// ---------------------------------------------------------------------------

describe("handleProcessQuoCall \u2014 contact upsert", () => {
  it("updates lastSpokeAt and fills roleAtCompany when the contact already exists with null role", async () => {
    selectChain._queue = [
      [], // idempotency
      [{ id: PROSPECT_ID, businessName: "Acme" }], // prospect
      [{ id: CONTACT_ID, roleAtCompany: null }], // contact exists, no role
    ];

    await handleProcessQuoCall({ data: { callId: CALL_ID } });

    // Find the UPDATE that targeted lastSpokeAt (the contact update).
    const contactUpdate = updateChain._calls.find(
      (c) => (c.set as { lastSpokeAt?: unknown }).lastSpokeAt !== undefined,
    );
    expect(contactUpdate).toBeDefined();
    const set = contactUpdate!.set as Record<string, unknown>;
    expect(set.lastSpokeAt).toBeTypeOf("string");
    // roleAtCompany filled because it was null.
    expect(set.roleAtCompany).toBe("Manager");
  });

  it("does NOT overwrite an admin-set role on an existing contact", async () => {
    selectChain._queue = [
      [],
      [{ id: PROSPECT_ID, businessName: "Acme" }],
      [{ id: CONTACT_ID, roleAtCompany: "Owner" }], // admin already set the role
    ];

    await handleProcessQuoCall({ data: { callId: CALL_ID } });

    const contactUpdate = updateChain._calls.find(
      (c) => (c.set as { lastSpokeAt?: unknown }).lastSpokeAt !== undefined,
    );
    expect(contactUpdate).toBeDefined();
    const set = contactUpdate!.set as Record<string, unknown>;
    expect(set.roleAtCompany).toBeUndefined();
  });

  it("skips contact creation when emailCaptured is null but appends to prospect.notes instead", async () => {
    mockExtractCallData.mockResolvedValueOnce({
      ...baseExtraction,
      emailCaptured: null,
      phoneCaptured: "+15553334444",
    });
    selectChain._queue = [
      [],
      [{ id: PROSPECT_ID, businessName: "Acme" }], // prospect exists
    ];

    await handleProcessQuoCall({ data: { callId: CALL_ID } });

    // No contact insert at all.
    const contactInsert = insertChain._calls.find(
      (c) => (c.values as { email?: unknown }).email !== undefined,
    );
    expect(contactInsert).toBeUndefined();

    // Notes-append update fired \u2014 set object contains `notes`.
    const notesUpdate = updateChain._calls.find(
      (c) => (c.set as { notes?: unknown }).notes !== undefined,
    );
    expect(notesUpdate).toBeDefined();

    // Stage advanced to phone_captured (no email \u2014 phone is the strongest signal).
    const stageUpdate = updateChain._calls.find(
      (c) => (c.set as { outreachStage?: unknown }).outreachStage !== undefined,
    );
    expect((stageUpdate!.set as Record<string, unknown>).outreachStage).toBe("phone_captured");
  });
});

// ---------------------------------------------------------------------------
// Stub-prospect creation
// ---------------------------------------------------------------------------

describe("handleProcessQuoCall \u2014 unmatched prospect", () => {
  it("creates a stub prospect when no phone match is found", async () => {
    selectChain._queue = [
      [], // idempotency
      [], // findOrCreate: no prospect matched
      [], // contact lookup empty
    ];
    insertChain._returningQueue = [
      [{ id: "stub-prospect-id", businessName: `Unknown \u2014 ${PROSPECT_PHONE}` }], // prospect insert
      [{ id: CONTACT_ID }], // contact insert
    ];

    await handleProcessQuoCall({ data: { callId: CALL_ID } });

    // First insert was a stub prospect with Unknown \u2014 <phone> business name.
    const stubInsert = insertChain._calls.find(
      (c) => (c.values as { businessName?: unknown }).businessName !== undefined,
    );
    expect(stubInsert).toBeDefined();
    const stubValues = stubInsert!.values as Record<string, unknown>;
    expect(stubValues.businessName).toContain("Unknown");
    expect(stubValues.phone).toBe(PROSPECT_PHONE);
    expect(stubValues.outreachStage).toBe("called");
  });
});

// ---------------------------------------------------------------------------
// Follow-up scheduling
// ---------------------------------------------------------------------------

describe("handleProcessQuoCall \u2014 follow-up scheduling", () => {
  it("inserts a prospect_follow_ups row and enqueues a scheduled pg-boss job", async () => {
    mockExtractCallData.mockResolvedValueOnce({
      ...baseExtraction,
      followUpIntent: true,
      followUpDate: "2026-05-22",
      followUpReason: "after vacation",
    });
    selectChain._queue = [[], [{ id: PROSPECT_ID, businessName: "Acme" }], []];
    insertChain._returningQueue = [
      [{ id: CONTACT_ID }], // contact insert
      [{ id: "fu_001" }], // prospect_follow_ups insert
    ];

    await handleProcessQuoCall({ data: { callId: CALL_ID } });

    // Follow-up row was inserted with status: pending.
    const followUpInsert = insertChain._calls.find(
      (c) => (c.values as { dueAt?: unknown }).dueAt !== undefined,
    );
    expect(followUpInsert).toBeDefined();
    const followUpValues = followUpInsert!.values as Record<string, unknown>;
    expect(followUpValues.prospectId).toBe(PROSPECT_ID);
    expect(followUpValues.status).toBe("pending");
    expect(followUpValues.source).toBe("ai_extracted");
    expect(followUpValues.reason).toBe("after vacation");
    expect(followUpValues.dueAt).toBe("2026-05-22T09:00:00.000Z");

    // pg-boss job was enqueued for the dueAt.
    expect(mockEnqueueProspectFollowUp).toHaveBeenCalledTimes(1);
    const [payload, opts] = mockEnqueueProspectFollowUp.mock.calls[0];
    expect(payload).toEqual({ followUpId: "fu_001" });
    expect((opts as { dueAt: string }).dueAt).toBe("2026-05-22T09:00:00.000Z");

    // pgbossJobId was stored back on the follow-up row.
    const followUpUpdate = updateChain._calls.find(
      (c) => (c.set as { pgbossJobId?: unknown }).pgbossJobId !== undefined,
    );
    expect(followUpUpdate).toBeDefined();
    expect((followUpUpdate!.set as Record<string, unknown>).pgbossJobId).toBe(
      "pgboss_follow_up_id",
    );

    // A `follow_up_scheduled` timeline event was also written.
    const followUpTimeline = mockWriteTimelineEvent.mock.calls.find(
      (call) => (call[0] as { eventType?: string }).eventType === "follow_up_scheduled",
    );
    expect(followUpTimeline).toBeDefined();
  });

  it("does NOT enqueue a follow-up when followUpIntent is true but followUpDate is null", async () => {
    mockExtractCallData.mockResolvedValueOnce({
      ...baseExtraction,
      followUpIntent: true,
      followUpDate: null,
    });
    selectChain._queue = [[], [{ id: PROSPECT_ID, businessName: "Acme" }], []];
    insertChain._returningQueue = [[{ id: CONTACT_ID }]];

    await handleProcessQuoCall({ data: { callId: CALL_ID } });

    expect(mockEnqueueProspectFollowUp).not.toHaveBeenCalled();
  });
});
