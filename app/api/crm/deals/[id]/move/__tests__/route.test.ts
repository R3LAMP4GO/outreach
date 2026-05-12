import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockAuth, mockSupabaseAdmin, mockMoveDeal } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockSupabaseAdmin: vi.fn(),
  mockMoveDeal: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/crm/deals", () => ({ moveDeal: mockMoveDeal }));
vi.mock("@/lib/crm/types", async () => {
  class CrmError extends Error {
    constructor(
      message: string,
      public statusCode: number,
    ) {
      super(message);
      this.name = "CrmError";
    }
  }
  return { CrmError };
});

// ---------------------------------------------------------------------------
// Import handler after mocks
// ---------------------------------------------------------------------------
import { PATCH } from "../route";
import { CrmError } from "@/lib/crm/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ADMIN_SESSION = { user: { id: "admin-1", email: "admin@example.com", role: "admin" } };
const VALID_STAGE_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/crm/deals/deal-1/move", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeContext(id = "deal-1") {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("PATCH /api/crm/deals/[id]/move", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseAdmin.mockReturnValue({});
  });

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await PATCH(makeRequest({ stage_id: VALID_STAGE_ID }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user is not admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u-1", email: "u@e.com", role: "user" } });

    const response = await PATCH(makeRequest({ stage_id: VALID_STAGE_ID }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("Forbidden");
  });

  it("returns 400 for invalid stage_id format", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);

    const response = await PATCH(makeRequest({ stage_id: "not-a-uuid" }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Invalid stage ID");
  });

  it("returns 400 when stage_id is missing", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);

    const response = await PATCH(makeRequest({}), makeContext());

    expect(response.status).toBe(400);
  });

  it("returns updated deal on valid move", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    const movedDeal = { id: "deal-1", stage_id: VALID_STAGE_ID };
    mockMoveDeal.mockResolvedValue(movedDeal);

    const response = await PATCH(makeRequest({ stage_id: VALID_STAGE_ID }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe("deal-1");
  });

  it("returns 404 when deal is not found (CrmError)", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockMoveDeal.mockRejectedValue(new CrmError("Deal not found", 404));

    const response = await PATCH(makeRequest({ stage_id: VALID_STAGE_ID }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Deal not found");
  });

  it("passes correct parameters to moveDeal", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockMoveDeal.mockResolvedValue({ id: "deal-1" });

    await PATCH(makeRequest({ stage_id: VALID_STAGE_ID }), makeContext("deal-99"));

    expect(mockMoveDeal).toHaveBeenCalledWith({
      dealId: "deal-99",
      stageId: VALID_STAGE_ID,
      userId: "admin-1",
    });
  });
});
