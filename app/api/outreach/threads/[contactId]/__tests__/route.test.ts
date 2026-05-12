import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockAuth, mockDbUpdate } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  db: { update: mockDbUpdate },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => ({ type: "eq", val })),
}));

vi.mock("@/lib/db/schema", () => ({
  outreachReplies: {
    contactId: "contact_id_col",
    id: "id_col",
  },
}));

import { PATCH } from "../route";

const ADMIN_SESSION = { user: { id: "a-1", email: "a@e.com", role: "admin" } };

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/outreach/threads/c-1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeBadJsonRequest(): NextRequest {
  return new NextRequest("http://localhost/api/outreach/threads/c-1", {
    method: "PATCH",
    body: "not json{",
    headers: { "Content-Type": "application/json" },
  });
}

function mockUpdateChain(returnedIds: { id: string }[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnedIds),
  };
  mockDbUpdate.mockReturnValue(chain);
  return chain;
}

const params = Promise.resolve({ contactId: "c-1" });

describe("PATCH /api/outreach/threads/[contactId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 without a session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ is_read: true }), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin role", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u", email: "u@e.com", role: "user" } });
    const res = await PATCH(makeRequest({ is_read: true }), { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    const res = await PATCH(makeBadJsonRequest(), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when no valid fields are provided", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    const res = await PATCH(makeRequest({}), { params });
    expect(res.status).toBe(400);
  });

  it("archives all replies in the thread when is_archived=true", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    const chain = mockUpdateChain([{ id: "r1" }, { id: "r2" }, { id: "r3" }]);

    const res = await PATCH(makeRequest({ is_archived: true }), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.updated).toBe(3);
    expect(chain.set).toHaveBeenCalledWith({ isArchived: true });
  });

  it("marks all replies in the thread as read when is_read=true", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    const chain = mockUpdateChain([{ id: "r1" }, { id: "r2" }]);

    const res = await PATCH(makeRequest({ is_read: true }), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.updated).toBe(2);
    expect(chain.set).toHaveBeenCalledWith({ isRead: true });
  });

  it("supports both fields in one request", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    const chain = mockUpdateChain([{ id: "r1" }]);

    await PATCH(makeRequest({ is_read: true, is_archived: false }), { params });

    expect(chain.set).toHaveBeenCalledWith({ isRead: true, isArchived: false });
  });

  it("ignores non-boolean values", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    const res = await PATCH(makeRequest({ is_read: "yes" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 500 on db error", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockRejectedValue(new Error("boom")),
    });

    const res = await PATCH(makeRequest({ is_read: true }), { params });
    expect(res.status).toBe(500);
  });
});
