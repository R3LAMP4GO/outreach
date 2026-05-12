import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockAuth,
  mockDb,
  mockCheckRateLimit,
  mockHashPassword,
  mockVerifyPassword,
  mockValidatePasswordStrength,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockCheckRateLimit: vi.fn(),
  mockHashPassword: vi.fn(),
  mockVerifyPassword: vi.fn(),
  mockValidatePasswordStrength: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  rateLimiters: { passwordChange: { limit: 3, windowMs: 3600000 } },
}));
vi.mock("@/lib/password", () => ({
  hashPassword: mockHashPassword,
  verifyPassword: mockVerifyPassword,
  validatePasswordStrength: mockValidatePasswordStrength,
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import handler after mocks
// ---------------------------------------------------------------------------
import { POST } from "../route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ADMIN_SESSION = { user: { id: "admin-1", email: "admin@example.com", role: "admin" } };

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/security/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rateLimitOk() {
  mockCheckRateLimit.mockResolvedValue({ success: true, remaining: 2, resetIn: 3600000 });
}

/**
 * Build a Drizzle-compatible mock for db.
 *
 * The password route uses:
 *   - db.select({id, passwordHash}).from(adminUsers).where(...).limit(1) → [user] or []
 *   - db.update(adminUsers).set(...).where(...)                          → resolves
 *   - db.insert(adminAuditLog).values(...)                               → audit log
 */
function buildMockDb({
  userData = { id: "admin-1", passwordHash: "hashed-old" } as {
    id: string;
    passwordHash: string;
  } | null,
  userError = false,
  updateError = false,
} = {}) {
  // db.select().from().where().limit() — returns user array
  mockDb.select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: userError
          ? vi.fn().mockRejectedValue(new Error("not found"))
          : vi.fn().mockResolvedValue(userData ? [userData] : []),
      }),
    }),
  });

  // db.update().set().where()
  mockDb.update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: updateError
        ? vi.fn().mockRejectedValue(new Error("DB error"))
        : vi.fn().mockResolvedValue(undefined),
    }),
  });

  // db.insert().values()
  mockDb.insert = vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/admin/security/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitOk();
    mockValidatePasswordStrength.mockReturnValue({ valid: true, errors: [] });
    mockVerifyPassword.mockResolvedValue(true);
    mockHashPassword.mockResolvedValue("hashed-new");
  });

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(
      makeRequest({ currentPassword: "old", newPassword: "newStrongPass123!" }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockCheckRateLimit.mockResolvedValue({ success: false, remaining: 0, resetIn: 1000 });

    const response = await POST(
      makeRequest({ currentPassword: "old", newPassword: "newStrongPass123!" }),
    );

    expect(response.status).toBe(429);
  });

  it("returns 400 when new password is too weak", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockValidatePasswordStrength.mockReturnValue({
      valid: false,
      errors: ["Must contain uppercase letter"],
    });
    buildMockDb();

    const response = await POST(
      makeRequest({ currentPassword: "OldPass123!", newPassword: "weakpass123456" }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("uppercase");
  });

  it("returns 400 when current password is incorrect", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockVerifyPassword.mockResolvedValue(false);
    buildMockDb();

    const response = await POST(
      makeRequest({ currentPassword: "wrong", newPassword: "NewStrongPass123!" }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("incorrect");
  });

  it("returns success when password change is valid", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    buildMockDb();

    const response = await POST(
      makeRequest({ currentPassword: "OldPass123!", newPassword: "NewStrongPass123!" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain("updated");
  });

  it("returns 404 when user is not found in database", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    buildMockDb({ userData: null });

    const response = await POST(
      makeRequest({ currentPassword: "OldPass123!", newPassword: "NewStrongPass123!" }),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain("not found");
  });

  it("returns 500 when update fails", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    buildMockDb({ updateError: true });

    const response = await POST(
      makeRequest({ currentPassword: "OldPass123!", newPassword: "NewStrongPass123!" }),
    );

    expect(response.status).toBe(500);
  });

  it("returns 400 when body is missing required fields", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);

    const response = await POST(makeRequest({}));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });
});
