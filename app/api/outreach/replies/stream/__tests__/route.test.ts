import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockAuth, mockAddClient, mockRemoveClient } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockAddClient: vi.fn(),
  mockRemoveClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/realtime/sse-manager", () => ({
  sseManager: {
    addClient: mockAddClient,
    removeClient: mockRemoveClient,
  },
}));

import { GET } from "../route";

const ADMIN_SESSION = { user: { id: "admin-1", email: "a@x.com", role: "admin" } };

beforeEach(() => {
  mockAuth.mockReset();
  mockAddClient.mockReset();
  mockRemoveClient.mockReset();
  mockAddClient.mockReturnValue("client-uuid");
});

function makeRequest(signal?: AbortSignal): NextRequest {
  const init: { signal?: AbortSignal } = {};
  if (signal) init.signal = signal;
  return new NextRequest("http://localhost:3500/api/outreach/replies/stream", init);
}

describe("GET /api/outreach/replies/stream", () => {
  it("returns 401 without a session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin role", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u-1", email: "u@x.com", role: "user" },
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns a text/event-stream response for an admin", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
    expect(mockAddClient).toHaveBeenCalledTimes(1);

    // First chunk should be the `connected` frame.
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: connected");
    expect(text).toContain("client-uuid");
    await reader.cancel();
  });

  it("removeClient is called when the request signal aborts", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    const ac = new AbortController();
    const res = await GET(makeRequest(ac.signal));
    // Read the initial frame to ensure start() has executed.
    const reader = res.body!.getReader();
    await reader.read();

    ac.abort();
    // Allow the abort listener to fire.
    await new Promise((r) => setTimeout(r, 0));

    expect(mockRemoveClient).toHaveBeenCalledWith("client-uuid");
    await reader.cancel().catch(() => {});
  });
});
