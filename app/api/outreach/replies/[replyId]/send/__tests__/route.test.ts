import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before vi.mock() so factories can reference them
// ---------------------------------------------------------------------------
const {
  mockAuth,
  mockDbSelect,
  mockDbUpdate,
  mockSelectSenderForUser,
  mockIncrementSenderCount,
  mockResendSend,
  mockWriteTimelineEvent,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockSelectSenderForUser: vi.fn(),
  mockIncrementSenderCount: vi.fn(),
  mockResendSend: vi.fn(),
  mockWriteTimelineEvent: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => `eq:${val}`),
  and: vi.fn((...args) => args.join("&")),
  isNull: vi.fn((col) => `isNull:${col}`),
}));

vi.mock("@/lib/db/schema", () => ({
  outreachReplies: "outreach_replies",
  outreachContacts: "outreach_contacts",
  outreachCampaigns: "outreach_campaigns",
  contacts: "contacts",
}));

vi.mock("@/lib/outreach/sending/sender", () => ({
  selectSenderForUser: mockSelectSenderForUser,
}));

vi.mock("@/lib/outreach/sending/queries", () => ({
  incrementSenderCount: mockIncrementSenderCount,
}));

vi.mock("@/lib/crm/timeline", () => ({
  writeTimelineEvent: mockWriteTimelineEvent,
}));

vi.mock("resend", () => ({
  // Must use a regular function (not arrow) so `new Resend(...)` works in vitest.
  Resend: vi.fn(function () {
    return { emails: { send: mockResendSend } };
  }),
}));

// ---------------------------------------------------------------------------
// Import handler after mocks
// ---------------------------------------------------------------------------
import { POST } from "../route";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------
const ADMIN_SESSION = { user: { id: "admin-1", email: "admin@example.com", role: "admin" } };
const REPLY_ID = "reply-uuid-1";

const BASE_REPLY_RECORD = {
  id: REPLY_ID,
  contactId: "contact-1",
  campaignId: "campaign-1",
  fromEmail: "contact@acme.com",
  subject: "Question about pricing",
  bodyText: "Hi, I have a question.",
  bodyHtml: null,
  sentiment: "positive",
  intent: null,
  aiSummary: null,
  aiSuggestedReply: null,
  isRead: false,
  isArchived: false,
  receivedAt: "2024-01-01T00:00:00Z",
  createdAt: "2024-01-01T00:00:00Z",
  inboundMessageId: "<msg-123@mail.example.com>",
  crmContactId: null,
  crmDealId: null,
  pushedToCrmAt: null,
  replyBody: null,
  replySenderEmail: null,
  replySentAt: null,
};

const BASE_CONTACT = {
  id: "contact-1",
  email: "contact@acme.com",
  firstName: "Jane",
  lastName: "Doe",
  company: "Acme Corp",
  campaignId: "campaign-1",
};

const BASE_CAMPAIGN = {
  id: "campaign-1",
  name: "Q1 Campaign",
};

const SENDER = {
  id: "sender-1",
  email: "sender@company.com",
  name: "Sales Team",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: Record<string, unknown> = { body: "Thanks for reaching out!" }) {
  return new NextRequest(`http://localhost/api/outreach/replies/${REPLY_ID}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(replyId = REPLY_ID) {
  return { params: Promise.resolve({ replyId }) };
}

/**
 * Sets up the db.select mock for the initial reply fetch query.
 * The route uses: db.select({...}).from(...).leftJoin(...).leftJoin(...).where(...).limit(1)
 */
function mockReplyFetch(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mockDbSelect.mockReturnValue(chain);
  return chain;
}

/**
 * Sets up the db.select mock with multiple calls in order (for routes that
 * call db.select more than once, e.g. the final re-fetch).
 */
function mockDbSelectSequence(sequences: unknown[][]) {
  let callCount = 0;
  mockDbSelect.mockImplementation(() => {
    const rows = sequences[callCount] ?? [];
    callCount++;
    return {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
    };
  });
}

/**
 * Sets up db.update to simulate the idempotency lock UPDATE … RETURNING.
 * `lockedRows` — what the .returning() call resolves to.
 */
function mockLockUpdate(lockedRows: unknown[]) {
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(lockedRows),
  };
  mockDbUpdate.mockReturnValue(updateChain);
  return updateChain;
}

/**
 * Sets up db.update to handle two sequential calls:
 *  1. The idempotency lock (returns lockedRows)
 *  2. The metadata update after send (returns metaRows)
 */
function mockUpdateSequence(lockedRows: unknown[], metaRows: unknown[]) {
  let updateCallCount = 0;
  mockDbUpdate.mockImplementation(() => {
    updateCallCount++;
    if (updateCallCount === 1) {
      // Lock: has returning()
      return {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue(lockedRows),
      };
    }
    // Metadata update: also has returning()
    return {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(metaRows),
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/outreach/replies/[replyId]/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: RESEND_API_KEY is set
    process.env.RESEND_API_KEY = "re_test_key";
  });

  // -------------------------------------------------------------------------
  // Auth guards
  // -------------------------------------------------------------------------

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when the user is not an admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "user" } });

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  it("returns 400 when body is empty string", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);

    const res = await POST(makeRequest({ body: "   " }), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Reply body is required");
  });

  it("returns 400 when JSON is invalid", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    const req = new NextRequest(`http://localhost/api/outreach/replies/${REPLY_ID}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    const res = await POST(req, makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON in request body");
  });

  // -------------------------------------------------------------------------
  // Reply lookup
  // -------------------------------------------------------------------------

  it("returns 404 when the reply does not exist", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockReplyFetch([]);

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 409 when reply.replySentAt is already set (pre-lock check)", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockReplyFetch([
      {
        reply: { ...BASE_REPLY_RECORD, replySentAt: "2024-01-01T10:00:00.000Z" },
        contact: BASE_CONTACT,
        campaign: BASE_CAMPAIGN,
      },
    ]);

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Reply has already been sent");
    // DB update (lock) must NOT have been called
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Pre-flight validation — lock must NOT be acquired on these failures
  // -------------------------------------------------------------------------

  it("returns 400 and does NOT set replySentAt when contact has no email", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockReplyFetch([
      {
        reply: BASE_REPLY_RECORD,
        contact: null, // no contact
        campaign: BASE_CAMPAIGN,
      },
    ]);

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("No contact email associated with this reply");
    // Lock must NOT be acquired
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 and does NOT set replySentAt when reply has no campaignId", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockReplyFetch([
      {
        reply: { ...BASE_REPLY_RECORD, campaignId: null },
        contact: BASE_CONTACT,
        campaign: null,
      },
    ]);

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Reply has no associated campaign");
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("returns 422 and does NOT set replySentAt when no sender is available", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockReplyFetch([{ reply: BASE_REPLY_RECORD, contact: BASE_CONTACT, campaign: BASE_CAMPAIGN }]);
    mockSelectSenderForUser.mockResolvedValue(null);

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("No available sender accounts for this campaign");
    // Lock must NOT be acquired
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("returns 500 and does NOT set replySentAt when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockReplyFetch([{ reply: BASE_REPLY_RECORD, contact: BASE_CONTACT, campaign: BASE_CAMPAIGN }]);
    mockSelectSenderForUser.mockResolvedValue(SENDER);

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Email service not configured");
    // Lock must NOT be acquired
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Idempotency lock — concurrent requests
  // -------------------------------------------------------------------------

  it("returns 409 when lock UPDATE returns empty (concurrent request won the race)", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockReplyFetch([{ reply: BASE_REPLY_RECORD, contact: BASE_CONTACT, campaign: BASE_CAMPAIGN }]);
    mockSelectSenderForUser.mockResolvedValue(SENDER);
    // Lock returns no rows — another request claimed it first
    mockLockUpdate([]);

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Reply has already been sent");
  });

  // -------------------------------------------------------------------------
  // Resend failure — lock must be rolled back
  // -------------------------------------------------------------------------

  it("rolls back replySentAt when Resend returns an error", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockReplyFetch([{ reply: BASE_REPLY_RECORD, contact: BASE_CONTACT, campaign: BASE_CAMPAIGN }]);
    mockSelectSenderForUser.mockResolvedValue(SENDER);

    // Lock acquired successfully
    let updateCallCount = 0;
    const rollbackMock = vi.fn().mockResolvedValue([]);
    mockDbUpdate.mockImplementation(() => {
      updateCallCount++;
      if (updateCallCount === 1) {
        // Lock: returning resolves with a row
        return {
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{ id: REPLY_ID }]),
        };
      }
      // Rollback update: set/where only (no returning needed)
      return {
        set: vi.fn().mockReturnThis(),
        where: rollbackMock,
      };
    });

    mockResendSend.mockResolvedValue({ data: null, error: { message: "provider error" } });

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Failed to send reply");

    // Rollback update was called (second db.update call)
    expect(updateCallCount).toBe(2);
    expect(rollbackMock).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Successful send
  // -------------------------------------------------------------------------

  it("sets replySentAt, replyBody, replySenderEmail and returns 200 on successful send", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);

    const updatedReplyRecord = {
      ...BASE_REPLY_RECORD,
      replySentAt: "2024-01-02T10:00:00.000Z",
      replyBody: "Thanks for reaching out!",
      replySenderEmail: SENDER.email,
    };

    // Three db.select calls:
    //  1. initial reply fetch
    //  2. fire-and-forget timeline contacts lookup (synchronously starts before re-fetch)
    //  3. final re-fetch for the response
    mockDbSelectSequence([
      [{ reply: BASE_REPLY_RECORD, contact: BASE_CONTACT, campaign: BASE_CAMPAIGN }],
      [], // timeline contacts — no CRM contact found, so no timeline event written
      [{ reply: updatedReplyRecord, contact: BASE_CONTACT, campaign: BASE_CAMPAIGN }],
    ]);

    mockSelectSenderForUser.mockResolvedValue(SENDER);
    mockResendSend.mockResolvedValue({ data: { id: "resend-msg-1" }, error: null });
    mockIncrementSenderCount.mockResolvedValue(undefined);

    // Lock + metadata update
    mockUpdateSequence([{ id: REPLY_ID }], [updatedReplyRecord]);

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.reply).toBeDefined();
    expect(body.reply.replySentAt).toBeTruthy();
    expect(body.reply.replyBody).toBe("Thanks for reaching out!");
    expect(body.reply.replySenderEmail).toBe(SENDER.email);

    // Resend was called
    expect(mockResendSend).toHaveBeenCalledOnce();
    const [sendArgs] = mockResendSend.mock.calls[0];
    expect(sendArgs.to).toBe(BASE_REPLY_RECORD.fromEmail);
    expect(sendArgs.subject).toBe("Re: Question about pricing");

    // Quoted reply formatting — text part has the new reply text plus the
    // Gmail-style attribution line and a `> `-prefixed quoted block.
    expect(sendArgs.text).toContain("Thanks for reaching out!");
    expect(sendArgs.text).toContain("On ");
    expect(sendArgs.text).toContain(" wrote:");
    expect(sendArgs.text.split("\n").some((l: string) => l.startsWith("> "))).toBe(true);

    // HTML part uses Gmail's gmail_quote pattern so Gmail collapses it.
    expect(sendArgs.html).toContain('class="gmail_quote');

    // Sender count incremented
    expect(mockIncrementSenderCount).toHaveBeenCalledWith(SENDER.id);
  });

  it("prefixes subject with Re: only once when subject already starts with Re:", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);

    const alreadyReplied = { ...BASE_REPLY_RECORD, subject: "Re: Question about pricing" };
    const updatedReplyRecord = { ...alreadyReplied, replySentAt: "2024-01-02T10:00:00.000Z" };

    mockDbSelectSequence([
      [{ reply: alreadyReplied, contact: BASE_CONTACT, campaign: BASE_CAMPAIGN }],
      [], // timeline contacts lookup (fire-and-forget)
      [{ reply: updatedReplyRecord, contact: BASE_CONTACT, campaign: BASE_CAMPAIGN }],
    ]);
    mockSelectSenderForUser.mockResolvedValue(SENDER);
    mockResendSend.mockResolvedValue({ data: { id: "msg-2" }, error: null });
    mockIncrementSenderCount.mockResolvedValue(undefined);
    mockUpdateSequence([{ id: REPLY_ID }], [updatedReplyRecord]);

    await POST(makeRequest(), makeParams());

    const [sendArgs] = mockResendSend.mock.calls[0];
    expect(sendArgs.subject).toBe("Re: Question about pricing");
  });

  it("includes In-Reply-To and References headers when inboundMessageId is set", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);

    const updatedReplyRecord = {
      ...BASE_REPLY_RECORD,
      replySentAt: "2024-01-02T10:00:00.000Z",
    };

    mockDbSelectSequence([
      [{ reply: BASE_REPLY_RECORD, contact: BASE_CONTACT, campaign: BASE_CAMPAIGN }],
      [], // timeline contacts lookup (fire-and-forget)
      [{ reply: updatedReplyRecord, contact: BASE_CONTACT, campaign: BASE_CAMPAIGN }],
    ]);
    mockSelectSenderForUser.mockResolvedValue(SENDER);
    mockResendSend.mockResolvedValue({ data: { id: "msg-3" }, error: null });
    mockIncrementSenderCount.mockResolvedValue(undefined);
    mockUpdateSequence([{ id: REPLY_ID }], [updatedReplyRecord]);

    await POST(makeRequest(), makeParams());

    const [sendArgs] = mockResendSend.mock.calls[0];
    expect(sendArgs.headers?.["In-Reply-To"]).toBe("<msg-123@mail.example.com>");
    expect(sendArgs.headers?.["References"]).toBe("<msg-123@mail.example.com>");
  });

  // -------------------------------------------------------------------------
  // LOCKED: Reply-To MUST be the sender's plain mailbox — never `reply+UUID@`.
  // See the CRITICAL block in the route handler and CLAUDE.md ("Outreach
  // Reply-To (LOCKED)"). This regression test exists because the UUID-based
  // reply-to was reintroduced once already — do not delete.
  // -------------------------------------------------------------------------
  it("sets Reply-To to the sender's plain mailbox (no reply+UUID@ synthetic address)", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);

    const updatedReplyRecord = {
      ...BASE_REPLY_RECORD,
      replySentAt: "2024-01-02T10:00:00.000Z",
    };

    mockDbSelectSequence([
      [{ reply: BASE_REPLY_RECORD, contact: BASE_CONTACT, campaign: BASE_CAMPAIGN }],
      [], // timeline contacts lookup (fire-and-forget)
      [{ reply: updatedReplyRecord, contact: BASE_CONTACT, campaign: BASE_CAMPAIGN }],
    ]);
    mockSelectSenderForUser.mockResolvedValue(SENDER);
    mockResendSend.mockResolvedValue({ data: { id: "msg-4" }, error: null });
    mockIncrementSenderCount.mockResolvedValue(undefined);
    mockUpdateSequence([{ id: REPLY_ID }], [updatedReplyRecord]);

    await POST(makeRequest(), makeParams());

    const [sendArgs] = mockResendSend.mock.calls[0];
    expect(sendArgs.replyTo).toBe(SENDER.email);
    expect(sendArgs.replyTo).not.toMatch(/^reply\+/);
    expect(sendArgs.replyTo).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });
});
