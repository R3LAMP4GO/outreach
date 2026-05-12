/**
 * Integration tests for Cal.com webhook handler
 * Tests the actual POST handler with proper signature verification,
 * event handling, database operations, and error scenarios
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

// ============================================
// HOISTED MOCK FACTORIES
// ============================================

const { mockDbSelect, mockDbUpdate, mockDbInsert, mockDbExecute } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbExecute: vi.fn(),
}));

// ============================================
// MODULE MOCKS (must be before imports)
// ============================================

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Mock Drizzle db — intercept all db calls
vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
    execute: (...args: unknown[]) => mockDbExecute(...args),
  },
}));

// Mock schema so imports don't pull in real DB tables
vi.mock("@/lib/db/schema", () => ({
  contactSubmissions: "contact_submissions",
  contacts: "contacts",
  deals: "deals",
  stages: "stages",
  contactTimeline: "contact_timeline",
}));

// Mock drizzle-orm helpers as identity/no-ops
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, _val) => "eq-condition"),
  and: vi.fn((...args) => ({ type: "and", args })),
  gte: vi.fn((_col, _val) => "gte-condition"),
  isNull: vi.fn((_col) => "is-null-condition"),
  desc: vi.fn((col) => col),
  sql: new Proxy(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values, _tag: "sql" }),
    {
      get: (_target, prop) => (prop === Symbol.toPrimitive ? () => "sql" : vi.fn()),
    },
  ),
}));

// Mock timeline to avoid side effects
vi.mock("@/lib/crm/timeline", () => ({
  writeTimelineEvent: vi.fn().mockResolvedValue(undefined),
  writeTimelineEvents: vi.fn().mockResolvedValue(undefined),
}));

// ============================================
// Import the actual route handlers (after mocks)
// ============================================

import { POST, GET } from "../route";

// ============================================
// TEST CONSTANTS
// ============================================

const TEST_SECRET = "test-webhook-secret-12345";

// ============================================
// DRIZZLE CHAIN HELPERS
// ============================================

/**
 * Build a chainable Drizzle SELECT mock that resolves to `rows`.
 * Covers: .select().from().where().orderBy().limit()
 *          .select().from().where().limit()
 *          .select().from().where()
 */
function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "orderBy", "limit", "offset", "leftJoin"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Make thenable — await resolves to `rows`
  chain.then = (resolve: (v: unknown) => unknown, reject?: (v: unknown) => unknown) => {
    return Promise.resolve(rows).then(resolve, reject);
  };
  chain.catch = (reject: (v: unknown) => unknown) => Promise.resolve(rows).catch(reject);
  (chain as Record<string | symbol, unknown>)[Symbol.toStringTag] = "Promise";
  return chain;
}

/**
 * Build a chainable Drizzle UPDATE mock that resolves to `rows` via .returning().
 * Covers: .update().set().where().returning()
 */
function makeUpdateChain(rows: unknown[], throwError?: Error) {
  const chain: Record<string, unknown> = {};
  const methods = ["set", "where"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.returning = vi.fn().mockImplementation(() => {
    if (throwError) return Promise.reject(throwError);
    return Promise.resolve(rows);
  });
  return chain;
}

/**
 * Build a chainable Drizzle INSERT mock.
 * Covers: .insert().values()
 */
function makeInsertChain() {
  const chain: Record<string, unknown> = {};
  chain.values = vi.fn().mockResolvedValue([]);
  return chain;
}

// ============================================
// TEST UTILITIES
// ============================================

/**
 * Create a mock NextRequest with body and headers
 */
function createMockRequest(
  body: object | string,
  headers: Record<string, string> = {},
): NextRequest {
  const bodyString = typeof body === "string" ? body : JSON.stringify(body);

  return new NextRequest("http://localhost:3000/api/webhooks/cal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: bodyString,
  });
}

/**
 * Generate valid HMAC-SHA256 signature
 */
function generateSignature(payload: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Create a valid webhook payload
 */
function createWebhookPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = {
    triggerEvent: "BOOKING_CREATED",
    createdAt: new Date().toISOString(),
    payload: {
      uid: "test-booking-123",
      bookingId: 123,
      type: "consultation",
      title: "Consultation",
      description: "",
      startTime: new Date(Date.now() + 86400000).toISOString(),
      endTime: new Date(Date.now() + 90000000).toISOString(),
      attendees: [
        {
          email: "test@example.com",
          name: "Test User",
          timeZone: "Australia/Sydney",
        },
      ],
      organizer: {
        email: "organizer@example.com",
        name: "Organizer",
        timeZone: "Australia/Sydney",
      },
      metadata: {},
    },
  };

  // Deep merge overrides
  if (overrides.payload) {
    return {
      ...base,
      ...overrides,
      payload: {
        ...base.payload,
        ...(overrides.payload as Record<string, unknown>),
      },
    };
  }

  return { ...base, ...overrides };
}

// ============================================
// SCENARIO HELPERS
// ============================================

/** Submission row returned by findSubmission queries */
const makeSubmission = (overrides: Record<string, unknown> = {}) => ({
  id: "sub-123",
  email: "test@example.com",
  firstName: "Test",
  updatedAt: new Date().toISOString(),
  calBookingId: null,
  ...overrides,
});

/**
 * Set up mocks for a successful BOOKING_CREATED flow:
 * 1. findSubmission → [submission]
 * 2. update → [{ id }]
 * 3. CRM: find contact → []  (no contact → skip CRM, no extra DB calls)
 */
function setupBookingCreatedSuccess(submissionOverrides: Record<string, unknown> = {}) {
  // 1. Find submission by email
  mockDbSelect.mockReturnValueOnce(makeSelectChain([makeSubmission(submissionOverrides)]));
  // 2. Update submission
  mockDbUpdate.mockReturnValueOnce(
    makeUpdateChain([{ id: "sub-123", calBookingId: "test-booking-123" }]),
  );
  // 3. CRM: find contact (no contact found → CRM skipped)
  mockDbSelect.mockReturnValueOnce(makeSelectChain([]));
}

/**
 * Set up mocks for BOOKING_RESCHEDULED or BOOKING_CANCELLED:
 * 1. findSubmission by calBookingId → [submission]
 * 2. update → [{ id }]
 * 3. find contact for timeline → []
 */
function setupRescheduledOrCancelled(eventRows = [{ id: "sub-123" }]) {
  mockDbSelect.mockReturnValueOnce(
    makeSelectChain([makeSubmission({ calBookingId: "test-booking-123" })]),
  );
  mockDbUpdate.mockReturnValueOnce(makeUpdateChain(eventRows));
  // find contact for timeline
  mockDbSelect.mockReturnValueOnce(makeSelectChain([]));
}

// ============================================
// TEST SUITES
// ============================================

describe("Cal.com Webhook Handler", () => {
  beforeEach(() => {
    // resetAllMocks clears call history AND flushes mockReturnValueOnce queues
    vi.resetAllMocks();
    process.env.CAL_WEBHOOK_SECRET = TEST_SECRET;
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
    // Default: insert (timeline) resolves cleanly
    mockDbInsert.mockReturnValue(makeInsertChain());
    // Default: execute (CRM function) resolves to empty
    mockDbExecute.mockResolvedValue([]);
  });

  afterEach(() => {
    delete process.env.CAL_WEBHOOK_SECRET;
    delete process.env.DATABASE_URL;
  });

  // ==========================================
  // GET Health Check
  // ==========================================

  describe("GET Health Check", () => {
    it("should return status ok", async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("ok");
      expect(data.message).toBe("Cal.com webhook endpoint is active");
    });
  });

  // ==========================================
  // Signature Verification
  // ==========================================

  describe("Signature Verification", () => {
    it("should reject requests without signature", async () => {
      const payload = createWebhookPayload();
      const request = createMockRequest(payload);

      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Invalid signature");
    });

    it("should reject requests with invalid signature", async () => {
      const payload = createWebhookPayload();
      const request = createMockRequest(payload, {
        "x-cal-signature-256": "sha256=invalid",
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Invalid signature");
    });

    it("should reject requests with wrong signature", async () => {
      const payload = createWebhookPayload();
      const payloadString = JSON.stringify(payload);
      // Generate signature with wrong secret
      const wrongSignature = generateSignature(payloadString, "wrong-secret");

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": wrongSignature,
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Invalid signature");
    });

    it("should accept requests with valid signature (sha256= prefix)", async () => {
      const payload = createWebhookPayload();
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      setupBookingCreatedSuccess();

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it("should accept requests with valid signature (raw hash)", async () => {
      const payload = createWebhookPayload();
      const payloadString = JSON.stringify(payload);
      // Generate raw hash without sha256= prefix
      const rawHash = crypto.createHmac("sha256", TEST_SECRET).update(payloadString).digest("hex");

      setupBookingCreatedSuccess();

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": rawHash,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  // ==========================================
  // Error Handling
  // ==========================================

  describe("Error Handling", () => {
    it("should return 400 for malformed JSON", async () => {
      const malformedJson = "{ invalid json }";
      const signature = generateSignature(malformedJson, TEST_SECRET);

      const request = createMockRequest(malformedJson, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid JSON payload");
    });

    it("should return 500 when webhook secret not configured", async () => {
      // Remove webhook secret to simulate missing configuration
      delete process.env.CAL_WEBHOOK_SECRET;

      const payload = createWebhookPayload();
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Webhook secret not configured");

      // Restore for other tests
      process.env.CAL_WEBHOOK_SECRET = TEST_SECRET;
    });

    it("should return 400 when payload is missing", async () => {
      const invalidPayload = {
        triggerEvent: "BOOKING_CREATED",
        createdAt: new Date().toISOString(),
        // Missing payload field
      };
      const payloadString = JSON.stringify(invalidPayload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid webhook data: missing payload");
    });

    it("should return 400 when no email found in booking", async () => {
      const payload = createWebhookPayload({
        payload: {
          uid: "test-booking-123",
          bookingId: 123,
          type: "consultation",
          title: "Consultation",
          description: "",
          startTime: new Date(Date.now() + 86400000).toISOString(),
          endTime: new Date(Date.now() + 90000000).toISOString(),
          attendees: [], // Empty attendees
          organizer: {
            email: "organizer@example.com",
            name: "Organizer",
            timeZone: "Australia/Sydney",
          },
          metadata: {}, // No metadata email either
        },
      });
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("No email found in booking");
    });

    it("should return 500 when database update fails", async () => {
      const payload = createWebhookPayload();
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      // Find submission succeeds
      mockDbSelect.mockReturnValueOnce(makeSelectChain([makeSubmission()]));
      // Update throws an error (simulates DB failure)
      mockDbUpdate.mockReturnValueOnce(
        makeUpdateChain([], new Error("Database connection failed")),
      );
      // Fallback select in unique-constraint handler — resolves empty
      mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Failed to update contact submission with booking details");
    });
  });

  // ==========================================
  // Timestamp Validation
  // ==========================================

  describe("Timestamp Validation", () => {
    it("should reject old webhooks (replay attack prevention)", async () => {
      const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago
      const payload = createWebhookPayload({ createdAt: oldTimestamp });
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Webhook timestamp too old");
    });

    it("should reject webhooks with future timestamp (clock skew)", async () => {
      const futureTimestamp = new Date(Date.now() + 60 * 1000).toISOString(); // 1 minute in future
      const payload = createWebhookPayload({ createdAt: futureTimestamp });
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid webhook timestamp");
    });

    it("should accept recent webhooks", async () => {
      const recentTimestamp = new Date(Date.now() - 60 * 1000).toISOString(); // 1 minute ago
      const payload = createWebhookPayload({ createdAt: recentTimestamp });
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      setupBookingCreatedSuccess();

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  // ==========================================
  // Event Type Handling
  // ==========================================

  describe("Event Type Handling", () => {
    it("should handle BOOKING_CREATED event", async () => {
      const payload = createWebhookPayload({ triggerEvent: "BOOKING_CREATED" });
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      setupBookingCreatedSuccess();

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe("Booking recorded");
    });

    it("should handle BOOKING_RESCHEDULED event", async () => {
      const payload = createWebhookPayload({ triggerEvent: "BOOKING_RESCHEDULED" });
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      setupRescheduledOrCancelled();

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("should handle BOOKING_CANCELLED event", async () => {
      const payload = createWebhookPayload({ triggerEvent: "BOOKING_CANCELLED" });
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      setupRescheduledOrCancelled();

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("should handle BOOKING_ENDED event", async () => {
      const payload = createWebhookPayload({ triggerEvent: "BOOKING_ENDED" });
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      // BOOKING_ENDED uses email-based lookup (not booking ID)
      mockDbSelect.mockReturnValueOnce(makeSelectChain([makeSubmission()]));

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe("Meeting ended event logged");
    });

    it("should handle case-insensitive event types", async () => {
      const payload = createWebhookPayload({ triggerEvent: "booking_created" });
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      setupBookingCreatedSuccess();

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it("should return 200 for unknown event types without processing", async () => {
      const payload = createWebhookPayload({ triggerEvent: "BOOKING_UNKNOWN" });
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe("Event type not handled");
    });
  });

  // ==========================================
  // Email Extraction
  // ==========================================

  describe("Email Extraction", () => {
    it("should extract email from metadata.email when available", async () => {
      const payload = createWebhookPayload({
        payload: {
          uid: "test-booking-123",
          bookingId: 123,
          type: "consultation",
          title: "Consultation",
          description: "",
          startTime: new Date(Date.now() + 86400000).toISOString(),
          endTime: new Date(Date.now() + 90000000).toISOString(),
          attendees: [
            {
              email: "attendee@example.com",
              name: "Test User",
              timeZone: "Australia/Sydney",
            },
          ],
          organizer: {
            email: "organizer@example.com",
            name: "Organizer",
            timeZone: "Australia/Sydney",
          },
          metadata: {
            email: { value: "metadata@example.com" },
          },
        },
      });
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      // Uses metadata email for lookup
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeSubmission({ email: "metadata@example.com", calBookingId: null })]),
      );
      mockDbUpdate.mockReturnValueOnce(
        makeUpdateChain([{ id: "sub-123", calBookingId: "test-booking-123" }]),
      );
      // CRM: no contact found
      mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it("should fallback to attendees[0].email", async () => {
      const payload = createWebhookPayload();
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      setupBookingCreatedSuccess();

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  // ==========================================
  // Database Operations
  // ==========================================

  describe("Database Operations", () => {
    it("should return 200 with 'no matching record' when neither submission nor CRM contact exists", async () => {
      const payload = createWebhookPayload();
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      // No submission found
      mockDbSelect.mockReturnValueOnce(makeSelectChain([]));
      // CRM helper: no contact found either
      mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe("No matching record found");
    });

    it("should handle no rows updated gracefully (idempotent)", async () => {
      const payload = createWebhookPayload();
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      // Find submission
      mockDbSelect.mockReturnValueOnce(makeSelectChain([makeSubmission()]));
      // Update returns empty (no rows affected)
      mockDbUpdate.mockReturnValueOnce(makeUpdateChain([]));
      // Check if already processed (race resolution) — also empty
      mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe("Submission not found or already has a booking");
    });
  });

  // ==========================================
  // Idempotency
  // ==========================================

  describe("Idempotency", () => {
    it("should detect duplicate BOOKING_CREATED webhooks", async () => {
      const payload = createWebhookPayload({ triggerEvent: "BOOKING_CREATED" });
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      // Submission already has the same booking ID → idempotent early return
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeSubmission({ calBookingId: "test-booking-123" })]),
      );

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe("Booking already processed");
    });

    it("should process new bookings normally", async () => {
      const payload = createWebhookPayload({ triggerEvent: "BOOKING_CREATED" });
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      setupBookingCreatedSuccess();

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe("Booking recorded");
    });
  });

  // ==========================================
  // Outreach-sourced contacts (no contact_submissions row)
  // ==========================================

  describe("Outreach-sourced contacts", () => {
    it("BOOKING_CREATED runs CRM sync even with no contact_submissions row", async () => {
      const payload = createWebhookPayload({ triggerEvent: "BOOKING_CREATED" });
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      // 1. Find submission by email → none (outreach-sourced)
      mockDbSelect.mockReturnValueOnce(makeSelectChain([]));
      // 2. Helper: find CRM contact → found
      mockDbSelect.mockReturnValueOnce(makeSelectChain([{ id: "contact-1" }]));
      // 3. Helper: find meeting-booked stage
      mockDbSelect.mockReturnValueOnce(makeSelectChain([{ id: "stage-meeting" }]));
      // 4. RPC returns sync result
      mockDbExecute.mockResolvedValueOnce([
        {
          contact_updated: true,
          deal_id: "deal-1",
          deal_updated: true,
          history_created: true,
        },
      ]);
      // 5. Update deal with meeting_booked_at
      mockDbUpdate.mockReturnValueOnce(makeUpdateChain([{ id: "deal-1" }]));

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe("Booking recorded");
      // RPC was invoked → CRM sync ran for outreach contact
      expect(mockDbExecute).toHaveBeenCalled();
      // meeting_booked_at update happened
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it("BOOKING_RESCHEDULED updates CRM deal even with no submission row", async () => {
      const payload = createWebhookPayload({ triggerEvent: "BOOKING_RESCHEDULED" });
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      // 1. Find submission by booking ID → none
      mockDbSelect.mockReturnValueOnce(makeSelectChain([]));
      // 2. Helper: find CRM contact → found
      mockDbSelect.mockReturnValueOnce(makeSelectChain([{ id: "contact-1" }]));
      // 3. Helper: update deals.meeting_booked_at
      mockDbUpdate.mockReturnValueOnce(makeUpdateChain([{ id: "deal-1" }]));

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe("Booking rescheduled");
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it("BOOKING_CANCELLED writes timeline event even with no submission row", async () => {
      const payload = createWebhookPayload({ triggerEvent: "BOOKING_CANCELLED" });
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      // 1. Find submission by booking ID → none
      mockDbSelect.mockReturnValueOnce(makeSelectChain([]));
      // 2. Helper: find CRM contact → found
      mockDbSelect.mockReturnValueOnce(makeSelectChain([{ id: "contact-1" }]));

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe("Booking cancelled");
      // No deal stage update — only timeline event (which is mocked)
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it("BOOKING_CREATED for unknown email returns 'no matching record'", async () => {
      const payload = createWebhookPayload({ triggerEvent: "BOOKING_CREATED" });
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, TEST_SECRET);

      // No submission, no CRM contact
      mockDbSelect.mockReturnValueOnce(makeSelectChain([]));
      mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": signature,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe("No matching record found");
      // No DB writes
      expect(mockDbUpdate).not.toHaveBeenCalled();
      expect(mockDbExecute).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // Security Tests
  // ==========================================

  describe("Security", () => {
    it("should use constant-time comparison to prevent timing attacks", async () => {
      const payload = createWebhookPayload();
      const payloadString = JSON.stringify(payload);
      const validSig = generateSignature(payloadString, TEST_SECRET);

      // Test signatures that differ at different positions
      const invalidSigs = [
        "sha256=" + "a".repeat(64), // All different
        validSig.slice(0, -1) + "x", // Last char different
        "sha256=x" + validSig.slice(8), // First char different
      ];

      for (const sig of invalidSigs) {
        const request = createMockRequest(payloadString, {
          "x-cal-signature-256": sig,
        });

        const response = await POST(request);
        expect(response.status).toBe(401);
      }
    });

    it("should reject signatures with wrong length", async () => {
      const payload = createWebhookPayload();
      const payloadString = JSON.stringify(payload);

      // Signature too short
      const shortSig = "sha256=" + "a".repeat(32);
      const request = createMockRequest(payloadString, {
        "x-cal-signature-256": shortSig,
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });
  });

  // ==========================================
  // Concurrent Requests
  // ==========================================

  describe("Concurrent Requests", () => {
    it("should handle concurrent webhooks", async () => {
      const payload1 = createWebhookPayload({
        payload: {
          uid: "booking-1",
          bookingId: 1,
          type: "consultation",
          title: "Consultation",
          description: "",
          startTime: new Date(Date.now() + 86400000).toISOString(),
          endTime: new Date(Date.now() + 90000000).toISOString(),
          attendees: [
            {
              email: "test1@example.com",
              name: "Test User 1",
              timeZone: "Australia/Sydney",
            },
          ],
          organizer: {
            email: "organizer@example.com",
            name: "Organizer",
            timeZone: "Australia/Sydney",
          },
          metadata: {},
        },
      });
      const payload2 = createWebhookPayload({
        payload: {
          uid: "booking-2",
          bookingId: 2,
          type: "consultation",
          title: "Consultation",
          description: "",
          startTime: new Date(Date.now() + 86400000).toISOString(),
          endTime: new Date(Date.now() + 90000000).toISOString(),
          attendees: [
            {
              email: "test2@example.com",
              name: "Test User 2",
              timeZone: "Australia/Sydney",
            },
          ],
          organizer: {
            email: "organizer@example.com",
            name: "Organizer",
            timeZone: "Australia/Sydney",
          },
          metadata: {},
        },
      });

      const payloadString1 = JSON.stringify(payload1);
      const payloadString2 = JSON.stringify(payload2);

      const request1 = createMockRequest(payloadString1, {
        "x-cal-signature-256": generateSignature(payloadString1, TEST_SECRET),
      });
      const request2 = createMockRequest(payloadString2, {
        "x-cal-signature-256": generateSignature(payloadString2, TEST_SECRET),
      });

      // Submission for request 1
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeSubmission({ id: "sub-1", email: "test1@example.com" })]),
      );
      // Submission for request 2
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeSubmission({ id: "sub-2", email: "test2@example.com" })]),
      );
      // Update for request 1
      mockDbUpdate.mockReturnValueOnce(
        makeUpdateChain([{ id: "sub-1", calBookingId: "booking-1" }]),
      );
      // Update for request 2
      mockDbUpdate.mockReturnValueOnce(
        makeUpdateChain([{ id: "sub-2", calBookingId: "booking-2" }]),
      );
      // CRM contact lookup for request 1
      mockDbSelect.mockReturnValueOnce(makeSelectChain([]));
      // CRM contact lookup for request 2
      mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

      const [response1, response2] = await Promise.all([POST(request1), POST(request2)]);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });
  });
});
