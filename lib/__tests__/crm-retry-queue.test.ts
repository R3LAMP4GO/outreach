import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @/lib/db — intercept Drizzle query builder calls
// ---------------------------------------------------------------------------
// The crm-retry-queue module uses:
//   db.insert(table).values({...})           -> enqueueCrmOperation
//   db.execute(sql`...`)                     -> processCrmQueue (atomic claim + executeOperation)
//   db.update(table).set({...}).where(...)   -> mark processing/completed/failed
//   db.delete(table).where(...).returning()  -> cleanupCrmQueue

const mockInsertValues = vi.fn();
const mockInsert = vi.fn((_arg: unknown) => ({ values: mockInsertValues }));

const mockExecute = vi.fn();

const mockUpdateWhere = vi.fn();
const mockUpdateSet = vi.fn((_arg: unknown) => ({ where: mockUpdateWhere }));
const mockUpdate = vi.fn((_arg: unknown) => ({ set: mockUpdateSet }));

const mockDeleteReturning = vi.fn();
const mockDeleteWhere = vi.fn((_arg: unknown) => ({ returning: mockDeleteReturning }));
const mockDelete = vi.fn((_arg: unknown) => ({ where: mockDeleteWhere }));

vi.mock("@/lib/db", () => ({
  db: {
    insert: (arg: unknown) => mockInsert(arg),
    execute: (arg: unknown) => mockExecute(arg),
    update: (arg: unknown) => mockUpdate(arg),
    delete: (arg: unknown) => mockDelete(arg),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { enqueueCrmOperation, processCrmQueue, cleanupCrmQueue } from "../crm-retry-queue";

beforeEach(() => {
  vi.clearAllMocks();

  // Default: insert succeeds
  mockInsertValues.mockResolvedValue([]);

  // Default: execute returns empty (no queue items)
  mockExecute.mockResolvedValue([]);

  // Default: update and delete succeed
  mockUpdateWhere.mockResolvedValue([]);
  mockDeleteReturning.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// enqueueCrmOperation
// ---------------------------------------------------------------------------

describe("enqueueCrmOperation", () => {
  it("inserts a queue item with pending status and retry time", async () => {
    mockInsertValues.mockResolvedValue([]);

    await enqueueCrmOperation(
      "upsert_contact",
      {
        email: "test@example.com",
        firstName: "Test",
        lastName: "User",
        phone: "123",
        company: null,
        notes: "",
        contactStatus: "lead",
        source: "contact_form",
        originalSource: "contact_form",
        originalSourceDetail: "",
        originalUtmSource: null,
        originalUtmMedium: null,
        originalUtmCampaign: null,
        latestSource: "contact_form",
        latestSourceDetail: "",
        latestUtmSource: null,
        latestUtmMedium: null,
        latestUtmCampaign: null,
        firstTouchDate: new Date().toISOString(),
        lastTouchDate: new Date().toISOString(),
      },
      "sub-123",
    );

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: "upsert_contact",
        status: "pending",
        attempts: 0,
        maxAttempts: 5,
      }),
    );
  });

  it("does not throw when insert fails (logs error instead)", async () => {
    mockInsertValues.mockRejectedValue(new Error("db down"));

    // Should not throw
    await expect(
      enqueueCrmOperation("create_deal", {
        contactId: "c1",
        dealName: "Deal",
        stageId: "s1",
        notes: "",
        source: "contact_form",
        stageEnteredAt: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// processCrmQueue
// ---------------------------------------------------------------------------

describe("processCrmQueue", () => {
  it("returns zeros when no items in queue", async () => {
    // db.execute returns empty array -> no items to process
    mockExecute.mockResolvedValue([]);

    const result = await processCrmQueue();

    expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0 });
  });

  it("returns zeros on fetch error", async () => {
    mockExecute.mockRejectedValue(new Error("fetch fail"));

    const result = await processCrmQueue();

    expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0 });
  });

  it("processes a successful upsert_contact item", async () => {
    const claimedRow = {
      id: "q1",
      operation_type: "upsert_contact",
      payload: {
        email: "test@example.com",
        firstName: "T",
        lastName: "U",
        phone: "",
        company: null,
        notes: "",
        contactStatus: "lead",
        source: "contact_form",
        originalSource: "contact_form",
        originalSourceDetail: "",
        originalUtmSource: null,
        originalUtmMedium: null,
        originalUtmCampaign: null,
        latestSource: "contact_form",
        latestSourceDetail: "",
        latestUtmSource: null,
        latestUtmMedium: null,
        latestUtmCampaign: null,
        firstTouchDate: "2025-01-01",
        lastTouchDate: "2025-01-01",
      },
      submission_id: null,
      contact_id: null,
      attempts: 0,
      max_attempts: 5,
    };

    // First db.execute call: atomic claim → returns the claimed row
    // Second db.execute call: inside executeOperation for upsert_contact → returns result
    mockExecute.mockResolvedValueOnce([claimedRow]).mockResolvedValueOnce([
      {
        contact_id: "c1",
        created: true,
        updated: false,
        status_applied: "lead",
      },
    ]);

    const result = await processCrmQueue();

    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("marks item as failed when max retries exceeded", async () => {
    const claimedRow = {
      id: "q1",
      operation_type: "upsert_contact",
      payload: { email: "test@example.com" },
      submission_id: null,
      contact_id: null,
      attempts: 4, // Already at max - 1
      max_attempts: 5,
    };

    // First execute: claim returns row
    // Second execute: upsert_contact operation throws/fails -> returns empty (no result)
    mockExecute.mockResolvedValueOnce([claimedRow]).mockResolvedValueOnce([]); // no row returned -> executeOperation returns false

    const result = await processCrmQueue();

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(0);
  });

  it("schedules retry with backoff when operation fails but retries remain", async () => {
    const claimedRow = {
      id: "q1",
      operation_type: "upsert_contact",
      payload: { email: "test@example.com" },
      submission_id: null,
      contact_id: null,
      attempts: 1,
      max_attempts: 5,
    };

    // First execute: claim returns row
    // Second execute: operation fails (no result row)
    mockExecute.mockResolvedValueOnce([claimedRow]).mockResolvedValueOnce([]);

    const result = await processCrmQueue();

    expect(result.processed).toBe(1);
    // It's not counted as succeeded or "permanently" failed
    expect(result.succeeded).toBe(0);
    // The item is re-queued as pending, not counted as final failure
    expect(result.failed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// cleanupCrmQueue
// ---------------------------------------------------------------------------

describe("cleanupCrmQueue", () => {
  it("deletes old completed/failed items and returns count", async () => {
    mockDeleteReturning.mockResolvedValue([{ id: "q1" }, { id: "q2" }]);

    const result = await cleanupCrmQueue(7);

    expect(result).toBe(2);
    // Verify delete was called (the where clause uses inArray on status)
    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteWhere).toHaveBeenCalled();
    expect(mockDeleteReturning).toHaveBeenCalled();
  });

  it("returns 0 on error", async () => {
    mockDeleteReturning.mockRejectedValue(new Error("fail"));

    const result = await cleanupCrmQueue();

    expect(result).toBe(0);
  });
});
