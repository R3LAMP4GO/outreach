import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockAuth,
  mockDbSelect,
  mockUpdateCampaign,
  mockGetCampaign,
  mockGetCampaignSchedule,
  mockActivateContacts,
  mockScheduleToBusinessHours,
  mockNotInArray,
  mockIsNull,
  mockOr,
  mockEq,
  mockLt,
  mockAnd,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDbSelect: vi.fn(),
  mockUpdateCampaign: vi.fn(),
  mockGetCampaign: vi.fn(),
  mockGetCampaignSchedule: vi.fn(),
  mockActivateContacts: vi.fn(),
  mockScheduleToBusinessHours: vi.fn(),
  mockNotInArray: vi.fn((col, vals) => ({ kind: "notInArray", col, vals })),
  mockIsNull: vi.fn((col) => ({ kind: "isNull", col })),
  mockOr: vi.fn((...args) => ({ kind: "or", args })),
  mockEq: vi.fn((col, val) => ({ kind: "eq", col, val })),
  mockLt: vi.fn((col, val) => ({ kind: "lt", col, val })),
  mockAnd: vi.fn((...args) => ({ kind: "and", args })),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  db: { select: mockDbSelect },
}));

vi.mock("drizzle-orm", () => ({
  eq: mockEq,
  and: mockAnd,
  lt: mockLt,
  or: mockOr,
  isNull: mockIsNull,
  notInArray: mockNotInArray,
  ilike: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
  outreachContacts: {
    id: "contacts.id",
    campaignId: "contacts.campaign_id",
    status: "contacts.status",
    currentStep: "contacts.current_step",
    optOut: "contacts.opt_out",
  },
}));

vi.mock("@/lib/outreach/campaigns", () => ({
  getCampaign: mockGetCampaign,
  updateCampaign: mockUpdateCampaign,
  deleteCampaign: vi.fn(),
}));

vi.mock("@/lib/outreach/campaigns/queries", () => ({
  getCampaignSchedule: mockGetCampaignSchedule,
}));

vi.mock("@/lib/outreach/contacts/actions", () => ({
  activateContacts: mockActivateContacts,
}));

vi.mock("@/lib/outreach/lib", () => ({
  validateEmailList: vi.fn(() => ({ valid: [], invalid: [] })),
}));

vi.mock("@/lib/outreach/lib/drizzle-helpers", () => ({
  toSnakeCaseArray: vi.fn((a) => a),
}));

vi.mock("@/lib/outreach/scheduling/business-hours", () => ({
  scheduleToBusinessHours: mockScheduleToBusinessHours,
}));

// ---------------------------------------------------------------------------
// Import handler after mocks
// ---------------------------------------------------------------------------
import { PATCH } from "../route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ADMIN_SESSION = { user: { id: "admin-1", email: "a@b.com", role: "admin" } };
const CAMPAIGN_ID = "campaign-1";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/outreach/campaigns/${CAMPAIGN_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams() {
  return { params: Promise.resolve({ campaignId: CAMPAIGN_ID }) };
}

/**
 * Wires `db.select(...).from(...).where(...).limit(N)` to resolve with `rows`,
 * and captures the where-clause expression for later assertions.
 */
function mockContactSelect(rows: Array<{ id: string }>) {
  const captured: { where?: unknown } = {};
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn(function (this: unknown, expr: unknown) {
      captured.where = expr;
      return this;
    }),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mockDbSelect.mockReturnValue(chain);
  return captured;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("PATCH /api/outreach/campaigns/[campaignId] — activation filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockUpdateCampaign.mockResolvedValue({ id: CAMPAIGN_ID, status: "active" });
    mockGetCampaignSchedule.mockResolvedValue(null);
    mockScheduleToBusinessHours.mockReturnValue(undefined);
    mockActivateContacts.mockResolvedValue(0);
  });

  it("excludes terminal statuses (replied, bounced, unsubscribed, completed) from activation", async () => {
    mockContactSelect([]);

    const res = await PATCH(makeRequest({ status: "active" }), makeParams());
    expect(res.status).toBe(200);

    // The drizzle filter must have called notInArray with all four terminal statuses.
    expect(mockNotInArray).toHaveBeenCalledTimes(1);
    const [, vals] = mockNotInArray.mock.calls[0]!;
    expect(vals).toEqual(["replied", "bounced", "unsubscribed", "completed"]);
  });

  it("treats NULL opt_out as not-opted-out (eq false OR isNull)", async () => {
    mockContactSelect([]);

    await PATCH(makeRequest({ status: "active" }), makeParams());

    // optOut filter: or(eq(optOut, false), isNull(optOut))
    expect(mockEq).toHaveBeenCalledWith("contacts.opt_out", false);
    expect(mockIsNull).toHaveBeenCalledWith("contacts.opt_out");
  });

  it("treats NULL current_step as eligible (lt 3 OR isNull) so fresh imports are enrolled", async () => {
    mockContactSelect([]);

    await PATCH(makeRequest({ status: "active" }), makeParams());

    expect(mockLt).toHaveBeenCalledWith("contacts.current_step", 3);
    expect(mockIsNull).toHaveBeenCalledWith("contacts.current_step");
  });

  it("passes the selected contact ids to activateContacts", async () => {
    mockContactSelect([{ id: "c-1" }, { id: "c-2" }, { id: "c-3" }]);
    mockActivateContacts.mockResolvedValue(3);

    const res = await PATCH(makeRequest({ status: "active" }), makeParams());
    expect(res.status).toBe(200);

    expect(mockActivateContacts).toHaveBeenCalledTimes(1);
    expect(mockActivateContacts).toHaveBeenCalledWith(["c-1", "c-2", "c-3"], undefined);

    const body = await res.json();
    expect(body).toMatchObject({ activated: 3, capHit: false });
    expect(body.campaign).toBeDefined();
  });

  it("returns capHit: true when the inline activation cap is reached", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: `c-${i}` }));
    mockContactSelect(rows);
    mockActivateContacts.mockResolvedValue(1000);

    const res = await PATCH(makeRequest({ status: "active" }), makeParams());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toMatchObject({ activated: 1000, capHit: true });
  });

  it("does not call activateContacts when no eligible contacts are found", async () => {
    mockContactSelect([]);

    await PATCH(makeRequest({ status: "active" }), makeParams());

    expect(mockActivateContacts).not.toHaveBeenCalled();
  });

  it("does not query contacts or call activateContacts when status is not 'active'", async () => {
    mockUpdateCampaign.mockResolvedValue({ id: CAMPAIGN_ID, status: "paused" });

    const res = await PATCH(makeRequest({ status: "paused" }), makeParams());
    expect(res.status).toBe(200);

    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockActivateContacts).not.toHaveBeenCalled();
  });

  it("passes the campaign's business hours to activateContacts when a schedule exists", async () => {
    mockContactSelect([{ id: "c-1" }]);
    const businessHours = { mondayStart: "09:00", mondayEnd: "17:00" };
    mockGetCampaignSchedule.mockResolvedValue({ some: "schedule" });
    mockScheduleToBusinessHours.mockReturnValue(businessHours);

    await PATCH(makeRequest({ status: "active" }), makeParams());

    expect(mockActivateContacts).toHaveBeenCalledWith(["c-1"], businessHours);
  });
});
