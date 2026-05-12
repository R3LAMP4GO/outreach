import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockAnalyzeReply,
  mockGetCampaign,
  mockMarkContactReplied,
  mockPauseContact,
  mockPauseContactsByDomain,
  mockUpdateCampaignStats,
  mockPushToCrm,
  mockIsAutoReply,
  mockResendReceivingGet,
  state,
} = vi.hoisted(() => {
  const state: {
    contactRow: Record<string, unknown> | null;
    insertedReplyId: string;
    priorReplies: Array<Record<string, unknown>>;
    selectCallIndex: number;
    insertConflict: boolean;
  } = {
    contactRow: null,
    insertedReplyId: "new-reply-id",
    priorReplies: [],
    selectCallIndex: 0,
    insertConflict: false,
  };

  return {
    mockAnalyzeReply: vi.fn().mockResolvedValue({
      sentiment: "neutral",
      summary: "summary",
      suggestedReply: "ok",
      intent: "other",
    }),
    mockGetCampaign: vi.fn().mockResolvedValue({
      id: "camp-1",
      name: "Test Campaign",
      stop_on_auto_reply: false,
      stop_company_on_reply: false,
    }),
    mockMarkContactReplied: vi.fn().mockResolvedValue(undefined),
    mockPauseContact: vi.fn().mockResolvedValue(undefined),
    mockPauseContactsByDomain: vi.fn().mockResolvedValue(0),
    mockUpdateCampaignStats: vi.fn().mockResolvedValue(undefined),
    mockPushToCrm: vi.fn().mockResolvedValue(null),
    mockIsAutoReply: vi.fn().mockReturnValue(false),
    mockResendReceivingGet: vi
      .fn()
      .mockResolvedValue({ data: { text: "thanks for reaching out", html: null, headers: {} } }),
    state,
  };
});

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { receiving: { get: mockResendReceivingGet } },
  })),
}));

vi.mock("../../../ai/reply-analyzer", () => ({
  analyzeReply: mockAnalyzeReply,
}));

vi.mock("../../../campaigns/queries", () => ({
  getCampaign: mockGetCampaign,
}));

vi.mock("../../../contacts/actions", () => ({
  markContactReplied: mockMarkContactReplied,
  pauseContact: mockPauseContact,
  pauseContactsByDomain: mockPauseContactsByDomain,
}));

vi.mock("../../../campaigns/actions", () => ({
  updateCampaignStats: mockUpdateCampaignStats,
}));

vi.mock("../../../crm/push-to-crm", () => ({
  pushToCrm: mockPushToCrm,
}));

vi.mock("../../auto-reply-detector", () => ({
  isAutoReply: mockIsAutoReply,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Drizzle db mock — supports both:
//   db.select(...).from(...).where(...).limit(1)               → contact lookup
//   db.select(...).from(...).where(...).orderBy(...)           → prior replies
//   db.insert(...).values(...).returning(...)                  → insert reply / events
//   db.update(...).set(...).where(...)                         → update reply
vi.mock("@/lib/db", () => {
  const makeContactQuery = () => {
    const obj = {
      from: () => obj,
      where: () => obj,
      orderBy: () => obj,
      limit: () => Promise.resolve(state.contactRow ? [state.contactRow] : []),
    };
    return obj;
  };
  const makePriorRepliesQuery = () => {
    const obj = {
      from: () => obj,
      where: () => obj,
      orderBy: () => Promise.resolve(state.priorReplies),
      limit: () => Promise.resolve([]),
    };
    return obj;
  };
  return {
    db: {
      select: () => {
        // First select call = contact lookup; subsequent = prior replies
        state.selectCallIndex += 1;
        if (state.selectCallIndex === 1) return makeContactQuery();
        return makePriorRepliesQuery();
      },
      insert: () => ({
        values: () => ({
          // Without conflict target — used by event log inserts
          returning: () => Promise.resolve([{ id: state.insertedReplyId }]),
          // With conflict target — used by reply insert (Message-ID idempotency)
          onConflictDoNothing: () => ({
            returning: () =>
              Promise.resolve(state.insertConflict ? [] : [{ id: state.insertedReplyId }]),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(undefined),
        }),
      }),
    },
  };
});

// Import AFTER mocks
import { handleEmailReceived } from "../received";
import type { EmailReceivedEvent } from "../../types";

function makeEvent(overrides: Partial<EmailReceivedEvent["data"]> = {}): EmailReceivedEvent {
  return {
    type: "email.received",
    created_at: "2025-03-17T10:00:00Z",
    data: {
      created_at: "2025-03-17T10:00:00Z",
      email_id: "email-abc",
      from: "contact@acme.com",
      to: ["jake@email.__YOUR_DOMAIN__"],
      subject: "Re: hi",
      ...overrides,
    },
  } as EmailReceivedEvent;
}

const baseContact = {
  id: "contact-1",
  campaignId: "camp-1",
  status: "active",
  email: "contact@acme.com",
  firstName: "Jane",
  lastName: "Doe",
  company: "Acme",
  jobTitle: "CTO",
  phone: null,
  linkedinUrl: null,
  seniority: null,
  location: null,
  industry: null,
  companySize: null,
  email1Body: "Hey Jane, want to chat?",
  email1Subject: "Intro",
  email1SentAt: "2025-01-01T10:00:00Z",
  email2Body: "Following up.",
  email2SentAt: "2025-01-08T10:00:00Z",
  email3Body: null,
  email3SentAt: null,
};

describe("handleEmailReceived — conversation history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.selectCallIndex = 0;
    state.contactRow = { ...baseContact };
    state.priorReplies = [];
    state.insertConflict = false;
    mockResendReceivingGet.mockResolvedValue({
      data: {
        text: "actually we're swamped right now",
        html: null,
        headers: { "in-reply-to": "<some-id@resend>" },
      },
    });
  });

  it("calls analyzeReply with non-empty conversationHistory when prior replies exist", async () => {
    state.priorReplies = [
      {
        bodyText: "Not interested, thanks.",
        receivedAt: "2025-01-09T10:00:00Z",
        replyBody: "No worries — keep us in mind.",
        replySentAt: "2025-01-09T11:00:00Z",
      },
    ];

    const event = makeEvent({
      to: ["reply+11111111-1111-1111-1111-111111111111@email.__YOUR_DOMAIN__"],
    });
    const result = await handleEmailReceived(event, "svix-1");
    expect(result).toBe(true);

    expect(mockAnalyzeReply).toHaveBeenCalledTimes(1);
    const call = mockAnalyzeReply.mock.calls[0];
    const conversationHistory = call[8];
    expect(Array.isArray(conversationHistory)).toBe(true);
    expect(conversationHistory.length).toBeGreaterThan(0);

    // Outbound emails 1 & 2 + prior inbound + prior admin reply = 4 turns
    const roles = conversationHistory.map((t: { role: string }) => t.role);
    expect(roles).toContain("us");
    expect(roles).toContain("them");

    // Chronologically ordered
    const timestamps = conversationHistory.map((t: { sentAt: string }) => t.sentAt);
    const sorted = [...timestamps].sort();
    expect(timestamps).toEqual(sorted);
  });

  it("short-circuits and skips AI analysis when inbound Message-ID conflicts (duplicate)", async () => {
    state.priorReplies = [];
    state.insertConflict = true; // Simulate ON CONFLICT DO NOTHING returning no rows

    mockResendReceivingGet.mockResolvedValue({
      data: {
        text: "hello again",
        html: null,
        headers: { "message-id": "<dup-message-id@acme.com>" },
      },
    });

    const event = makeEvent({
      to: ["reply+33333333-3333-3333-3333-333333333333@email.__YOUR_DOMAIN__"],
    });
    const result = await handleEmailReceived(event, "svix-dup");

    expect(result).toBe(true);
    // analyzeReply must NOT be called for duplicates
    expect(mockAnalyzeReply).not.toHaveBeenCalled();
  });

  it("calls analyzeReply with history containing only outbound emails on the first reply", async () => {
    state.priorReplies = [];

    const event = makeEvent({
      to: ["reply+22222222-2222-2222-2222-222222222222@email.__YOUR_DOMAIN__"],
    });
    const result = await handleEmailReceived(event, "svix-2");
    expect(result).toBe(true);

    const conversationHistory = mockAnalyzeReply.mock.calls[0][8];
    // Just outbound emails 1 & 2 from the contact row
    expect(conversationHistory).toHaveLength(2);
    expect(conversationHistory.every((t: { role: string }) => t.role === "us")).toBe(true);
  });
});
