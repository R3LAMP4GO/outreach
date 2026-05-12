import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockAuth, mockDbSelect, mockCompareApiKeys, mockCheckRateLimit } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDbSelect: vi.fn(),
  mockCompareApiKeys: vi.fn(),
  mockCheckRateLimit: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));

vi.mock("@/lib/auth/compare-api-keys", () => ({
  compareApiKeys: mockCompareApiKeys,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  rateLimiters: { api: "api-limiter" },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  db: { select: mockDbSelect },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => `eq:${val}`),
  and: vi.fn((...args) => args.join("&")),
  desc: vi.fn((col) => col),
  sql: vi.fn((s) => s),
}));

vi.mock("@/lib/db/schema", () => ({
  newsletterSubscribers: "newsletter_subscribers",
  newsletterCampaigns: "newsletter_campaigns",
  newsletterEditions: {
    stats: "stats",
    status: "status",
    id: "id",
    subject: "subject",
    sentAt: "sentAt",
  },
}));

// ---------------------------------------------------------------------------
// Import handler after mocks
// ---------------------------------------------------------------------------
import { GET } from "../route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ADMIN_SESSION = { user: { id: "admin-1", email: "admin@example.com", role: "admin" } };
const SUPER_ADMIN_SESSION = {
  user: { id: "sa-1", email: "super@example.com", role: "super_admin" },
};
const USER_SESSION = { user: { id: "user-1", email: "user@example.com", role: "user" } };

function makeRequest(opts: { apiKey?: string; ip?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.apiKey) headers["x-api-key"] = opts.apiKey;
  if (opts.ip) headers["x-forwarded-for"] = opts.ip;
  return new NextRequest("http://localhost/api/newsletter/stats", { headers });
}

/**
 * Build a Promise chain that simulates Drizzle's fluent select API.
 * The chain always resolves to `rows` regardless of how many methods are called.
 */
function makeChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "orderBy", "limit", "select"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  // Make it thenable so Promise.all can await it
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return chain;
}

/**
 * Set up mockDbSelect so each call returns its own chain.
 * The five parallel queries are (in order):
 *   0 — subscribers count
 *   1 — campaigns count
 *   2 — all editions stats
 *   3 — recent editions (activity)
 *   4 — recent subscribers (activity)
 */
function setupDb({
  subscribers = [{ count: 0 }],
  campaigns = [{ count: 0 }],
  editions = [] as unknown[],
  recentEditions = [] as unknown[],
  recentSubscribers = [] as unknown[],
} = {}) {
  let callCount = 0;
  const payloads = [subscribers, campaigns, editions, recentEditions, recentSubscribers];
  mockDbSelect.mockImplementation(() => makeChain(payloads[callCount++] ?? []));
}

function makeEdition(
  opens: number,
  clicks: number,
  delivered: number,
  sentAt = "2024-01-15T10:00:00Z",
) {
  return {
    id: "ed-1",
    subject: "Issue #1",
    sentAt,
    stats: { totalOpens: opens, totalClicks: clicks, totalDelivered: delivered },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("GET /api/newsletter/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEWSLETTER_API_KEY = "test-api-key";
    mockCheckRateLimit.mockResolvedValue({ success: true });
  });

  // -------------------------------------------------------------------------
  // Auth & authorization
  // -------------------------------------------------------------------------
  describe("authentication", () => {
    it("returns 401 when no session and no API key", async () => {
      mockAuth.mockResolvedValue(null);
      mockCompareApiKeys.mockReturnValue(false);
      setupDb();

      const response = await GET(makeRequest());
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toMatch(/unauthorized/i);
    });

    it("returns 403 for non-admin session", async () => {
      mockAuth.mockResolvedValue(USER_SESSION);
      setupDb();

      const response = await GET(makeRequest());
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toMatch(/insufficient permissions/i);
    });

    it("allows access with admin session", async () => {
      mockAuth.mockResolvedValue(ADMIN_SESSION);
      setupDb();

      const response = await GET(makeRequest());
      expect(response.status).toBe(200);
    });

    it("allows access with super_admin session", async () => {
      mockAuth.mockResolvedValue(SUPER_ADMIN_SESSION);
      setupDb();

      const response = await GET(makeRequest());
      expect(response.status).toBe(200);
    });

    it("allows access with a valid API key (no session)", async () => {
      mockAuth.mockResolvedValue(null);
      mockCompareApiKeys.mockReturnValue(true);
      setupDb();

      const response = await GET(makeRequest({ apiKey: "test-api-key" }));
      expect(response.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------------------------
  describe("rate limiting", () => {
    it("returns 429 when rate limit exceeded", async () => {
      mockAuth.mockResolvedValue(ADMIN_SESSION);
      mockCheckRateLimit.mockResolvedValue({ success: false });

      const response = await GET(makeRequest());
      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error).toMatch(/too many requests/i);
    });
  });

  // -------------------------------------------------------------------------
  // Response shape
  // -------------------------------------------------------------------------
  describe("response contract", () => {
    it("returns all required fields", async () => {
      mockAuth.mockResolvedValue(ADMIN_SESSION);
      setupDb({ subscribers: [{ count: 42 }], campaigns: [{ count: 3 }] });

      const response = await GET(makeRequest());
      const body = await response.json();

      expect(body).toHaveProperty("totalSubscribers", 42);
      expect(body).toHaveProperty("activeCampaigns", 3);
      expect(body).toHaveProperty("avgOpenRate");
      expect(body).toHaveProperty("avgClickRate");
      expect(body).toHaveProperty("totalSent");
      expect(body).toHaveProperty("recentActivity");
      expect(Array.isArray(body.recentActivity)).toBe(true);
    });

    it("returns zero rates when no editions exist", async () => {
      mockAuth.mockResolvedValue(ADMIN_SESSION);
      setupDb();

      const body = await GET(makeRequest()).then((r) => r.json());

      expect(body.avgOpenRate).toBe(0);
      expect(body.avgClickRate).toBe(0);
      expect(body.totalSent).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Rate computation — units must be percentages (0–100)
  // -------------------------------------------------------------------------
  describe("rate units — percentages (0–100)", () => {
    it("returns open/click rates as percentage values, not fractions", async () => {
      mockAuth.mockResolvedValue(ADMIN_SESSION);
      // 30 opens / 100 delivered = 30%,  10 clicks / 100 delivered = 10%
      setupDb({
        editions: [makeEdition(30, 10, 100)],
      });

      const body = await GET(makeRequest()).then((r) => r.json());

      expect(body.avgOpenRate).toBeCloseTo(30, 5);
      expect(body.avgClickRate).toBeCloseTo(10, 5);
    });

    it("averages rates across multiple editions in percentage space", async () => {
      mockAuth.mockResolvedValue(ADMIN_SESSION);
      // Edition A: 20/100 = 20%,  Edition B: 40/100 = 40% → avg = 30%
      setupDb({
        editions: [makeEdition(20, 5, 100), makeEdition(40, 15, 100)],
      });

      const body = await GET(makeRequest()).then((r) => r.json());

      expect(body.avgOpenRate).toBeCloseTo(30, 5);
      expect(body.avgClickRate).toBeCloseTo(10, 5);
    });

    it("skips editions with zero delivered in rate calculation", async () => {
      mockAuth.mockResolvedValue(ADMIN_SESSION);
      // One valid edition (50%) and one with no delivery
      setupDb({
        editions: [
          makeEdition(50, 5, 100),
          {
            id: "ed-2",
            subject: "Empty",
            sentAt: "2024-02-01T00:00:00Z",
            stats: { totalDelivered: 0, totalOpens: 0, totalClicks: 0 },
          },
        ],
      });

      const body = await GET(makeRequest()).then((r) => r.json());

      expect(body.avgOpenRate).toBeCloseTo(50, 5);
    });

    it("does not perform early rounding — preserves decimal precision", async () => {
      mockAuth.mockResolvedValue(ADMIN_SESSION);
      // 1 open / 3 delivered ≈ 33.333...%
      setupDb({ editions: [makeEdition(1, 0, 3)] });

      const body = await GET(makeRequest()).then((r) => r.json());

      // Should preserve expected precision for fractional percentages
      expect(body.avgOpenRate).toBeCloseTo(33.3, 5);
    });

    it("accumulates totalSent across all editions regardless of delivery zero", async () => {
      mockAuth.mockResolvedValue(ADMIN_SESSION);
      setupDb({
        editions: [makeEdition(10, 2, 100), makeEdition(20, 4, 200)],
      });

      const body = await GET(makeRequest()).then((r) => r.json());

      expect(body.totalSent).toBe(300);
    });
  });

  // -------------------------------------------------------------------------
  // Recent activity feed
  // -------------------------------------------------------------------------
  describe("recentActivity", () => {
    it("includes campaign_sent entries from recent editions", async () => {
      mockAuth.mockResolvedValue(ADMIN_SESSION);
      setupDb({
        recentEditions: [
          {
            id: "ed-1",
            subject: "Weekly #1",
            sentAt: "2024-03-01T10:00:00Z",
            stats: { totalRecipients: 500 },
          },
        ],
      });

      const body = await GET(makeRequest()).then((r) => r.json());

      const campaignEntries = body.recentActivity.filter(
        (a: { type: string }) => a.type === "campaign_sent",
      );
      expect(campaignEntries.length).toBeGreaterThan(0);
      expect(campaignEntries[0].description).toContain("Weekly #1");
    });

    it("includes subscriber_added entries from recent subscribers", async () => {
      mockAuth.mockResolvedValue(ADMIN_SESSION);
      setupDb({
        recentSubscribers: [
          { id: "sub-1", email: "alice@example.com", createdAt: "2024-03-05T08:00:00Z" },
        ],
      });

      const body = await GET(makeRequest()).then((r) => r.json());

      const subEntries = body.recentActivity.filter(
        (a: { type: string }) => a.type === "subscriber_added",
      );
      expect(subEntries.length).toBeGreaterThan(0);
      expect(subEntries[0].description).toContain("alice@example.com");
    });

    it("limits activity feed to 10 entries", async () => {
      mockAuth.mockResolvedValue(ADMIN_SESSION);
      const manySubscribers = Array.from({ length: 10 }, (_, i) => ({
        id: `sub-${i}`,
        email: `user${i}@example.com`,
        createdAt: new Date(2024, 0, i + 1).toISOString(),
      }));
      const manyEditions = Array.from({ length: 5 }, (_, i) => ({
        id: `ed-${i}`,
        subject: `Issue ${i}`,
        sentAt: new Date(2024, 2, i + 1).toISOString(),
        stats: null,
      }));
      setupDb({ recentEditions: manyEditions, recentSubscribers: manySubscribers });

      const body = await GET(makeRequest()).then((r) => r.json());

      expect(body.recentActivity.length).toBeLessThanOrEqual(10);
    });
  });
});
