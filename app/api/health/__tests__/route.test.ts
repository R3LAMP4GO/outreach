import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockDb, mockGetQueueHealth } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    execute: vi.fn(),
  },
  mockGetQueueHealth: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/newsletter/lib/queue", () => ({
  getQueueHealth: mockGetQueueHealth,
  newsletterQueue: {
    initialize: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0 }),
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import handler after mocks
// ---------------------------------------------------------------------------
import { GET } from "../route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/health", { headers });
}

/**
 * Configure the db mock for health checks.
 * - dbHealthy: whether unauthenticated select resolves (true) or rejects (false)
 * - executeHealthy: whether authenticated db.execute resolves or rejects
 */
function buildMockDb({ dbHealthy = true, executeHealthy = true } = {}) {
  // Unauthenticated path: db.select().from().limit(1)
  const limitMock = dbHealthy
    ? vi.fn().mockResolvedValue([]) // resolves → healthy
    : vi.fn().mockRejectedValue(new Error("connection refused"));

  const fromMock = vi.fn().mockReturnValue({ limit: limitMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  // Authenticated path: db.execute(sql`SELECT 1`)
  const executeMock = executeHealthy
    ? vi.fn().mockResolvedValue([{ "?column?": 1 }])
    : vi.fn().mockRejectedValue(new Error("connection refused"));

  mockDb.select = selectMock;
  mockDb.execute = executeMock;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: queue is healthy
    mockGetQueueHealth.mockResolvedValue({ healthy: true, issues: [] });
  });

  it("returns status ok when database is healthy (unauthenticated)", async () => {
    buildMockDb({ dbHealthy: true });

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });

  it("returns 503 when database is unhealthy (unauthenticated)", async () => {
    buildMockDb({ dbHealthy: false });

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
  });

  it("does NOT leak env var names in unauthenticated response", async () => {
    buildMockDb({ dbHealthy: true });

    const response = await GET(makeRequest());
    const body = await response.json();

    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain("DATABASE_URL");
    expect(bodyStr).not.toContain("RESEND_API_KEY");
    expect(bodyStr).not.toContain("ANTHROPIC_API_KEY");
    expect(body.checks).toBeUndefined();
  });

  it("returns detailed checks for authenticated request", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("NEWSLETTER_API_KEY", "nl-test");
    buildMockDb({ executeHealthy: true });

    const response = await GET(makeRequest({ authorization: "Bearer test-secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checks).toBeDefined();
    expect(body.checks.database).toBeDefined();
    expect(body.checks.queue).toBeDefined();
    expect(body.checks.environment).toBeDefined();
  });

  it("does not expose actual env var values in authenticated response", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("NEWSLETTER_API_KEY", "nl-test");
    buildMockDb({ executeHealthy: true });

    const response = await GET(makeRequest({ authorization: "Bearer test-secret" }));
    const body = await response.json();
    const bodyStr = JSON.stringify(body);

    expect(bodyStr).not.toContain("re_test");
    expect(bodyStr).not.toContain("sk-ant-test");
  });
});
