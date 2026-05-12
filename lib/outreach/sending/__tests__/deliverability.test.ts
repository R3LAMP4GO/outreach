import { describe, it, expect, beforeEach } from "vitest";
import {
  getDeliverabilityStrategy,
  shouldThrottleDomain,
  recordDomainSend,
  clearDomainTracking,
} from "../deliverability";
import type { Contact, Campaign } from "../../types";

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
    email_1_subject: "Hello",
    email_1_body: "<p>Hi</p>",
    email_1_message_id: null,
    email_1_resend_id: null,
    email_1_sent_at: null,
    email_2_subject: null,
    email_2_body: "<p>Follow up</p>",
    email_2_resend_id: null,
    email_2_sent_at: null,
    email_3_subject: "Last try",
    email_3_body: "<p>Final</p>",
    email_3_resend_id: null,
    email_3_sent_at: null,
    campaign_id: "camp-1",
    sender_account_id: null,
    timezone: "Australia/Perth",
    status: "lead",
    current_step: 0,
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

const mockCampaign = {} as Campaign;

describe("getDeliverabilityStrategy", () => {
  describe("enterprise gateway detection", () => {
    const gateways = [
      "proofpoint",
      "mimecast",
      "barracuda",
      "ironport",
      "cisco ironport",
      "fortimail",
      "fortinet",
      "messagelabs",
      "symantec",
      "broadcom",
      "sophos",
      "trendmicro",
      "trend micro",
    ];

    for (const gw of gateways) {
      it(`detects ${gw} as enterprise gateway`, () => {
        const contact = makeContact({ email_security_gateway: gw });
        const strategy = getDeliverabilityStrategy(contact, mockCampaign, 1);
        expect(strategy.extraDelayMs).toBe(120000);
      });
    }

    it("returns zero delay for contacts without enterprise gateway", () => {
      const contact = makeContact({ email_security_gateway: null });
      const strategy = getDeliverabilityStrategy(contact, mockCampaign, 1);
      expect(strategy.extraDelayMs).toBe(0);
    });

    it("returns zero delay for unknown gateway", () => {
      const contact = makeContact({ email_security_gateway: "unknown-gateway" });
      const strategy = getDeliverabilityStrategy(contact, mockCampaign, 1);
      expect(strategy.extraDelayMs).toBe(0);
    });
  });

  describe("text-only forcing", () => {
    it("forces text-only for enterprise gateway on email 1", () => {
      const contact = makeContact({ email_security_gateway: "proofpoint" });
      const strategy = getDeliverabilityStrategy(contact, mockCampaign, 1);
      expect(strategy.forceTextOnly).toBe(true);
    });

    it("does not force text-only for enterprise gateway on email 2", () => {
      const contact = makeContact({ email_security_gateway: "proofpoint" });
      const strategy = getDeliverabilityStrategy(contact, mockCampaign, 2);
      expect(strategy.forceTextOnly).toBe(false);
    });

    it("forces text-only for high security tier on email 1", () => {
      const contact = makeContact({ security_tier: "enterprise" });
      const strategy = getDeliverabilityStrategy(contact, mockCampaign, 1);
      expect(strategy.forceTextOnly).toBe(true);
    });

    it("forces text-only for 'high' security tier on email 1", () => {
      const contact = makeContact({ security_tier: "high" });
      const strategy = getDeliverabilityStrategy(contact, mockCampaign, 1);
      expect(strategy.forceTextOnly).toBe(true);
    });

    it("does not force text-only for low security tier", () => {
      const contact = makeContact({ security_tier: "low" });
      const strategy = getDeliverabilityStrategy(contact, mockCampaign, 1);
      expect(strategy.forceTextOnly).toBe(false);
    });
  });

  describe("domain throttle key", () => {
    it("extracts domain from email", () => {
      const contact = makeContact({ email: "user@bigcorp.com" });
      const strategy = getDeliverabilityStrategy(contact, mockCampaign, 1);
      expect(strategy.domainThrottleKey).toBe("bigcorp.com");
    });

    it("lowercases domain", () => {
      const contact = makeContact({ email: "User@BigCorp.COM" });
      const strategy = getDeliverabilityStrategy(contact, mockCampaign, 1);
      expect(strategy.domainThrottleKey).toBe("bigcorp.com");
    });
  });
});

describe("domain rate limiting", () => {
  beforeEach(() => {
    clearDomainTracking();
  });

  it("does not throttle a domain with no sends", () => {
    expect(shouldThrottleDomain("example.com")).toBe(false);
  });

  it("does not throttle a domain under the limit", () => {
    recordDomainSend("example.com");
    recordDomainSend("example.com");
    // Default limit is 3, so 2 sends should not throttle
    expect(shouldThrottleDomain("example.com")).toBe(false);
  });

  it("throttles a domain at the limit", () => {
    recordDomainSend("example.com");
    recordDomainSend("example.com");
    recordDomainSend("example.com");
    // 3 sends = at limit of 3
    expect(shouldThrottleDomain("example.com")).toBe(true);
  });

  it("respects custom maxPerHour", () => {
    recordDomainSend("example.com");
    expect(shouldThrottleDomain("example.com", 1)).toBe(true);
    expect(shouldThrottleDomain("example.com", 5)).toBe(false);
  });

  it("tracks domains independently", () => {
    recordDomainSend("a.com");
    recordDomainSend("a.com");
    recordDomainSend("a.com");
    expect(shouldThrottleDomain("a.com")).toBe(true);
    expect(shouldThrottleDomain("b.com")).toBe(false);
  });

  it("clearDomainTracking resets all tracking", () => {
    recordDomainSend("example.com");
    recordDomainSend("example.com");
    recordDomainSend("example.com");
    clearDomainTracking();
    expect(shouldThrottleDomain("example.com")).toBe(false);
  });
});
