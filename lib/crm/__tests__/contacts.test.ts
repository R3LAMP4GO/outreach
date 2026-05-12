import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getContacts,
  getContact,
  updateContact,
  bulkUpdateContacts,
  bulkDeleteContacts,
} from "../contacts";
import { CrmError } from "../types";

// ---------------------------------------------------------------------------
// Mock Drizzle db
// ---------------------------------------------------------------------------

// Build a chainable mock that records calls and resolves to configurable data
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
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Make the chain thenable so `await db.select()...` resolves
  chain.then = (resolve: (v: unknown) => void) => resolve(resolveValue);
  return chain;
}

const mockExecute = vi.fn();

// We need a mock db that can return different chains for sequential calls
const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
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

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getContacts", () => {
  it("returns paginated contacts", async () => {
    const contactRows = [
      {
        id: "1",
        firstName: "Alice",
        lastName: null,
        email: "alice@test.com",
        phone: null,
        contactStatus: "lead",
        source: null,
        company: null,
        jobTitle: null,
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01",
      },
    ];

    // getContacts does two parallel queries via Promise.all:
    // 1. db.select({...}).from().where().orderBy().limit().offset() → contactRows
    // 2. db.select({count}).from().where() → [{count: 1}]
    const contactChain = createDrizzleChain(contactRows);
    const countChain = createDrizzleChain([{ count: 1 }]);
    mockSelect.mockReturnValueOnce(contactChain).mockReturnValueOnce(countChain);

    const result = await getContacts({ page: 1, limit: 10 });

    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).toEqual(expect.objectContaining({ id: "1", first_name: "Alice" }));
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it("returns empty when search sanitizes to empty string", async () => {
    const result = await getContacts({
      search: "   ",
      page: 1,
      limit: 10,
    });

    expect(result.contacts).toEqual([]);
    expect(result.total).toBe(0);
    // db.select should not have been called since sanitized search is empty
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("applies search filter", async () => {
    const contactChain = createDrizzleChain([]);
    const countChain = createDrizzleChain([{ count: 0 }]);
    mockSelect.mockReturnValueOnce(contactChain).mockReturnValueOnce(countChain);

    const result = await getContacts({ search: "alice", page: 1, limit: 10 });

    expect(result.contacts).toEqual([]);
    expect(result.total).toBe(0);
    // where() should have been called on both chains (with search condition)
    expect(contactChain.where).toHaveBeenCalled();
    expect(countChain.where).toHaveBeenCalled();
  });

  it("applies status filter", async () => {
    const contactChain = createDrizzleChain([]);
    const countChain = createDrizzleChain([{ count: 0 }]);
    mockSelect.mockReturnValueOnce(contactChain).mockReturnValueOnce(countChain);

    const result = await getContacts({ status: "lead", page: 1, limit: 10 });

    expect(result.contacts).toEqual([]);
    expect(contactChain.where).toHaveBeenCalled();
  });

  it("skips status filter when status is 'all'", async () => {
    const contactChain = createDrizzleChain([]);
    const countChain = createDrizzleChain([{ count: 0 }]);
    mockSelect.mockReturnValueOnce(contactChain).mockReturnValueOnce(countChain);

    const result = await getContacts({ status: "all", page: 1, limit: 10 });

    expect(result.contacts).toEqual([]);
    // where is called with `undefined` when no conditions
    expect(contactChain.where).toHaveBeenCalledWith(undefined);
  });

  it("calculates correct offset for page 3", async () => {
    const contactChain = createDrizzleChain([]);
    const countChain = createDrizzleChain([{ count: 0 }]);
    mockSelect.mockReturnValueOnce(contactChain).mockReturnValueOnce(countChain);

    await getContacts({ page: 3, limit: 20 });

    // offset should be (3-1)*20 = 40
    expect(contactChain.offset).toHaveBeenCalledWith(40);
    expect(contactChain.limit).toHaveBeenCalledWith(20);
  });
});

describe("getContact", () => {
  it("throws 404 for invalid UUID", async () => {
    await expect(getContact("not-a-uuid")).rejects.toThrow(CrmError);
    await expect(getContact("not-a-uuid")).rejects.toThrow("Contact not found");
  });

  it("returns contact with deals and timeline", async () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const contactRow = {
      id,
      firstName: "Alice",
      lastName: "Smith",
      email: "alice@test.com",
      phone: null,
      company: "Acme",
      jobTitle: null,
      contactStatus: "lead",
      source: "website",
      sourceDetail: null,
      tags: null,
      notes: null,
      linkedinUrl: null,
      website: null,
      industry: null,
      seniority: null,
      location: null,
      country: null,
      isNewsletterSubscriber: false,
      firstTouchDate: null,
      lastTouchDate: null,
      latestSource: null,
      latestSourceDetail: null,
      latestUtmSource: null,
      latestUtmMedium: null,
      latestUtmCampaign: null,
      latestCampaignId: null,
      originalSource: null,
      originalSourceDetail: null,
      originalUtmSource: null,
      originalUtmMedium: null,
      originalUtmCampaign: null,
      originalCampaignId: null,
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
    };
    const dealRows = [
      {
        id: "d1",
        name: "Deal 1",
        amount: 100,
        stageId: "s1",
        stageName: "Lead",
        stageSlug: "lead",
        stageColor: "#000",
      },
    ];
    const timelineRows = [
      {
        id: "t1",
        contactId: id,
        eventType: "created",
        title: "Created",
        description: null,
        metadata: null,
        pipelineId: null,
        stageId: null,
        oldStageId: null,
        createdAt: "2024-01-01",
      },
    ];

    // getContact does 3 sequential queries:
    // 1. db.select().from(contacts).where().limit(1) → [contactRow]
    // 2. db.select({...}).from(deals).leftJoin().where().orderBy().limit() → dealRows
    // 3. db.select().from(contactTimeline).where().orderBy().limit() → timelineRows
    const contactChain = createDrizzleChain([contactRow]);
    const dealsChain = createDrizzleChain(dealRows);
    const timelineChain = createDrizzleChain(timelineRows);
    mockSelect
      .mockReturnValueOnce(contactChain)
      .mockReturnValueOnce(dealsChain)
      .mockReturnValueOnce(timelineChain);

    const result = await getContact(id);

    expect(result.contact).toEqual(expect.objectContaining({ id, first_name: "Alice" }));
    expect(result.deals).toHaveLength(1);
    expect(result.deals[0]).toEqual(expect.objectContaining({ id: "d1", name: "Deal 1" }));
    expect(result.timeline).toHaveLength(1);
  });

  it("throws 404 when contact not found", async () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const contactChain = createDrizzleChain([]); // empty result
    mockSelect.mockReturnValueOnce(contactChain);

    await expect(getContact(id)).rejects.toThrow("Contact not found");
  });
});

describe("updateContact", () => {
  const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

  it("throws 404 for invalid UUID", async () => {
    await expect(updateContact("bad-id", { first_name: "Bob" })).rejects.toThrow(CrmError);
  });

  it("updates allowed fields successfully", async () => {
    const updatedRow = {
      id,
      firstName: "Bob",
      lastName: null,
      email: "bob@test.com",
      phone: null,
      company: null,
      jobTitle: null,
      contactStatus: "lead",
      source: null,
      notes: null,
      tags: null,
      createdAt: "2024-01-01",
      updatedAt: "2024-01-02",
    };

    // No status change → no pre-fetch, goes straight to update
    const updateChain = createDrizzleChain([updatedRow]);
    mockUpdate.mockReturnValueOnce(updateChain);

    const result = await updateContact(id, { first_name: "Bob" });

    expect(result.contact).toEqual(expect.objectContaining({ id, first_name: "Bob" }));
  });

  it("enforces status hierarchy — prevents downgrade", async () => {
    // Pre-fetch chain (checking current status)
    const fetchChain = createDrizzleChain([{ contactStatus: "customer", notes: null }]);
    mockSelect.mockReturnValueOnce(fetchChain);

    await expect(updateContact(id, { contact_status: "lead" })).rejects.toThrow("Cannot downgrade");
  });

  it("allows status upgrade", async () => {
    // Pre-fetch chain
    const fetchChain = createDrizzleChain([{ contactStatus: "lead", notes: null }]);
    mockSelect.mockReturnValueOnce(fetchChain);

    const updatedRow = {
      id,
      firstName: "Alice",
      lastName: null,
      email: "alice@test.com",
      phone: null,
      company: null,
      jobTitle: null,
      contactStatus: "qualified",
      source: null,
      notes: null,
      tags: null,
      createdAt: "2024-01-01",
      updatedAt: "2024-01-02",
    };
    const updateChain = createDrizzleChain([updatedRow]);
    mockUpdate.mockReturnValueOnce(updateChain);

    const result = await updateContact(id, { contact_status: "qualified" });

    expect(result.contact.contact_status).toBe("qualified");
  });

  it("throws 500 when update returns no rows", async () => {
    // No status change → no pre-fetch
    const updateChain = createDrizzleChain([]);
    mockUpdate.mockReturnValueOnce(updateChain);

    await expect(updateContact(id, { first_name: "X" })).rejects.toThrow(
      "Failed to update contact",
    );
  });
});

describe("bulkUpdateContacts", () => {
  it("uses db.execute for add_tags", async () => {
    mockExecute.mockResolvedValueOnce([{ bulk_add_tags: 3 }]);

    const result = await bulkUpdateContacts({
      contact_ids: ["a", "b", "c"],
      updates: { add_tags: ["vip"] },
    });

    expect(mockExecute).toHaveBeenCalled();
    expect(result.updated).toBe(3);
  });

  it("prevents bulk status downgrade", async () => {
    // Fetch current contacts for hierarchy check
    const fetchChain = createDrizzleChain([
      { id: "a", contactStatus: "customer" },
      { id: "b", contactStatus: "lead" },
    ]);
    mockSelect.mockReturnValueOnce(fetchChain);

    await expect(
      bulkUpdateContacts({
        contact_ids: ["a", "b"],
        updates: { contact_status: "lead" },
      }),
    ).rejects.toThrow("Cannot downgrade");
  });

  it("performs standard bulk update for status", async () => {
    // First: fetch contacts for hierarchy check
    const fetchChain = createDrizzleChain([
      { id: "a", contactStatus: "lead" },
      { id: "b", contactStatus: "lead" },
    ]);
    mockSelect.mockReturnValueOnce(fetchChain);

    // Second: update returning ids
    const updateChain = createDrizzleChain([{ id: "a" }, { id: "b" }]);
    mockUpdate.mockReturnValueOnce(updateChain);

    const result = await bulkUpdateContacts({
      contact_ids: ["a", "b"],
      updates: { contact_status: "qualified" },
    });

    expect(result.updated).toBe(2);
  });
});

describe("bulkDeleteContacts", () => {
  it("calls db.execute and returns count", async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await bulkDeleteContacts(["a", "b", "c"]);

    expect(mockExecute).toHaveBeenCalled();
    expect(result.deleted).toBe(3);
  });

  it("throws on execute error", async () => {
    mockExecute.mockRejectedValueOnce(new Error("db fail"));

    await expect(bulkDeleteContacts(["a"])).rejects.toThrow("Failed to delete contacts");
  });
});
