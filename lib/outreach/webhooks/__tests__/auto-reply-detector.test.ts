/**
 * Tests for auto-reply detection from email headers and subject lines
 */

import { describe, it, expect } from "vitest";
import { isAutoReply } from "../auto-reply-detector";

// ============================================================
// Header Detection
// ============================================================

describe("isAutoReply - Header Detection", () => {
  describe("Auto-Submitted header", () => {
    it("should detect auto-replied", () => {
      expect(isAutoReply({ "Auto-Submitted": "auto-replied" }, "Hello")).toBe(true);
    });

    it("should detect auto-generated", () => {
      expect(isAutoReply({ "Auto-Submitted": "auto-generated" }, "Hello")).toBe(true);
    });

    it("should be case-insensitive for header values", () => {
      expect(isAutoReply({ "Auto-Submitted": "AUTO-REPLIED" }, "Hello")).toBe(true);
    });
  });

  describe("X-Auto-Response-Suppress header", () => {
    it("should detect All", () => {
      expect(isAutoReply({ "X-Auto-Response-Suppress": "All" }, "Hello")).toBe(true);
    });

    it("should detect OOF", () => {
      expect(isAutoReply({ "X-Auto-Response-Suppress": "OOF" }, "Hello")).toBe(true);
    });

    it("should detect AutoReply", () => {
      expect(isAutoReply({ "X-Auto-Response-Suppress": "AutoReply" }, "Hello")).toBe(true);
    });
  });

  describe("X-Autoreply header", () => {
    it("should detect yes", () => {
      expect(isAutoReply({ "X-Autoreply": "yes" }, "Hello")).toBe(true);
    });
  });

  describe("X-Autorespond header", () => {
    it("should detect yes", () => {
      expect(isAutoReply({ "X-Autorespond": "yes" }, "Hello")).toBe(true);
    });
  });

  describe("Precedence header", () => {
    it("should detect auto_reply", () => {
      expect(isAutoReply({ Precedence: "auto_reply" }, "Hello")).toBe(true);
    });

    it("should detect bulk", () => {
      expect(isAutoReply({ Precedence: "bulk" }, "Hello")).toBe(true);
    });
  });

  describe("X-Out-Of-Office header", () => {
    it("should detect yes", () => {
      expect(isAutoReply({ "X-Out-Of-Office": "yes" }, "Hello")).toBe(true);
    });
  });
});

// ============================================================
// Subject Pattern Detection
// ============================================================

describe("isAutoReply - Subject Detection", () => {
  const noHeaders = {};

  it("should detect 'Out of Office' subject", () => {
    expect(isAutoReply(noHeaders, "Out of Office")).toBe(true);
  });

  it("should detect 'out-of-office' subject", () => {
    expect(isAutoReply(noHeaders, "out-of-office reply")).toBe(true);
  });

  it("should detect 'away from the office' subject", () => {
    expect(isAutoReply(noHeaders, "away from the office")).toBe(true);
  });

  it("should detect 'Auto Reply' subject", () => {
    expect(isAutoReply(noHeaders, "Auto Reply: Your message")).toBe(true);
  });

  it("should detect 'Automatic Reply' subject", () => {
    expect(isAutoReply(noHeaders, "Automatic Reply")).toBe(true);
  });

  it("should detect 'Away message' subject", () => {
    expect(isAutoReply(noHeaders, "Away message")).toBe(true);
  });

  it("should detect 'Vacation' subject", () => {
    expect(isAutoReply(noHeaders, "Vacation: I'll be back Monday")).toBe(true);
  });

  it("should detect 'Delivery Status Notification' subject", () => {
    expect(isAutoReply(noHeaders, "Delivery Status Notification (Failure)")).toBe(true);
  });

  it("should detect 'Delivery Notification' subject", () => {
    expect(isAutoReply(noHeaders, "Delivery Notification")).toBe(true);
  });

  it("should detect 'currently out' subject", () => {
    expect(isAutoReply(noHeaders, "currently out of the office")).toBe(true);
  });

  it("should detect 'currently away' subject", () => {
    expect(isAutoReply(noHeaders, "currently away")).toBe(true);
  });

  it("should detect 'currently unavailable' subject", () => {
    expect(isAutoReply(noHeaders, "currently unavailable")).toBe(true);
  });

  it("should detect 'Re: Out of Office' subject", () => {
    expect(isAutoReply(noHeaders, "Re: Out of Office")).toBe(true);
  });

  it("should detect 'Re: vacation' subject", () => {
    expect(isAutoReply(noHeaders, "Re: vacation notice")).toBe(true);
  });

  it("should be case-insensitive for subject patterns", () => {
    expect(isAutoReply(noHeaders, "OUT OF OFFICE")).toBe(true);
    expect(isAutoReply(noHeaders, "VACATION REPLY")).toBe(true);
  });
});

// ============================================================
// Non-Auto-Reply (Normal Emails)
// ============================================================

describe("isAutoReply - Normal Emails", () => {
  it("should return false for normal headers and subject", () => {
    expect(
      isAutoReply(
        { "Content-Type": "text/plain", From: "user@example.com" },
        "Meeting tomorrow at 3pm",
      ),
    ).toBe(false);
  });

  it("should return false for empty headers and normal subject", () => {
    expect(isAutoReply({}, "Project update")).toBe(false);
  });

  it("should return false for empty headers and empty subject", () => {
    expect(isAutoReply({}, "")).toBe(false);
  });

  it("should not match unrelated subjects", () => {
    expect(isAutoReply({}, "Quarterly report review")).toBe(false);
  });

  it("should not match 'auto' in unrelated context", () => {
    expect(isAutoReply({}, "Auto insurance quote")).toBe(false);
  });
});
