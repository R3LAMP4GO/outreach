import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getDeals,
  getDeal,
  updateDeal,
  deleteDeal,
  moveDeal,
  bulkUpdateDeals,
  bulkDeleteDeals,
  getPipelineDeals,
} from "../deals";

// ---------------------------------------------------------------------------
// Mock Drizzle db
// ---------------------------------------------------------------------------

function createDrizzleChain(resolveValue: unknown = []) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "select",
    "from",
    "where",
    "orderBy",
    "limit",
    "offset",
    "leftJoin",
    "set",
    "returning",
    "update",
    "values",
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(resolveValue);
  return chain;
}

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

// Mock timeline to avoid side-effects
vi.mock("../timeline", () => ({
  writeTimelineEvent: vi.fn(),
  writeTimelineEvents: vi.fn(),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Mock security module
vi.mock("@/lib/security/input-validation", () => ({
  sanitizeSearchForOrFilter: vi.fn((s: string) => s),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getDeals
// ---------------------------------------------------------------------------

describe("getDeals", () => {
  it("fetches pipeline then deals with pagination", async () => {
    // 1st select: pipeline lookup → returns [{id: "p1"}]
    const pipelineChain = createDrizzleChain([{ id: "p1" }]);
    // 2nd+3rd selects: deals query + count query (Promise.all)
    const dealsChain = createDrizzleChain([
      {
        id: "d1",
        name: "Test Deal",
        amount: null,
        probability: null,
        expectedCloseDate: null,
        stageId: "s1",
        contactId: "c1",
        source: null,
        status: "open",
        notes: null,
        stageEnteredAt: null,
        meetingBookedAt: null,
        wonAt: null,
        lostAt: null,
        lostReason: null,
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01",
        cId: "c1",
        cFirstName: "Alice",
        cLastName: "Smith",
        cEmail: "alice@test.com",
        cContactStatus: "lead",
        sId: "s1",
        sName: "Lead",
        sSlug: "lead",
        sColor: "#000",
        sDisplayOrder: 1,
      },
    ]);
    const countChain = createDrizzleChain([{ count: 1 }]);

    mockSelect
      .mockReturnValueOnce(pipelineChain) // pipeline lookup
      .mockReturnValueOnce(dealsChain) // deals query
      .mockReturnValueOnce(countChain); // count query

    const result = await getDeals({ page: 1, limit: 10 });

    expect(result.deals).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it("throws 404 when pipeline not found", async () => {
    // Pipeline lookup returns empty array
    const pipelineChain = createDrizzleChain([]);
    mockSelect.mockReturnValueOnce(pipelineChain);

    await expect(getDeals({ page: 1, limit: 10 })).rejects.toThrow("Pipeline not found");
  });

  it("applies stage filter when stageSlug provided", async () => {
    const pipelineChain = createDrizzleChain([{ id: "p1" }]);
    const stageChain = createDrizzleChain([{ id: "s1" }]);
    const dealsChain = createDrizzleChain([]);
    const countChain = createDrizzleChain([{ count: 0 }]);

    mockSelect
      .mockReturnValueOnce(pipelineChain) // pipeline lookup
      .mockReturnValueOnce(stageChain) // stage lookup
      .mockReturnValueOnce(dealsChain) // deals query
      .mockReturnValueOnce(countChain); // count query

    const result = await getDeals({
      page: 1,
      limit: 10,
      stageSlug: "lead",
    });

    expect(result.deals).toEqual([]);
  });

  it("throws 500 on deals fetch error", async () => {
    const pipelineChain = createDrizzleChain([{ id: "p1" }]);

    // Simulate a thrown error from the deals query
    const errorChain = createDrizzleChain([]);
    errorChain.then = (_resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      if (reject) reject(new Error("db error"));
      else throw new Error("db error");
    };

    mockSelect
      .mockReturnValueOnce(pipelineChain) // pipeline lookup
      .mockReturnValueOnce(errorChain) // deals query - throws
      .mockReturnValueOnce(errorChain); // count query - throws

    await expect(getDeals({ page: 1, limit: 10 })).rejects.toThrow("Failed to fetch deals");
  });
});

// ---------------------------------------------------------------------------
// getDeal
// ---------------------------------------------------------------------------

describe("getDeal", () => {
  it("returns deal with history", async () => {
    const dealRow = {
      id: "d1",
      name: "Test Deal",
      amount: null,
      probability: null,
      expectedCloseDate: null,
      stageId: "s1",
      contactId: "c1",
      source: null,
      status: "open",
      notes: null,
      stageEnteredAt: null,
      meetingBookedAt: null,
      wonAt: null,
      lostAt: null,
      lostReason: null,
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
      cId: "c1",
      cFirstName: "Alice",
      cLastName: "Smith",
      cEmail: "alice@test.com",
      cPhone: null,
      cContactStatus: "lead",
      cSource: null,
      sId: "s1",
      sName: "Lead",
      sSlug: "lead",
      sColor: "#000",
      sDisplayOrder: 1,
    };

    const historyRow = {
      id: "h1",
      dealId: "d1",
      fromStageId: "s0",
      toStageId: "s1",
      changedBy: "user1",
      changedAt: "2024-01-01",
      automated: false,
      notes: null,
      triggerSource: null,
      fsId: "s0",
      fsName: "New",
      fsSlug: "new",
      tsId: "s1",
      tsName: "Lead",
      tsSlug: "lead",
    };

    const dealChain = createDrizzleChain([dealRow]);
    const historyChain = createDrizzleChain([historyRow]);

    mockSelect
      .mockReturnValueOnce(dealChain) // deal query
      .mockReturnValueOnce(historyChain); // history query

    const result = await getDeal("d1");
    expect(result.deal.id).toBe("d1");
    expect(result.deal.name).toBe("Test Deal");
    expect(result.history).toHaveLength(1);
    expect(result.history[0].id).toBe("h1");
  });

  it("throws 404 when deal not found", async () => {
    const dealChain = createDrizzleChain([]);
    mockSelect.mockReturnValueOnce(dealChain);

    await expect(getDeal("d1")).rejects.toThrow("Deal not found");
  });
});

// ---------------------------------------------------------------------------
// updateDeal
// ---------------------------------------------------------------------------

describe("updateDeal", () => {
  it("updates deal without stage change", async () => {
    // 1st select: current deal lookup
    const fetchChain = createDrizzleChain([
      { stageId: "s1", sId: "s1", sName: "Lead", sPipelineId: "p1" },
    ]);

    // update chain
    const updateChain = createDrizzleChain([{ id: "d1", name: "Renamed" }]);

    // 2nd select: fetch full deal after update
    const fullDealChain = createDrizzleChain([
      {
        id: "d1",
        name: "Renamed",
        amount: null,
        probability: null,
        expectedCloseDate: null,
        stageId: "s1",
        contactId: "c1",
        source: null,
        status: "open",
        notes: null,
        stageEnteredAt: null,
        meetingBookedAt: null,
        wonAt: null,
        lostAt: null,
        lostReason: null,
        createdAt: "2024-01-01",
        updatedAt: "2024-01-02",
        cId: "c1",
        cFirstName: "Alice",
        cLastName: "Smith",
        cEmail: "alice@test.com",
        cPhone: null,
        cContactStatus: "lead",
        cSource: null,
        sId: "s1",
        sName: "Lead",
        sSlug: "lead",
        sColor: "#000",
        sDisplayOrder: 1,
      },
    ]);

    mockSelect.mockReturnValueOnce(fetchChain).mockReturnValueOnce(fullDealChain);
    mockUpdate.mockReturnValueOnce(updateChain);

    const result = await updateDeal("d1", { name: "Renamed" }, "user1");

    expect(result.deal.name).toBe("Renamed");
  });

  it("validates stage belongs to same pipeline on stage change", async () => {
    const fetchChain = createDrizzleChain([
      { stageId: "s1", sId: "s1", sName: "Lead", sPipelineId: "p1" },
    ]);

    // Stage lookup returns different pipeline
    const stageChain = createDrizzleChain([{ pipelineId: "p2" }]);

    mockSelect.mockReturnValueOnce(fetchChain).mockReturnValueOnce(stageChain);

    await expect(updateDeal("d1", { stage_id: "s2" }, "user1")).rejects.toThrow(
      "Cannot move deal to a stage in a different pipeline",
    );
  });

  it("throws 404 when deal not found", async () => {
    const chain = createDrizzleChain([]);
    mockSelect.mockReturnValueOnce(chain);

    await expect(updateDeal("d1", { name: "X" }, "user1")).rejects.toThrow("Deal not found");
  });

  it("creates stage history on stage change", async () => {
    // Current deal lookup
    const fetchChain = createDrizzleChain([
      { stageId: "s1", sId: "s1", sName: "Lead", sPipelineId: "p1" },
    ]);

    // Stage validation — same pipeline
    const stageValidationChain = createDrizzleChain([{ pipelineId: "p1" }]);

    // Update returning
    const updateChain = createDrizzleChain([{ id: "d1", stageId: "s2" }]);

    // Full deal fetch after update
    const fullDealChain = createDrizzleChain([
      {
        id: "d1",
        name: "Test Deal",
        amount: null,
        probability: null,
        expectedCloseDate: null,
        stageId: "s2",
        contactId: "c1",
        source: null,
        status: "open",
        notes: null,
        stageEnteredAt: null,
        meetingBookedAt: null,
        wonAt: null,
        lostAt: null,
        lostReason: null,
        createdAt: "2024-01-01",
        updatedAt: "2024-01-02",
        cId: "c1",
        cFirstName: "Alice",
        cLastName: "Smith",
        cEmail: "alice@test.com",
        cPhone: null,
        cContactStatus: "lead",
        cSource: null,
        sId: "s2",
        sName: "Contacted",
        sSlug: "contacted",
        sColor: "#111",
        sDisplayOrder: 2,
      },
    ]);

    // Insert history chain
    const historyChain = createDrizzleChain(undefined);

    mockSelect
      .mockReturnValueOnce(fetchChain) // current deal
      .mockReturnValueOnce(stageValidationChain) // stage validation
      .mockReturnValueOnce(fullDealChain); // full deal fetch
    mockUpdate.mockReturnValueOnce(updateChain);
    mockInsert.mockReturnValueOnce(historyChain);

    const result = await updateDeal("d1", { stage_id: "s2" }, "user1");

    expect(result.deal.stage_id).toBe("s2");
    expect(mockInsert).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteDeal
// ---------------------------------------------------------------------------

describe("deleteDeal", () => {
  it("deletes deal and its history", async () => {
    const fetchChain = createDrizzleChain([{ id: "d1" }]);
    const historyDeleteChain = createDrizzleChain(undefined);
    const outreachUpdateChain = createDrizzleChain(undefined);
    const dealDeleteChain = createDrizzleChain(undefined);

    mockSelect.mockReturnValueOnce(fetchChain);
    mockDelete
      .mockReturnValueOnce(historyDeleteChain) // delete history
      .mockReturnValueOnce(dealDeleteChain); // delete deal
    mockUpdate.mockReturnValueOnce(outreachUpdateChain); // null out outreach_replies.crm_deal_id

    const result = await deleteDeal("d1");
    expect(result.message).toBe("Deal deleted successfully");
  });

  it("throws 404 when deal not found", async () => {
    const chain = createDrizzleChain([]);
    mockSelect.mockReturnValueOnce(chain);

    await expect(deleteDeal("d1")).rejects.toThrow("Deal not found");
  });

  it("throws on history delete failure", async () => {
    const fetchChain = createDrizzleChain([{ id: "d1" }]);

    // History delete throws
    const historyChain = createDrizzleChain([]);
    historyChain.then = (_resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      if (reject) reject(new Error("history fail"));
      else throw new Error("history fail");
    };

    mockSelect.mockReturnValueOnce(fetchChain);
    mockDelete.mockReturnValueOnce(historyChain);

    await expect(deleteDeal("d1")).rejects.toThrow("Failed to delete stage history");
  });
});

// ---------------------------------------------------------------------------
// moveDeal
// ---------------------------------------------------------------------------

describe("moveDeal", () => {
  it("moves deal and creates history", async () => {
    // Current deal lookup
    const dealChain = createDrizzleChain([
      { stageId: "s1", name: "Deal", sId: "s1", sName: "Lead", sPipelineId: "p1" },
    ]);

    // New stage validation
    const stageChain = createDrizzleChain([{ id: "s2", pipelineId: "p1" }]);

    // Update chain
    const updateChain = createDrizzleChain(undefined);

    // Full deal fetch after update
    const fullDealChain = createDrizzleChain([
      {
        id: "d1",
        name: "Deal",
        amount: null,
        probability: null,
        expectedCloseDate: null,
        stageId: "s2",
        contactId: "c1",
        source: null,
        status: "open",
        notes: null,
        stageEnteredAt: null,
        meetingBookedAt: null,
        wonAt: null,
        lostAt: null,
        lostReason: null,
        createdAt: "2024-01-01",
        updatedAt: "2024-01-02",
        cId: "c1",
        cFirstName: "Alice",
        cLastName: "Smith",
        cEmail: "alice@test.com",
        cContactStatus: "lead",
        sId: "s2",
        sName: "Contacted",
        sSlug: "contacted",
        sColor: "#111",
        sDisplayOrder: 2,
      },
    ]);

    // History insert chain
    const historyChain = createDrizzleChain(undefined);

    mockSelect
      .mockReturnValueOnce(dealChain) // current deal
      .mockReturnValueOnce(stageChain) // stage validation
      .mockReturnValueOnce(fullDealChain); // full deal fetch
    mockUpdate.mockReturnValueOnce(updateChain);
    mockInsert.mockReturnValueOnce(historyChain);

    const result = await moveDeal({
      dealId: "d1",
      stageId: "s2",
      userId: "user1",
    });

    expect(result.message).toBe("Deal moved successfully");
    expect(result.deal.stage_id).toBe("s2");
  });

  it("throws when target stage is in different pipeline", async () => {
    const dealChain = createDrizzleChain([
      { stageId: "s1", name: "Deal", sId: "s1", sName: "Lead", sPipelineId: "p1" },
    ]);

    const stageChain = createDrizzleChain([{ id: "s2", pipelineId: "p2" }]);

    mockSelect.mockReturnValueOnce(dealChain).mockReturnValueOnce(stageChain);

    await expect(moveDeal({ dealId: "d1", stageId: "s2", userId: "u1" })).rejects.toThrow(
      "Cannot move deal to a stage in a different pipeline",
    );
  });

  it("logs warning but succeeds when history insert fails (non-transactional)", async () => {
    const dealChain = createDrizzleChain([
      { stageId: "s1", name: "Deal", sId: "s1", sName: "Lead", sPipelineId: "p1" },
    ]);

    const stageChain = createDrizzleChain([{ id: "s2", pipelineId: "p1" }]);
    const updateChain = createDrizzleChain(undefined);

    const fullDealChain = createDrizzleChain([
      {
        id: "d1",
        name: "Deal",
        amount: null,
        probability: null,
        expectedCloseDate: null,
        stageId: "s2",
        contactId: "c1",
        source: null,
        status: "open",
        notes: null,
        stageEnteredAt: null,
        meetingBookedAt: null,
        wonAt: null,
        lostAt: null,
        lostReason: null,
        createdAt: "2024-01-01",
        updatedAt: "2024-01-02",
        cId: "c1",
        cFirstName: "Alice",
        cLastName: "Smith",
        cEmail: "alice@test.com",
        cContactStatus: "lead",
        sId: "s2",
        sName: "Contacted",
        sSlug: "contacted",
        sColor: "#111",
        sDisplayOrder: 2,
      },
    ]);

    // History insert fails
    const historyChain = createDrizzleChain([]);
    historyChain.then = (_resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      if (reject) reject(new Error("history insert failed"));
      else throw new Error("history insert failed");
    };

    mockSelect
      .mockReturnValueOnce(dealChain)
      .mockReturnValueOnce(stageChain)
      .mockReturnValueOnce(fullDealChain);
    mockUpdate.mockReturnValueOnce(updateChain);
    mockInsert.mockReturnValueOnce(historyChain);

    // Should NOT throw — moveDeal logs warning on history failure
    const result = await moveDeal({
      dealId: "d1",
      stageId: "s2",
      userId: "u1",
    });

    expect(result.deal.stage_id).toBe("s2");
    expect(result.message).toBe("Deal moved successfully");
  });

  it("throws 400 for invalid stage ID", async () => {
    const dealChain = createDrizzleChain([
      { stageId: "s1", name: "Deal", sId: "s1", sName: "Lead", sPipelineId: "p1" },
    ]);

    const stageChain = createDrizzleChain([]);

    mockSelect.mockReturnValueOnce(dealChain).mockReturnValueOnce(stageChain);

    await expect(moveDeal({ dealId: "d1", stageId: "bad", userId: "u1" })).rejects.toThrow(
      "Invalid stage ID",
    );
  });
});

// ---------------------------------------------------------------------------
// bulkUpdateDeals
// ---------------------------------------------------------------------------

describe("bulkUpdateDeals", () => {
  it("updates deals and creates history entries on stage change", async () => {
    // Verify deals exist
    const checkChain = createDrizzleChain([
      { id: "d1", stageId: "s1", contactId: "c1" },
      { id: "d2", stageId: "s1", contactId: "c2" },
    ]);

    // Stage lookup from slug
    const stageChain = createDrizzleChain([{ id: "s2" }]);

    // Update returning
    const updateChain = createDrizzleChain([
      {
        id: "d1",
        name: "Deal1",
        amount: null,
        probability: null,
        expectedCloseDate: null,
        stageId: "s2",
        contactId: "c1",
        source: null,
        status: "open",
        notes: null,
        stageEnteredAt: null,
        meetingBookedAt: null,
        wonAt: null,
        lostAt: null,
        lostReason: null,
        createdAt: "2024-01-01",
        updatedAt: "2024-01-02",
      },
      {
        id: "d2",
        name: "Deal2",
        amount: null,
        probability: null,
        expectedCloseDate: null,
        stageId: "s2",
        contactId: "c2",
        source: null,
        status: "open",
        notes: null,
        stageEnteredAt: null,
        meetingBookedAt: null,
        wonAt: null,
        lostAt: null,
        lostReason: null,
        createdAt: "2024-01-01",
        updatedAt: "2024-01-02",
      },
    ]);

    // History insert
    const historyChain = createDrizzleChain(undefined);

    // Stage name lookups for timeline events
    const fromStageNamesChain = createDrizzleChain([{ id: "s1", name: "Lead" }]);
    const toStageNameChain = createDrizzleChain([{ name: "Contacted" }]);

    mockSelect
      .mockReturnValueOnce(checkChain) // verify deals
      .mockReturnValueOnce(stageChain) // stage from slug
      .mockReturnValueOnce(fromStageNamesChain) // from stage names
      .mockReturnValueOnce(toStageNameChain); // to stage name
    mockUpdate.mockReturnValueOnce(updateChain);
    mockInsert.mockReturnValueOnce(historyChain);

    const result = await bulkUpdateDeals({
      deal_ids: ["d1", "d2"],
      updates: { stage_slug: "contacted" },
      userId: "user1",
    });

    expect(result.updated).toBe(2);
  });

  it("throws 404 when some deals not found", async () => {
    const chain = createDrizzleChain([{ id: "d1", stageId: "s1", contactId: "c1" }]);
    mockSelect.mockReturnValueOnce(chain);

    await expect(
      bulkUpdateDeals({
        deal_ids: ["d1", "d2"],
        updates: {},
        userId: "u1",
      }),
    ).rejects.toThrow("Some deals not found");
  });
});

// ---------------------------------------------------------------------------
// bulkDeleteDeals
// ---------------------------------------------------------------------------

describe("bulkDeleteDeals", () => {
  it("deletes deals and their history", async () => {
    const checkChain = createDrizzleChain([{ id: "d1" }, { id: "d2" }]);
    const historyDeleteChain = createDrizzleChain(undefined);
    const outreachUpdateChain = createDrizzleChain(undefined);
    const dealDeleteChain = createDrizzleChain(undefined);

    mockSelect.mockReturnValueOnce(checkChain);
    mockDelete.mockReturnValueOnce(historyDeleteChain).mockReturnValueOnce(dealDeleteChain);
    mockUpdate.mockReturnValueOnce(outreachUpdateChain); // null out outreach_replies.crm_deal_id

    const result = await bulkDeleteDeals(["d1", "d2"]);

    expect(result.deleted).toBe(2);
    expect(result.message).toContain("2 deals");
  });

  it("throws 404 when no deals found", async () => {
    const chain = createDrizzleChain([]);
    mockSelect.mockReturnValueOnce(chain);

    await expect(bulkDeleteDeals(["d1"])).rejects.toThrow("No deals found");
  });
});

// ---------------------------------------------------------------------------
// getPipelineDeals
// ---------------------------------------------------------------------------

describe("getPipelineDeals", () => {
  it("returns stages with deals grouped by stage slug", async () => {
    // Pipeline lookup
    const pipelineChain = createDrizzleChain([{ id: "p1" }]);

    // Stages query
    const stageRows = [
      {
        id: "s1",
        name: "Lead",
        slug: "lead",
        color: "#000",
        description: null,
        displayOrder: 1,
        isTerminal: false,
        isPositive: false,
        pipelineId: "p1",
        createdAt: "2024-01-01",
      },
      {
        id: "s2",
        name: "Won",
        slug: "won",
        color: "#0f0",
        description: null,
        displayOrder: 2,
        isTerminal: true,
        isPositive: true,
        pipelineId: "p1",
        createdAt: "2024-01-01",
      },
    ];
    const stagesChain = createDrizzleChain(stageRows);

    // Deals query
    const dealRows = [
      {
        id: "d1",
        name: "Deal1",
        amount: null,
        probability: null,
        expectedCloseDate: null,
        stageId: "s1",
        contactId: "c1",
        source: null,
        status: "open",
        notes: null,
        stageEnteredAt: null,
        meetingBookedAt: null,
        wonAt: null,
        lostAt: null,
        lostReason: null,
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01",
        cId: "c1",
        cFirstName: "Alice",
        cLastName: "Smith",
        cEmail: "alice@test.com",
        cContactStatus: "lead",
        sId: "s1",
        sName: "Lead",
        sSlug: "lead",
        sColor: "#000",
        sDisplayOrder: 1,
      },
      {
        id: "d2",
        name: "Deal2",
        amount: null,
        probability: null,
        expectedCloseDate: null,
        stageId: "s2",
        contactId: "c2",
        source: null,
        status: "open",
        notes: null,
        stageEnteredAt: null,
        meetingBookedAt: null,
        wonAt: null,
        lostAt: null,
        lostReason: null,
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01",
        cId: "c2",
        cFirstName: "Bob",
        cLastName: "Jones",
        cEmail: "bob@test.com",
        cContactStatus: "lead",
        sId: "s2",
        sName: "Won",
        sSlug: "won",
        sColor: "#0f0",
        sDisplayOrder: 2,
      },
      {
        id: "d3",
        name: "Deal3",
        amount: null,
        probability: null,
        expectedCloseDate: null,
        stageId: "s1",
        contactId: "c3",
        source: null,
        status: "open",
        notes: null,
        stageEnteredAt: null,
        meetingBookedAt: null,
        wonAt: null,
        lostAt: null,
        lostReason: null,
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01",
        cId: "c3",
        cFirstName: "Carol",
        cLastName: "Danvers",
        cEmail: "carol@test.com",
        cContactStatus: "lead",
        sId: "s1",
        sName: "Lead",
        sSlug: "lead",
        sColor: "#000",
        sDisplayOrder: 1,
      },
    ];
    const dealsChain = createDrizzleChain(dealRows);

    mockSelect
      .mockReturnValueOnce(pipelineChain) // pipeline
      .mockReturnValueOnce(stagesChain) // stages
      .mockReturnValueOnce(dealsChain); // deals

    const result = await getPipelineDeals();

    expect(result.stages).toHaveLength(2);
    expect(result.dealsByStage["lead"]).toHaveLength(2);
    expect(result.dealsByStage["won"]).toHaveLength(1);
    expect(result.totalDeals).toBe(3);
  });

  it("throws 404 when pipeline not found", async () => {
    const chain = createDrizzleChain([]);
    mockSelect.mockReturnValueOnce(chain);

    await expect(getPipelineDeals()).rejects.toThrow("Pipeline not found");
  });

  it("returns empty stages when no deals exist", async () => {
    const pipelineChain = createDrizzleChain([{ id: "p1" }]);

    const stageRows = [
      {
        id: "s1",
        name: "Lead",
        slug: "lead",
        color: "#000",
        description: null,
        displayOrder: 1,
        isTerminal: false,
        isPositive: false,
        pipelineId: "p1",
        createdAt: "2024-01-01",
      },
    ];
    const stagesChain = createDrizzleChain(stageRows);
    const dealsChain = createDrizzleChain([]);

    mockSelect
      .mockReturnValueOnce(pipelineChain)
      .mockReturnValueOnce(stagesChain)
      .mockReturnValueOnce(dealsChain);

    const result = await getPipelineDeals();

    expect(result.dealsByStage["lead"]).toEqual([]);
    expect(result.totalDeals).toBe(0);
  });
});
