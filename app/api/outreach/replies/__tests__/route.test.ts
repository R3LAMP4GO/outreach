import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockAuth, mockDbExecute } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDbExecute: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  db: {
    execute: mockDbExecute,
  },
}));

// `sql` is invoked as a tagged template; we just need it to return *something*
// so the route can pass it to db.execute. Each call captures the interpolated
// values so tests can introspect filter parameters.
vi.mock("drizzle-orm", () => {
  const sqlFn = (strings: TemplateStringsArray, ...values: unknown[]) => ({
    __sql: true,
    strings,
    values,
  });
  return { sql: sqlFn };
});

vi.mock("@/lib/security/input-validation", () => ({
  sanitizeSearchForOrFilter: vi.fn((s: string) => s.trim()),
}));

// ---------------------------------------------------------------------------
import { GET } from "../route";

const FAKE_SESSION = { user: { id: "admin-1", email: "admin@example.com", role: "admin" } };

// Raw row shape returned by db.execute (snake_case column names with joined fields)
function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "reply-1",
    contact_id: "c-1",
    campaign_id: "camp-1",
    from_email: "contact@acme.com",
    subject: null,
    body_text: null,
    body_html: null,
    sentiment: "positive",
    intent: null,
    ai_summary: null,
    ai_suggested_reply: null,
    is_read: false,
    is_archived: false,
    received_at: "2024-01-01T00:00:00Z",
    created_at: "2024-01-01T00:00:00Z",
    inbound_message_id: null,
    crm_contact_id: null,
    crm_deal_id: null,
    pushed_to_crm_at: null,
    reply_body: null,
    reply_sender_email: null,
    reply_sent_at: null,
    message_count: 1,
    unread_count: 1,
    last_received_at: "2024-01-01T00:00:00Z",
    c_id: "c-1",
    c_first_name: "Jane",
    c_last_name: "Doe",
    c_email: "contact@acme.com",
    c_company: "Acme",
    cmp_id: "camp-1",
    cmp_name: "Q1 Campaign",
    ...overrides,
  };
}

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/outreach/replies");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
}

/**
 * Route makes TWO db.execute calls in order:
 *   1. data query  → array of rows
 *   2. count query → [{ count: N }]
 */
function mockExecuteSequence({
  rows = [makeRow()],
  count = 1,
}: {
  rows?: ReturnType<typeof makeRow>[];
  count?: number;
} = {}) {
  let call = 0;
  mockDbExecute.mockImplementation(() => {
    call++;
    if (call === 1) return Promise.resolve(rows);
    return Promise.resolve([{ count }]);
  });
}

// ---------------------------------------------------------------------------
describe("GET /api/outreach/replies", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
  });

  it("returns 403 when user does not have admin role", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", email: "u@e.com", role: "user" } });
    const response = await GET(makeRequest());
    expect(response.status).toBe(403);
  });

  it("returns 200 with thread rows mapped to snake_case", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    mockExecuteSequence({ rows: [makeRow()], count: 1 });

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.replies).toHaveLength(1);
    expect(body.replies[0]).toMatchObject({
      id: "reply-1",
      contact_id: "c-1",
      campaign_id: "camp-1",
      message_count: 1,
      unread_count: 1,
      contact: { id: "c-1", first_name: "Jane", email: "contact@acme.com" },
      campaign: { id: "camp-1", name: "Q1 Campaign" },
    });
  });

  it("groups multiple messages from the same contact into one thread row with counts", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    // Simulate the SQL CTE result: one row per contact with aggregate counts.
    const rows = [
      makeRow({
        id: "reply-3",
        contact_id: "c-A",
        c_id: "c-A",
        message_count: 3,
        unread_count: 2,
        received_at: "2024-01-03T00:00:00Z",
        last_received_at: "2024-01-03T00:00:00Z",
      }),
      makeRow({
        id: "reply-4",
        contact_id: "c-B",
        c_id: "c-B",
        message_count: 1,
        unread_count: 1,
        received_at: "2024-01-02T00:00:00Z",
        last_received_at: "2024-01-02T00:00:00Z",
      }),
    ];
    mockExecuteSequence({ rows, count: 2 });

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.replies).toHaveLength(2);

    const threadA = body.replies.find((r: { contact_id: string }) => r.contact_id === "c-A");
    expect(threadA).toMatchObject({ id: "reply-3", message_count: 3, unread_count: 2 });

    const threadB = body.replies.find((r: { contact_id: string }) => r.contact_id === "c-B");
    expect(threadB).toMatchObject({ id: "reply-4", message_count: 1, unread_count: 1 });
  });

  it("passes is_archived=true into the SQL when param is 'true'", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    mockExecuteSequence();

    await GET(makeRequest({ is_archived: "true" }));

    // First call is the data query — the values array should contain `true` for is_archived
    const dataCall = mockDbExecute.mock.calls[0][0] as { values: unknown[] };
    expect(dataCall.values).toContain(true);
  });

  it("defaults is_archived to false when param is missing", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    mockExecuteSequence();

    await GET(makeRequest());

    const dataCall = mockDbExecute.mock.calls[0][0] as { values: unknown[] };
    expect(dataCall.values).toContain(false);
  });

  it("passes campaign_id into the SQL", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    mockExecuteSequence();

    await GET(makeRequest({ campaign_id: "camp-42" }));

    const dataCall = mockDbExecute.mock.calls[0][0] as { values: unknown[] };
    expect(dataCall.values).toContain("camp-42");
  });

  it("passes sentiment into the SQL when provided", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    mockExecuteSequence();

    await GET(makeRequest({ sentiment: "positive" }));

    const dataCall = mockDbExecute.mock.calls[0][0] as { values: unknown[] };
    expect(dataCall.values).toContain("positive");
  });

  it("passes a wildcard search pattern into the SQL", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    mockExecuteSequence();

    await GET(makeRequest({ search: "acme" }));

    const dataCall = mockDbExecute.mock.calls[0][0] as { values: unknown[] };
    expect(dataCall.values).toContain("%acme%");
  });

  it("passes null search pattern when search is whitespace only", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    mockExecuteSequence();

    await GET(makeRequest({ search: "   " }));

    const dataCall = mockDbExecute.mock.calls[0][0] as { values: unknown[] };
    // sanitize returns "" → falsy → searchPattern is null
    expect(dataCall.values).toContain(null);
  });

  it("passes unreadOnly=true into the SQL when is_read='false'", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    mockExecuteSequence();

    await GET(makeRequest({ is_read: "false" }));

    const dataCall = mockDbExecute.mock.calls[0][0] as { values: unknown[] };
    expect(dataCall.values).toContain(true); // unreadOnly = true
  });

  it("clamps limit to 200", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    mockExecuteSequence();
    const response = await GET(makeRequest({ limit: "999" }));
    const body = await response.json();
    expect(body.limit).toBe(200);
  });

  it("defaults limit to 50 on invalid input", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    mockExecuteSequence();
    const response = await GET(makeRequest({ limit: "bad" }));
    const body = await response.json();
    expect(body.limit).toBe(50);
  });

  it("defaults offset to 0 on negative input", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    mockExecuteSequence();
    const response = await GET(makeRequest({ offset: "-5" }));
    const body = await response.json();
    expect(body.offset).toBe(0);
  });

  it("returns 500 on db error", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    mockDbExecute.mockRejectedValueOnce(new Error("DB down"));
    const response = await GET(makeRequest());
    expect(response.status).toBe(500);
  });
});
