import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Declare hoisted mocks BEFORE vi.mock() calls so factories can reference them
// ---------------------------------------------------------------------------
const { mockAuth, mockDbSelect, mockDbUpdate, mockPushToCrm } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockPushToCrm: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/outreach/crm/push-to-crm", () => ({ pushToCrm: mockPushToCrm }));

vi.mock("@/lib/db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => ({ type: "eq", val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  asc: vi.fn((col) => ({ type: "asc", col })),
}));

vi.mock("@/lib/db/schema", () => ({
  outreachReplies: { _: "outreach_replies" },
  outreachContacts: { _: "outreach_contacts" },
  outreachCampaigns: { _: "outreach_campaigns" },
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------
import { PATCH } from "../route";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const FAKE_SESSION = { user: { id: "admin-1", email: "admin@example.com", role: "admin" } };
const REPLY_ID = "reply-uuid-1";

/**
 * The raw DB row returned by fetchReplyWithJoins's Drizzle query.
 * The function destructures row.reply, row.contact, row.campaign and maps to snake_case.
 */
const BASE_DB_ROW: {
  reply: Record<string, string | null | boolean>;
  contact: Record<string, string | null>;
  campaign: Record<string, string> | null;
} = {
  reply: {
    id: REPLY_ID,
    contactId: "contact-1",
    campaignId: "camp-1",
    fromEmail: "contact@acme.com",
    subject: null,
    bodyText: null,
    bodyHtml: null,
    sentiment: "positive",
    intent: null,
    aiSummary: null,
    aiSuggestedReply: null,
    isRead: false,
    isArchived: false,
    receivedAt: "2024-01-01T00:00:00Z",
    createdAt: "2024-01-01T00:00:00Z",
    inboundMessageId: null,
    crmContactId: null,
    crmDealId: null,
    pushedToCrmAt: null,
    replyBody: null,
    replySenderEmail: null,
    replySentAt: null,
  },
  contact: {
    id: "contact-1",
    firstName: "Jane",
    lastName: "Doe",
    email: "contact@acme.com",
    company: "Acme Corp",
    jobTitle: null,
    phone: null,
    linkedinUrl: null,
    seniority: null,
    location: null,
    industry: null,
    companySize: null,
    email1Body: null,
    email1Subject: null,
    email1SentAt: null,
    email2Body: null,
    email2Subject: null,
    email2SentAt: null,
    email3Body: null,
    email3Subject: null,
    email3SentAt: null,
  },
  campaign: { id: "camp-1", name: "Q1 Campaign" },
};

// The snake_case shape that fetchReplyWithJoins() returns to the route
const BASE_REPLY = {
  id: REPLY_ID,
  contact_id: "contact-1",
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
  contact: {
    id: "contact-1",
    first_name: "Jane",
    last_name: "Doe",
    email: "contact@acme.com",
    company: "Acme Corp",
    job_title: null,
    phone: null,
    linkedin_url: null,
    seniority: null,
    location: null,
    industry: null,
    company_size: null,
    email_1_body: null,
    email_1_subject: null,
    email_1_sent_at: null,
    email_2_body: null,
    email_2_subject: null,
    email_2_sent_at: null,
    email_3_body: null,
    email_3_subject: null,
    email_3_sent_at: null,
  },
  campaign: { id: "camp-1", name: "Q1 Campaign" },
};

// UPDATED_REPLY kept for reference (shape used inline in tests)
const _UPDATED_REPLY = { ...BASE_REPLY, is_read: true };
void _UPDATED_REPLY; // suppress unused-var

// ---------------------------------------------------------------------------
// Drizzle mock helpers
//
// fetchReplyWithJoins() uses:
//   db.select({...}).from(...).leftJoin(...).leftJoin(...).where(...).limit(1)
//   → resolves to array (destructured as [row])
//
// The PATCH route additionally calls:
//   db.update(...).set({...}).where(...)
//   → resolves to undefined (no returning())
// ---------------------------------------------------------------------------

/**
 * Builds a select chain for fetchReplyWithJoins.
 * `rows` is what .limit() resolves to.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeReplyFetchChain(rows: any[]): object {
  return {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

/**
 * Builds a db.update chain that resolves at .where().
 */
function makeUpdateChain({ throws = false } = {}): object {
  return {
    set: vi.fn().mockReturnValue({
      where: throws
        ? vi.fn().mockRejectedValue(new Error("DB write failed"))
        : vi.fn().mockResolvedValue(undefined),
    }),
  };
}

/**
 * Sets up simple field-update scenarios (is_read, is_archived, sentiment):
 *   1. db.update().set().where()  — no db.select() before the update
 *   2. fetchReplyWithJoins (select) → refetchRow
 *
 * The field-update path does NOT call fetchReplyWithJoins before updating;
 * it updates directly then re-fetches once.
 */
function mockPatchFieldUpdate({
  refetchRow = BASE_DB_ROW as typeof BASE_DB_ROW | null,
  updateThrows = false,
}: {
  refetchRow?: typeof BASE_DB_ROW | null;
  updateThrows?: boolean;
} = {}) {
  mockDbSelect.mockImplementation(() => makeReplyFetchChain(refetchRow ? [refetchRow] : []));

  mockDbUpdate.mockReturnValue(makeUpdateChain({ throws: updateThrows }));
}

/**
 * Sets up the push_to_crm action scenario:
 *   1. fetchReplyWithJoins (fetch reply) → fetchRow
 *   2. db.update().set().where() (write CRM fields)
 *   3. fetchReplyWithJoins (re-fetch after CRM update) → refetchRow
 */
function mockCrmPush({
  fetchRow = BASE_DB_ROW as typeof BASE_DB_ROW | null,
  refetchRow = BASE_DB_ROW as typeof BASE_DB_ROW | null,
  updateThrows = false,
}: {
  fetchRow?: typeof BASE_DB_ROW | null;
  refetchRow?: typeof BASE_DB_ROW | null;
  updateThrows?: boolean;
} = {}) {
  let selectCallCount = 0;
  mockDbSelect.mockImplementation(() => {
    selectCallCount++;
    if (selectCallCount === 1) {
      return makeReplyFetchChain(fetchRow ? [fetchRow] : []);
    }
    return makeReplyFetchChain(refetchRow ? [refetchRow] : []);
  });

  mockDbUpdate.mockReturnValue(makeUpdateChain({ throws: updateThrows }));
}

// ---------------------------------------------------------------------------
// Helper to build a NextRequest with a JSON body
// ---------------------------------------------------------------------------
function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/outreach/replies/${REPLY_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(replyId = REPLY_ID) {
  return { params: Promise.resolve({ replyId }) };
}

// ---------------------------------------------------------------------------
// PATCH /api/outreach/replies/[replyId]
// ---------------------------------------------------------------------------

describe("PATCH /api/outreach/replies/[replyId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // -------------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------------

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await PATCH(makeRequest({ is_read: true }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when session has no user", async () => {
    mockAuth.mockResolvedValue({ user: null });

    const response = await PATCH(makeRequest({ is_read: true }), makeParams());

    expect(response.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // Field updates
  // -------------------------------------------------------------------------

  it("updates is_read=true and returns the updated reply", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    // refetchRow simulates the DB state after the update
    const updatedRow = { ...BASE_DB_ROW, reply: { ...BASE_DB_ROW.reply, isRead: true } };
    mockPatchFieldUpdate({ refetchRow: updatedRow });

    const response = await PATCH(makeRequest({ is_read: true }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reply.is_read).toBe(true);
  });

  it("updates is_archived=true and returns the updated reply", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    const archivedRow = { ...BASE_DB_ROW, reply: { ...BASE_DB_ROW.reply, isArchived: true } };
    mockPatchFieldUpdate({ refetchRow: archivedRow });

    const response = await PATCH(makeRequest({ is_archived: true }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reply.is_archived).toBe(true);
  });

  it("returns 400 when no valid update fields are provided", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);

    const response = await PATCH(makeRequest({ unknown_field: "value" }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("No valid fields to update");
  });

  it("returns 400 when request body is invalid JSON", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);

    const req = new NextRequest(`http://localhost/api/outreach/replies/${REPLY_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{ not valid json >>>",
    });

    const response = await PATCH(req, makeParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid JSON in request body");
  });

  it("returns 500 when the database update fails", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    // update throws → caught by the outer try/catch → 500
    mockPatchFieldUpdate({ updateThrows: true });

    const response = await PATCH(makeRequest({ is_read: true }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Internal server error");
  });

  it("returns 500 when the refetch after update returns null", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    // Update succeeds, but refetch returns no row → route returns 500
    mockPatchFieldUpdate({ refetchRow: null });

    const response = await PATCH(makeRequest({ is_read: true }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("failed to fetch updated reply");
  });

  // -------------------------------------------------------------------------
  // push_to_crm action
  // -------------------------------------------------------------------------

  it("returns 409 when action=push_to_crm but pushed_to_crm_at is already set", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    const alreadyPushedRow = {
      ...BASE_DB_ROW,
      reply: { ...BASE_DB_ROW.reply, pushedToCrmAt: "2024-01-01T12:00:00Z" },
    };
    mockCrmPush({ fetchRow: alreadyPushedRow });

    const response = await PATCH(makeRequest({ action: "push_to_crm" }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("Reply has already been pushed to CRM");
  });

  it("calls pushToCrm and updates reply on action=push_to_crm", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    const updatedRow = {
      ...BASE_DB_ROW,
      reply: { ...BASE_DB_ROW.reply, pushedToCrmAt: "2024-01-02T00:00:00Z" },
    };
    mockCrmPush({ refetchRow: updatedRow });

    mockPushToCrm.mockResolvedValue({
      crmContactId: "crm-contact-1",
      crmDealId: "crm-deal-1",
    });

    const response = await PATCH(makeRequest({ action: "push_to_crm" }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockPushToCrm).toHaveBeenCalledOnce();

    // Verify pushToCrm was called with the correct contact data
    // Route signature: pushToCrm(contactObj, campaignName, { aiSummary, intent })
    const [contactArg, campaignArg] = mockPushToCrm.mock.calls[0];
    expect(contactArg.email).toBe(BASE_DB_ROW.contact.email);
    expect(contactArg.firstName).toBe(BASE_DB_ROW.contact.firstName);
    expect(campaignArg).toBe(BASE_DB_ROW.campaign?.name);

    // Response should include the updated reply
    expect(body.reply).toBeDefined();
  });

  it("returns 500 when pushToCrm returns null", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    mockCrmPush();
    mockPushToCrm.mockResolvedValue(null);

    const response = await PATCH(makeRequest({ action: "push_to_crm" }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Failed to push reply to CRM");
  });

  it("returns 404 when reply is not found during push_to_crm", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    mockCrmPush({ fetchRow: null });

    const response = await PATCH(makeRequest({ action: "push_to_crm" }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Reply not found");
  });

  it("returns 400 when reply has no contact during push_to_crm", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    const rowNoContact = { ...BASE_DB_ROW, contact: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCrmPush({ fetchRow: rowNoContact as any });

    const response = await PATCH(makeRequest({ action: "push_to_crm" }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("No contact associated with this reply");
  });

  it('uses "Unknown Campaign" when reply has no campaign', async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    const rowNoCampaign = { ...BASE_DB_ROW, campaign: null };
    const updatedRow = {
      ...BASE_DB_ROW,
      reply: { ...BASE_DB_ROW.reply, pushedToCrmAt: "2024-01-02T00:00:00Z" },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCrmPush({ fetchRow: rowNoCampaign as any, refetchRow: updatedRow as any });

    mockPushToCrm.mockResolvedValue({ crmContactId: "crm-c", crmDealId: "crm-d" });

    await PATCH(makeRequest({ action: "push_to_crm" }), makeParams());

    const campaignArg = mockPushToCrm.mock.calls[0][1];
    expect(campaignArg).toBe("Unknown Campaign");
  });

  it("returns 500 when the update after push_to_crm fails", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION);
    mockCrmPush({ updateThrows: true });

    mockPushToCrm.mockResolvedValue({ crmContactId: "crm-c", crmDealId: "crm-d" });

    const response = await PATCH(makeRequest({ action: "push_to_crm" }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    // The outer catch will return "Internal server error"
    expect(body.error).toBeDefined();
  });
});
