/**
 * Tests for the `fire-follow-up` pg-boss handler.
 *
 * Mocking strategy mirrors `process-quo-call.test.ts`:
 * - `db.select` is a scripted chain that yields the next entry from a queue,
 *   so each call to `db.select(...).from(...).where(...).limit(1)` returns
 *   whatever the test scripted next.
 * - `db.insert(notifications).values({...})` is captured on the insert chain
 *   so we can assert exactly which fields were written.
 *
 * Coverage
 * --------
 * 1. Pending follow-up \u2192 notification created with correct fields,
 *    `relatedId` linking back to the prospect, and `userId` resolved from
 *    `prospects.assignedUserId`.
 * 2. Cancelled follow-up \u2192 handler returns early, no SELECT for prospect,
 *    no insert.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockSelect, mockInsert, selectChain, insertChain } = vi.hoisted(() => {
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

  function createInsertChain() {
    const calls: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    let currentTable: unknown = null;
    const chain: Record<string, unknown> & {
      _calls: typeof calls;
      _setTable: (t: unknown) => void;
      values: ReturnType<typeof vi.fn>;
    } = {
      _calls: calls,
      _setTable: (t: unknown) => {
        currentTable = t;
      },
      values: vi.fn(),
    };
    chain.values = vi.fn().mockImplementation((v: Record<string, unknown>) => {
      calls.push({ table: currentTable, values: v });
      return Promise.resolve(undefined);
    });
    return chain;
  }

  const selectChain = createSelectChain();
  const insertChain = createInsertChain();

  return {
    selectChain,
    insertChain,
    mockSelect: vi.fn().mockReturnValue(selectChain),
    mockInsert: vi.fn().mockImplementation((table: unknown) => {
      insertChain._setTable(table);
      return insertChain;
    }),
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/worker", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  adminUsers: "admin_users_table",
  contacts: "contacts_table",
  notifications: "notifications_table",
  prospectFollowUps: "prospect_follow_ups_table",
  prospects: "prospects_table",
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((..._args) => "eq-cond"),
  and: vi.fn((..._args) => "and-cond"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { handleFireFollowUp } from "../fire-follow-up";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FOLLOW_UP_ID = "00000000-0000-0000-0000-000000000fff";
const PROSPECT_ID = "00000000-0000-0000-0000-000000000aaa";
const CONTACT_ID = "00000000-0000-0000-0000-000000000bbb";
const ASSIGNED_USER_ID = "00000000-0000-0000-0000-000000000111";

const pendingFollowUp = {
  id: FOLLOW_UP_ID,
  prospectId: PROSPECT_ID,
  contactId: CONTACT_ID,
  reason: "after vacation",
  status: "pending",
};

const baseProspect = {
  id: PROSPECT_ID,
  businessName: "Acme Salon",
  assignedUserId: ASSIGNED_USER_ID,
};

const baseContact = {
  firstName: "Sarah",
  lastName: "Lee",
};

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  selectChain._queue = [];
  insertChain._calls.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleFireFollowUp \u2014 pending", () => {
  it("creates a follow_up_due notification with the correct fields", async () => {
    selectChain._queue = [
      [pendingFollowUp], // 1. follow-up lookup
      [baseProspect], //    2. prospect lookup
      [baseContact], //     3. contact lookup
      // No 4th SELECT \u2014 prospect.assignedUserId is set, so the admin fallback
      // SELECT is skipped.
    ];

    await handleFireFollowUp({ data: { followUpId: FOLLOW_UP_ID } });

    // ----- A single notification insert fired -----
    const notificationInserts = insertChain._calls.filter((c) => c.table === "notifications_table");
    expect(notificationInserts).toHaveLength(1);

    const values = notificationInserts[0].values;
    expect(values.userId).toBe(ASSIGNED_USER_ID);
    expect(values.type).toBe("follow_up_due");
    expect(values.priority).toBe("INFO");
    expect(values.title).toBe("Follow up: Sarah Lee");
    expect(values.message).toBe("after vacation");
    // relatedId is the prospect id so the UI can link to /admin/prospecting/{id}
    expect(values.relatedId).toBe(PROSPECT_ID);
    expect(values.relatedType).toBe("prospect");
  });

  it("falls back to businessName when there is no contact", async () => {
    selectChain._queue = [
      [{ ...pendingFollowUp, contactId: null }],
      [baseProspect],
      // No contact SELECT because contactId is null.
    ];

    await handleFireFollowUp({ data: { followUpId: FOLLOW_UP_ID } });

    const insert = insertChain._calls.find((c) => c.table === "notifications_table");
    expect(insert).toBeDefined();
    expect(insert!.values.title).toBe("Follow up: Acme Salon");
  });

  it("falls back to the first admin when the prospect has no assignedUserId", async () => {
    const FIRST_ADMIN_ID = "00000000-0000-0000-0000-0000000099aa";
    selectChain._queue = [
      [pendingFollowUp],
      [{ ...baseProspect, assignedUserId: null }],
      [baseContact],
      [{ id: FIRST_ADMIN_ID }], // admin fallback
    ];

    await handleFireFollowUp({ data: { followUpId: FOLLOW_UP_ID } });

    const insert = insertChain._calls.find((c) => c.table === "notifications_table");
    expect(insert).toBeDefined();
    expect(insert!.values.userId).toBe(FIRST_ADMIN_ID);
  });

  it("uses 'Scheduled follow-up' when reason is null", async () => {
    selectChain._queue = [[{ ...pendingFollowUp, reason: null }], [baseProspect], [baseContact]];

    await handleFireFollowUp({ data: { followUpId: FOLLOW_UP_ID } });

    const insert = insertChain._calls.find((c) => c.table === "notifications_table");
    expect(insert).toBeDefined();
    expect(insert!.values.message).toBe("Scheduled follow-up");
  });
});

describe("handleFireFollowUp \u2014 short-circuits", () => {
  it("does not insert a notification when the follow-up is cancelled", async () => {
    selectChain._queue = [[{ ...pendingFollowUp, status: "cancelled" }]];

    await handleFireFollowUp({ data: { followUpId: FOLLOW_UP_ID } });

    // No further SELECTs (no prospect lookup), no inserts.
    expect(mockInsert).not.toHaveBeenCalled();
    // First-pass SELECT happened (the follow-up lookup) but nothing else.
    expect(selectChain._queue).toHaveLength(0);
  });

  it("does not insert a notification when the follow-up is completed", async () => {
    selectChain._queue = [[{ ...pendingFollowUp, status: "completed" }]];

    await handleFireFollowUp({ data: { followUpId: FOLLOW_UP_ID } });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("does not insert a notification when the follow-up no longer exists", async () => {
    selectChain._queue = [[]]; // empty row set

    await handleFireFollowUp({ data: { followUpId: FOLLOW_UP_ID } });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("does not insert when no admin user can be resolved as fallback recipient", async () => {
    selectChain._queue = [
      [pendingFollowUp],
      [{ ...baseProspect, assignedUserId: null }],
      [baseContact],
      [], // admin fallback returns no rows
    ];

    await handleFireFollowUp({ data: { followUpId: FOLLOW_UP_ID } });

    expect(mockInsert).not.toHaveBeenCalled();
  });
});
