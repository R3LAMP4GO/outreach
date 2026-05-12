import { describe, it, expect } from "vitest";
import { getThreadingHeaders, shouldThreadEmail } from "../threading";
import type { Contact } from "../../types";

/** Minimal contact factory */
function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "c-1",
    email: "john@example.com",
    first_name: "John",
    last_name: "Doe",
    company: "Acme",
    job_title: null,
    seniority: null,
    phone: null,
    location: null,
    website_url: null,
    linkedin_url: null,
    industry: null,
    company_size: null,
    company_revenue: null,
    founded_year: null,
    email_provider: null,
    email_security_gateway: null,
    security_tier: null,
    security_level: null,
    opt_out: false,
    research_report: null,
    email_1_subject: "Quick question",
    email_1_body: "<p>Hi John</p>",
    email_1_message_id: "msg-abc-123",
    email_1_resend_id: null,
    email_1_sent_at: "2025-03-17T10:00:00Z",
    email_2_subject: null,
    email_2_body: "<p>Following up</p>",
    email_2_resend_id: null,
    email_2_sent_at: null,
    email_3_subject: "One more thought",
    email_3_body: "<p>Final email</p>",
    email_3_resend_id: null,
    email_3_sent_at: null,
    campaign_id: "camp-1",
    sender_account_id: null,
    timezone: "Australia/Perth",
    status: "lead",
    current_step: 1,
    next_send_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    added_to_campaign_at: null,
    auto_reply_detected: false,
    auto_reply_detected_at: null,
    bounce_count: 0,
    bounced_at: null,
    last_bounce_type: null,
    replied_at: null,
    unsubscribed_at: null,
    custom_fields: {},
    ...overrides,
  } as Contact;
}

describe("getThreadingHeaders", () => {
  it("returns In-Reply-To and References for email 2 with message ID", () => {
    const contact = makeContact({ email_1_message_id: "msg-abc-123" });
    const headers = getThreadingHeaders(contact, 2);
    expect(headers["In-Reply-To"]).toBe("<msg-abc-123>");
    expect(headers.References).toBe("<msg-abc-123>");
  });

  it("returns empty object for email 1", () => {
    const contact = makeContact({ email_1_message_id: "msg-abc-123" });
    const headers = getThreadingHeaders(contact, 1);
    expect(headers).toEqual({});
  });

  it("returns empty object for email 3", () => {
    const contact = makeContact({ email_1_message_id: "msg-abc-123" });
    const headers = getThreadingHeaders(contact, 3);
    expect(headers).toEqual({});
  });

  it("returns empty object for email 2 without message ID", () => {
    const contact = makeContact({ email_1_message_id: null });
    const headers = getThreadingHeaders(contact, 2);
    expect(headers).toEqual({});
  });

  it("wraps message ID in angle brackets", () => {
    const contact = makeContact({ email_1_message_id: "unique-id-456" });
    const headers = getThreadingHeaders(contact, 2);
    expect(headers["In-Reply-To"]).toBe("<unique-id-456>");
  });
});

describe("shouldThreadEmail", () => {
  it("returns true only for email 2", () => {
    expect(shouldThreadEmail(1)).toBe(false);
    expect(shouldThreadEmail(2)).toBe(true);
    expect(shouldThreadEmail(3)).toBe(false);
  });
});
