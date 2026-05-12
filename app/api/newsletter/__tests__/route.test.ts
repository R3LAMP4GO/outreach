import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockAuth, mockDbSelect } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDbSelect: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
// `server-only` throws in non-Next.js environments; stub it out for tests.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Mock the db module (avoids server-only guard and real DB connection).
// The GET handler calls: db.select().from(...).orderBy(...).limit(...)
vi.mock("@/lib/db", () => ({
  db: {
    select: mockDbSelect,
  },
}));

// Drizzle helpers used as arguments — mock them as identity functions so they
// don't throw when called without a real schema object.
vi.mock("drizzle-orm", () => ({
  desc: vi.fn((col) => col),
}));

// The schema import is used as an argument to .from(); mock it so the import
// resolves without hitting the real schema file (which may pull in server-only deps).
vi.mock("@/lib/db/schema", () => ({
  newsletterEditions: "newsletter_editions",
}));

// ---------------------------------------------------------------------------
// Import handler after mocks
// ---------------------------------------------------------------------------
import { GET } from "../route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ADMIN_SESSION = { user: { id: "admin-1", email: "admin@example.com", role: "admin" } };
const SUPER_ADMIN_SESSION = {
  user: { id: "admin-2", email: "super@example.com", role: "super_admin" },
};
const USER_SESSION = { user: { id: "user-1", email: "user@example.com", role: "user" } };

/** Build a fluent Drizzle chain that resolves to the given rows. */
function mockDbReturning(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mockDbSelect.mockReturnValue(chain);
  return chain;
}

function makeEdition(overrides: Record<string, unknown> = {}) {
  return {
    id: "ed-1",
    subject: "Test Subject",
    sentAt: "2024-01-15T10:00:00Z",
    status: "sent",
    createdAt: "2024-01-15T09:00:00Z",
    stats: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("GET /api/newsletter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Auth & authorization
  // -------------------------------------------------------------------------
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    mockDbReturning([]);

    const response = await GET();
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it("returns 403 when authenticated as non-admin", async () => {
    mockAuth.mockResolvedValue(USER_SESSION);
    mockDbReturning([]);

    const response = await GET();
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toMatch(/insufficient/i);
  });

  it("returns 200 for admin role", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockDbReturning([]);

    const response = await GET();
    expect(response.status).toBe(200);
  });

  it("returns 200 for super_admin role", async () => {
    mockAuth.mockResolvedValue(SUPER_ADMIN_SESSION);
    mockDbReturning([]);

    const response = await GET();
    expect(response.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Stats shape — camelCase keys (written by send route)
  // -------------------------------------------------------------------------
  it("maps camelCase stats correctly", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockDbReturning([
      makeEdition({
        stats: {
          openRate: 42.5,
          clickRate: 8.3,
          totalRecipients: 1200,
          totalSent: 1200,
          totalOpens: 510,
          totalClicks: 100,
        },
      }),
    ]);

    const response = await GET();
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.newsletters).toHaveLength(1);
    const stats = body.newsletters[0].stats;
    expect(stats.openRate).toBe(42.5);
    expect(stats.clickRate).toBe(8.3);
    expect(stats.totalRecipients).toBe(1200);
  });

  // -------------------------------------------------------------------------
  // Stats shape — snake_case keys (legacy records)
  // -------------------------------------------------------------------------
  it("maps snake_case stats correctly (backward compatibility)", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockDbReturning([
      makeEdition({
        stats: {
          open_rate: 35.0,
          click_rate: 5.5,
          total_recipients: 800,
        },
      }),
    ]);

    const response = await GET();
    const body = await response.json();

    expect(body.success).toBe(true);
    const stats = body.newsletters[0].stats;
    expect(stats.openRate).toBe(35.0);
    expect(stats.clickRate).toBe(5.5);
    expect(stats.totalRecipients).toBe(800);
  });

  // -------------------------------------------------------------------------
  // Stats shape — camelCase takes precedence over snake_case when both present
  // -------------------------------------------------------------------------
  it("prefers camelCase over snake_case when both keys are present", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockDbReturning([
      makeEdition({
        stats: {
          openRate: 50.0,
          open_rate: 10.0, // should be ignored
          clickRate: 9.0,
          click_rate: 1.0, // should be ignored
          totalRecipients: 500,
          total_recipients: 100, // should be ignored
        },
      }),
    ]);

    const response = await GET();
    const body = await response.json();

    const stats = body.newsletters[0].stats;
    expect(stats.openRate).toBe(50.0);
    expect(stats.clickRate).toBe(9.0);
    expect(stats.totalRecipients).toBe(500);
  });

  // -------------------------------------------------------------------------
  // Stats shape — null stats fall back to zeros
  // -------------------------------------------------------------------------
  it("returns zero stats when stats is null", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockDbReturning([makeEdition({ stats: null })]);

    const response = await GET();
    const body = await response.json();

    const stats = body.newsletters[0].stats;
    expect(stats.openRate).toBe(0);
    expect(stats.clickRate).toBe(0);
    expect(stats.totalRecipients).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Stats shape — zero values are preserved (not coerced to fallback)
  // -------------------------------------------------------------------------
  it("preserves explicit zero values in camelCase stats", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockDbReturning([
      makeEdition({
        stats: {
          openRate: 0,
          clickRate: 0,
          totalRecipients: 0,
        },
      }),
    ]);

    const response = await GET();
    const body = await response.json();

    const stats = body.newsletters[0].stats;
    expect(stats.openRate).toBe(0);
    expect(stats.clickRate).toBe(0);
    expect(stats.totalRecipients).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Response shape
  // -------------------------------------------------------------------------
  it("returns newsletters array with correct shape", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockDbReturning([
      makeEdition({
        id: "ed-42",
        subject: "Weekly Update",
        status: "sent",
        sentAt: "2024-06-01T08:00:00Z",
        stats: { openRate: 22.1, clickRate: 3.4, totalRecipients: 450 },
      }),
    ]);

    const response = await GET();
    const body = await response.json();

    expect(body.success).toBe(true);
    const nl = body.newsletters[0];
    expect(nl.id).toBe("ed-42");
    expect(nl.subject).toBe("Weekly Update");
    expect(nl.status).toBe("sent");
    expect(nl.sentAt).toBe("2024-06-01T08:00:00Z");
    expect(nl.stats).toEqual({ openRate: 22.1, clickRate: 3.4, totalRecipients: 450 });
  });

  it("defaults subject to 'Untitled' when null", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockDbReturning([makeEdition({ subject: null })]);

    const response = await GET();
    const body = await response.json();

    expect(body.newsletters[0].subject).toBe("Untitled");
  });

  it("defaults status to 'draft' when null", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockDbReturning([makeEdition({ status: null })]);

    const response = await GET();
    const body = await response.json();

    expect(body.newsletters[0].status).toBe("draft");
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------
  it("returns 500 when db throws", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    const chain = {
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(new Error("connection refused")),
    };
    mockDbSelect.mockReturnValue(chain);

    const response = await GET();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });
});
