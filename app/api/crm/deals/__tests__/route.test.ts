import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockAuth, mockSupabaseAdmin, mockGetDeals } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockSupabaseAdmin: vi.fn(),
  mockGetDeals: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/crm/deals", () => ({ getDeals: mockGetDeals }));
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
import { GET } from "../route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ADMIN_SESSION = { user: { id: "admin-1", email: "admin@example.com", role: "admin" } };
const USER_SESSION = { user: { id: "user-1", email: "user@example.com", role: "user" } };

const FAKE_DEALS = {
  data: [{ id: "deal-1", name: "Acme Deal", stage: "Lead", status: "open" }],
  total: 1,
  page: 1,
  limit: 20,
};

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/crm/deals");
  // paginationSchema requires valid page/limit (null coerces to 0 which fails min(1))
  if (!params.page) url.searchParams.set("page", "1");
  if (!params.limit) url.searchParams.set("limit", "20");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("GET /api/crm/deals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseAdmin.mockReturnValue({});
  });

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user is not admin", async () => {
    mockAuth.mockResolvedValue(USER_SESSION);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("Forbidden");
  });

  it("returns paginated deals on success", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockGetDeals.mockResolvedValue(FAKE_DEALS);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual(FAKE_DEALS.data);
    expect(body.total).toBe(1);
  });

  it("passes pipeline parameter to getDeals", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockGetDeals.mockResolvedValue(FAKE_DEALS);

    await GET(makeRequest({ pipeline: "custom-pipeline" }));

    expect(mockGetDeals).toHaveBeenCalledWith(
      expect.objectContaining({ pipelineSlug: "custom-pipeline" }),
    );
  });

  it("defaults pipeline to sales-pipeline", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockGetDeals.mockResolvedValue(FAKE_DEALS);

    await GET(makeRequest());

    expect(mockGetDeals).toHaveBeenCalledWith(
      expect.objectContaining({ pipelineSlug: "sales-pipeline" }),
    );
  });

  it("returns 500 when getDeals throws a non-CRM error", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockGetDeals.mockRejectedValue(new Error("Unexpected"));

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Internal server error");
  });
});
