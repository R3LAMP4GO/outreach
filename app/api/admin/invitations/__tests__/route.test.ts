import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockAuth, mockDb, mockCheckRateLimit } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  mockCheckRateLimit: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  rateLimiters: { invitationCreate: { limit: 10, windowMs: 3600000 } },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/constants", () => ({
  INVITATION_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,
}));

// ---------------------------------------------------------------------------
// Import handlers after mocks
// ---------------------------------------------------------------------------
import { GET, POST } from "../route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const SUPER_ADMIN_SESSION = {
  user: { id: "sa-1", email: "super@example.com", role: "super_admin" },
};
const ADMIN_SESSION = { user: { id: "admin-1", email: "admin@example.com", role: "admin" } };

const FAKE_INVITATIONS = [
  { id: "inv-1", email: "invite@example.com", role: "admin", status: "pending" },
];

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rateLimitOk() {
  mockCheckRateLimit.mockResolvedValue({ success: true, remaining: 9, resetIn: 3600000 });
}

/**
 * Build a Drizzle-compatible mock for db.
 *
 * The invitations route uses these db calls in POST:
 *   1. db.select({id}).from(adminUsers).where(...).limit(1)              → existingUser check
 *   2. db.select({id}).from(adminInvitations).where(and(...)).limit(1)   → existingInvite check
 *   3. db.insert(adminInvitations).values({...}).returning()             → create invitation
 *   4. db.insert(adminAuditLog).values({...})                            → audit log (awaited)
 *
 * In GET:
 *   1. db.select().from(adminInvitations).orderBy(...)                   → list
 */
function buildMockDb({
  invitations = FAKE_INVITATIONS as typeof FAKE_INVITATIONS | null,
  listError = false,
  existingUser = null as { id: string } | null,
  existingInvite = null as { id: string } | null,
  insertedInvitation = { id: "inv-new" } as Record<string, unknown>,
  insertError = false,
} = {}) {
  let selectCallIndex = 0;

  mockDb.select = vi.fn().mockImplementation(() => {
    const callIndex = selectCallIndex++;
    return {
      from: vi.fn().mockImplementation(() => {
        if (callIndex === 0) {
          // GET path: .orderBy(...)
          // POST path (first select): adminUsers .where().limit()
          return {
            orderBy: listError
              ? vi.fn().mockRejectedValue(new Error("DB error"))
              : vi.fn().mockResolvedValue(invitations ?? []),
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(existingUser ? [existingUser] : []),
            }),
          };
        }
        if (callIndex === 1) {
          // POST path (second select): adminInvitations .where(and(...)).limit()
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(existingInvite ? [existingInvite] : []),
            }),
          };
        }
        // Fallback
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
          orderBy: vi.fn().mockResolvedValue([]),
        };
      }),
    };
  });

  // For db.insert():
  // - adminInvitations: .values({...}).returning() → must return Promise<[invitation]>
  // - adminAuditLog: .values({...}) → must be directly awaitable (returns a Promise)
  //
  // We detect which table is being used by call order: first insert = adminInvitations,
  // second insert = adminAuditLog. But since we can't easily distinguish tables in Drizzle
  // mocks, we make values() return an object that is both awaitable AND has .returning().
  // We do this by making values() return a real Promise that also has a .returning() method.

  let insertCallIndex = 0;

  mockDb.insert = vi.fn().mockImplementation(() => {
    const iIdx = insertCallIndex++;
    return {
      values: vi.fn().mockImplementation(() => {
        if (iIdx === 0) {
          // adminInvitations insert: needs .returning()
          // Not awaited directly, only .returning() is awaited
          return {
            returning: insertError
              ? vi.fn().mockRejectedValue(new Error("DB insert error"))
              : vi.fn().mockResolvedValue([insertedInvitation]),
          };
        }
        // adminAuditLog insert: awaited directly (no .returning())
        return Promise.resolve(undefined);
      }),
    };
  });

  mockDb.update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

// ---------------------------------------------------------------------------
// GET Tests
// ---------------------------------------------------------------------------
describe("GET /api/admin/invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns invitation list for authenticated user", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    buildMockDb();

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.invitations).toEqual(FAKE_INVITATIONS);
  });

  it("returns 500 when database query fails", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    buildMockDb({ listError: true });

    const response = await GET();

    expect(response.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST Tests
// ---------------------------------------------------------------------------
describe("POST /api/admin/invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitOk();
  });

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(makePostRequest({ email: "new@example.com", role: "admin" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user is not super_admin", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);

    const response = await POST(makePostRequest({ email: "new@example.com", role: "admin" }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("super admin");
  });

  it("creates invitation with valid email and role", async () => {
    mockAuth.mockResolvedValue(SUPER_ADMIN_SESSION);
    buildMockDb();

    const response = await POST(makePostRequest({ email: "new@example.com", role: "admin" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.invitation).toBeDefined();
    expect(body.inviteUrl).toBeDefined();
  });

  it("returns 400 for invalid email format", async () => {
    mockAuth.mockResolvedValue(SUPER_ADMIN_SESSION);

    const response = await POST(makePostRequest({ email: "not-an-email", role: "admin" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("returns 400 when user already exists", async () => {
    mockAuth.mockResolvedValue(SUPER_ADMIN_SESSION);
    buildMockDb({ existingUser: { id: "existing-user" } });

    const response = await POST(makePostRequest({ email: "exists@example.com", role: "admin" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("already exists");
  });

  it("returns 400 when pending invitation exists", async () => {
    mockAuth.mockResolvedValue(SUPER_ADMIN_SESSION);
    buildMockDb({ existingInvite: { id: "inv-existing" } });

    const response = await POST(makePostRequest({ email: "pending@example.com", role: "admin" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Pending invitation");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(SUPER_ADMIN_SESSION);
    mockCheckRateLimit.mockResolvedValue({ success: false, remaining: 0, resetIn: 1000 });

    const response = await POST(makePostRequest({ email: "new@example.com", role: "admin" }));

    expect(response.status).toBe(429);
  });

  it("defaults role to admin when not specified", async () => {
    mockAuth.mockResolvedValue(SUPER_ADMIN_SESSION);
    buildMockDb();

    const response = await POST(makePostRequest({ email: "new@example.com" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.invitation).toBeDefined();
  });
});
