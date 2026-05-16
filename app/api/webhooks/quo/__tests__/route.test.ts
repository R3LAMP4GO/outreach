/**
 * Tests for POST /api/webhooks/quo
 *
 * Mocking strategy
 * ----------------
 * - `@/lib/db` is a chainable Drizzle stub so we can assert idempotency-row
 *   writes and the "already seen" short-circuit without touching Postgres.
 * - `@/lib/queue` (the enqueue functions) is hoisted-mocked so we can assert
 *   exactly which job got fired and with what payload.
 * - `@/lib/quo/webhook-handlers` (inline message handlers) is mocked so
 *   message.* events can be asserted by call args, not by DB side effects.
 * - `@/lib/rate-limit` is mocked to always allow \u2014 we test rate-limit logic
 *   in its own suite.
 *
 * Signature generation uses the real `signQuoPayload` helper so the test
 * matches whatever the route is verifying against. Bad signatures use a
 * different secret.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockInsert,
  insertChain,
  mockEnqueueProcessQuoCall,
  mockHandleQuoMessageReceived,
  mockHandleQuoMessageDelivered,
  mockCheckRateLimit,
} = vi.hoisted(() => {
  const insertChain: {
    _returnRows: Array<{ id: string }>;
    values: ReturnType<typeof vi.fn>;
    onConflictDoNothing: ReturnType<typeof vi.fn>;
    returning: ReturnType<typeof vi.fn>;
  } = {
    _returnRows: [{ id: "EV_default" }],
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
    returning: vi.fn(),
  };
  insertChain.values = vi.fn().mockReturnValue(insertChain);
  insertChain.onConflictDoNothing = vi.fn().mockReturnValue(insertChain);
  insertChain.returning = vi
    .fn()
    .mockImplementation(() => Promise.resolve(insertChain._returnRows));

  return {
    mockInsert: vi.fn().mockReturnValue(insertChain),
    insertChain,
    mockEnqueueProcessQuoCall: vi.fn().mockResolvedValue("job_abc"),
    mockHandleQuoMessageReceived: vi.fn().mockResolvedValue(undefined),
    mockHandleQuoMessageDelivered: vi.fn().mockResolvedValue(undefined),
    mockCheckRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 99, resetIn: 60000 }),
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  quoWebhookEvents: "quo_webhook_events_table",
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: () => "127.0.0.1",
}));

vi.mock("@/lib/queue", () => ({
  enqueueProcessQuoCall: (...args: unknown[]) => mockEnqueueProcessQuoCall(...args),
}));

vi.mock("@/lib/quo/webhook-handlers", () => ({
  handleQuoMessageReceived: (...args: unknown[]) => mockHandleQuoMessageReceived(...args),
  handleQuoMessageDelivered: (...args: unknown[]) => mockHandleQuoMessageDelivered(...args),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { GET, POST } from "../route";
import { signQuoPayload } from "@/lib/quo/verify-signature";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

// "test-secret-12345" base64-encoded \u2014 the real Quo secret is also base64.
const TEST_SECRET = Buffer.from("test-secret-12345").toString("base64");
const TEST_QUO_PHONE = "+15550001111";

const CALL_COMPLETED_EVENT = {
  id: "EVcall001",
  object: "event",
  apiVersion: "v4",
  createdAt: "2026-05-15T10:00:00.000Z",
  type: "call.completed" as const,
  data: {
    object: {
      id: "ACcall001",
      object: "call" as const,
      direction: "incoming" as const,
      status: "completed",
      from: "+15552223333",
      to: TEST_QUO_PHONE,
      createdAt: "2026-05-15T09:59:00.000Z",
      completedAt: "2026-05-15T10:00:00.000Z",
      conversationId: "CNconv001",
      phoneNumberId: "PNphone001",
    },
  },
};

const CALL_SUMMARY_COMPLETED_EVENT = {
  id: "EVsumm001",
  object: "event",
  apiVersion: "v4",
  createdAt: "2026-05-15T10:02:00.000Z",
  type: "call.summary.completed" as const,
  data: {
    object: {
      callId: "ACcall001",
      status: "completed",
      summary: ["Discussed pricing", "Follow up next week"],
      nextSteps: ["Send quote"],
    },
  },
};

const CALL_TRANSCRIPT_COMPLETED_EVENT = {
  id: "EVtr001",
  object: "event",
  apiVersion: "v4",
  createdAt: "2026-05-15T10:01:30.000Z",
  type: "call.transcript.completed" as const,
  data: {
    object: {
      callId: "ACcall001",
      status: "completed",
      dialogue: [],
    },
  },
};

const MESSAGE_RECEIVED_EVENT = {
  id: "EVmsg001",
  object: "event",
  apiVersion: "v4",
  createdAt: "2026-05-15T10:05:00.000Z",
  type: "message.received" as const,
  data: {
    object: {
      id: "MSGrcv001",
      object: "message" as const,
      from: "+15552223333",
      to: TEST_QUO_PHONE,
      direction: "incoming" as const,
      text: "Hi, can you call me back?",
      status: "received",
      createdAt: "2026-05-15T10:05:00.000Z",
      phoneNumberId: "PNphone001",
    },
  },
};

const MESSAGE_DELIVERED_EVENT = {
  id: "EVmsg002",
  object: "event",
  apiVersion: "v4",
  createdAt: "2026-05-15T10:06:00.000Z",
  type: "message.delivered" as const,
  data: {
    object: {
      id: "MSGdel001",
      object: "message" as const,
      from: TEST_QUO_PHONE,
      to: "+15552223333",
      direction: "outgoing" as const,
      text: "On my way",
      status: "delivered",
      createdAt: "2026-05-15T10:05:30.000Z",
      phoneNumberId: "PNphone001",
    },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(rawBody: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost:3500/api/webhooks/quo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: rawBody,
  });
}

function signedRequest(payload: unknown, secret: string = TEST_SECRET) {
  const rawBody = JSON.stringify(payload);
  const header = signQuoPayload(rawBody, secret);
  return buildRequest(rawBody, { "openphone-signature": header });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("POST /api/webhooks/quo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertChain._returnRows = [{ id: "EV_default" }];
    process.env.QUO_WEBHOOK_SECRET = TEST_SECRET;
    process.env.QUO_PHONE_NUMBER = TEST_QUO_PHONE;
    mockCheckRateLimit.mockResolvedValue({ success: true, remaining: 99, resetIn: 60000 });
  });

  afterEach(() => {
    delete process.env.QUO_WEBHOOK_SECRET;
    delete process.env.QUO_PHONE_NUMBER;
  });

  // -------------------------------------------------------------------------
  // GET health check
  // -------------------------------------------------------------------------

  describe("GET", () => {
    it("returns ok", async () => {
      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
    });
  });

  // -------------------------------------------------------------------------
  // Signature verification
  // -------------------------------------------------------------------------

  describe("signature verification", () => {
    it("returns 401 when the openphone-signature header is missing", async () => {
      const req = buildRequest(JSON.stringify(CALL_COMPLETED_EVENT));
      const res = await POST(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Invalid signature");

      // No DB write, no enqueue \u2014 we never made it past verification.
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockEnqueueProcessQuoCall).not.toHaveBeenCalled();
    });

    it("returns 401 when the signature was computed with a different secret", async () => {
      const wrongSecret = Buffer.from("wrong-secret").toString("base64");
      const req = signedRequest(CALL_COMPLETED_EVENT, wrongSecret);
      const res = await POST(req);
      expect(res.status).toBe(401);
      expect(mockEnqueueProcessQuoCall).not.toHaveBeenCalled();
    });

    it("returns 401 when the header is malformed", async () => {
      const rawBody = JSON.stringify(CALL_COMPLETED_EVENT);
      const req = buildRequest(rawBody, { "openphone-signature": "not-a-real-signature" });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("returns 500 when QUO_WEBHOOK_SECRET is not configured", async () => {
      delete process.env.QUO_WEBHOOK_SECRET;
      const req = signedRequest(CALL_COMPLETED_EVENT);
      const res = await POST(req);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toMatch(/secret/i);
    });
  });

  // -------------------------------------------------------------------------
  // Empty / malformed bodies
  // -------------------------------------------------------------------------

  describe("body handling", () => {
    it("returns 400 on an empty body", async () => {
      const req = buildRequest("", { "openphone-signature": "hmac;1;0;x" });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 on a body that's not valid JSON", async () => {
      const garbage = "this-is-not-json";
      const header = signQuoPayload(garbage, TEST_SECRET);
      const req = buildRequest(garbage, { "openphone-signature": header });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/json/i);
    });

    it("returns 200 (no-op ack) on an unknown event type", async () => {
      const unknownEvent = {
        ...CALL_COMPLETED_EVENT,
        type: "call.something-future",
      };
      // Insert never runs because Zod parse fails before idempotency.
      const req = signedRequest(unknownEvent);
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockEnqueueProcessQuoCall).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Idempotency
  // -------------------------------------------------------------------------

  describe("idempotency", () => {
    it("dispatches the job on first delivery", async () => {
      insertChain._returnRows = [{ id: CALL_COMPLETED_EVENT.id }];
      const res = await POST(signedRequest(CALL_COMPLETED_EVENT));
      expect(res.status).toBe(200);

      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(insertChain.values).toHaveBeenCalledWith({
        id: CALL_COMPLETED_EVENT.id,
        eventType: "call.completed",
      });
      expect(insertChain.onConflictDoNothing).toHaveBeenCalledTimes(1);
      expect(mockEnqueueProcessQuoCall).toHaveBeenCalledWith({
        callId: CALL_COMPLETED_EVENT.data.object.id,
      });
    });

    it("short-circuits when the event id has already been seen", async () => {
      // ON CONFLICT DO NOTHING + RETURNING returns [] when the row was already there.
      insertChain._returnRows = [];

      const res = await POST(signedRequest(CALL_COMPLETED_EVENT));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.duplicate).toBe(true);

      // No enqueue, no inline handler \u2014 just the idempotency insert attempt.
      expect(mockEnqueueProcessQuoCall).not.toHaveBeenCalled();
      expect(mockHandleQuoMessageReceived).not.toHaveBeenCalled();
      expect(mockHandleQuoMessageDelivered).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Dispatch
  // -------------------------------------------------------------------------

  describe("dispatch", () => {
    beforeEach(() => {
      // Default: idempotency insert succeeds.
      insertChain._returnRows = [{ id: "new" }];
    });

    it("enqueues process-quo-call with bare callId on call.completed", async () => {
      const res = await POST(signedRequest(CALL_COMPLETED_EVENT));
      expect(res.status).toBe(200);
      expect(mockEnqueueProcessQuoCall).toHaveBeenCalledWith({ callId: "ACcall001" });
    });

    it("enqueues with hasSummary:true on call.summary.completed", async () => {
      const res = await POST(signedRequest(CALL_SUMMARY_COMPLETED_EVENT));
      expect(res.status).toBe(200);
      expect(mockEnqueueProcessQuoCall).toHaveBeenCalledWith({
        callId: "ACcall001",
        hasSummary: true,
      });
    });

    it("enqueues with hasTranscript:true on call.transcript.completed", async () => {
      const res = await POST(signedRequest(CALL_TRANSCRIPT_COMPLETED_EVENT));
      expect(res.status).toBe(200);
      expect(mockEnqueueProcessQuoCall).toHaveBeenCalledWith({
        callId: "ACcall001",
        hasTranscript: true,
      });
    });

    it("invokes the inline handler on message.received", async () => {
      const res = await POST(signedRequest(MESSAGE_RECEIVED_EVENT));
      expect(res.status).toBe(200);
      expect(mockHandleQuoMessageReceived).toHaveBeenCalledTimes(1);
      const [event] = mockHandleQuoMessageReceived.mock.calls[0];
      expect((event as { type: string }).type).toBe("message.received");
      // No call-processing enqueued for message events.
      expect(mockEnqueueProcessQuoCall).not.toHaveBeenCalled();
    });

    it("invokes the inline handler on message.delivered", async () => {
      const res = await POST(signedRequest(MESSAGE_DELIVERED_EVENT));
      expect(res.status).toBe(200);
      expect(mockHandleQuoMessageDelivered).toHaveBeenCalledTimes(1);
      expect(mockEnqueueProcessQuoCall).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------------------------

  describe("rate limiting", () => {
    it("returns 429 when the rate limiter rejects", async () => {
      mockCheckRateLimit.mockResolvedValueOnce({ success: false, remaining: 0, resetIn: 5000 });
      const res = await POST(signedRequest(CALL_COMPLETED_EVENT));
      expect(res.status).toBe(429);
      // No signature verification or DB work was attempted.
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Infrastructure failure
  // -------------------------------------------------------------------------

  describe("infrastructure failure", () => {
    it("returns 500 when the idempotency insert throws (Quo will retry)", async () => {
      insertChain.returning.mockImplementationOnce(() =>
        Promise.reject(new Error("connection terminated")),
      );
      const res = await POST(signedRequest(CALL_COMPLETED_EVENT));
      expect(res.status).toBe(500);
    });
  });
});
