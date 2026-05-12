/**
 * Tests for utility functions: cn, formatDateTime, formatCurrency
 */

import { describe, it, expect } from "vitest";
import { cn, formatDateTime, formatCurrency } from "../utils";

// ============================================================
// cn() - Tailwind Class Merging
// ============================================================

describe("cn", () => {
  it("should merge multiple class strings", () => {
    const result = cn("px-4", "py-2");
    expect(result).toBe("px-4 py-2");
  });

  it("should resolve conflicting Tailwind classes (last wins)", () => {
    const result = cn("px-4", "px-8");
    expect(result).toBe("px-8");
  });

  it("should handle conditional classes", () => {
    const result = cn("base", false && "hidden", "visible");
    expect(result).toBe("base visible");
  });

  it("should handle undefined and null inputs", () => {
    const result = cn("base", undefined, null, "end");
    expect(result).toBe("base end");
  });

  it("should return empty string with no inputs", () => {
    expect(cn()).toBe("");
  });

  it("should merge complex Tailwind conflicts", () => {
    const result = cn("text-red-500", "text-blue-500");
    expect(result).toBe("text-blue-500");
  });
});

// ============================================================
// formatDateTime() - Date Formatting
// ============================================================

describe("formatDateTime", () => {
  it("should return em dash for null input", () => {
    expect(formatDateTime(null)).toBe("—");
  });

  it("should return em dash for undefined input", () => {
    expect(formatDateTime(undefined)).toBe("—");
  });

  it("should return em dash for empty string", () => {
    expect(formatDateTime("")).toBe("—");
  });

  it("should return em dash for invalid date string", () => {
    expect(formatDateTime("not-a-date")).toBe("—");
  });

  it("should format a valid ISO date string", () => {
    const result = formatDateTime("2024-02-18T15:45:00Z");
    expect(result).toBeTypeOf("string");
    // Should contain month abbreviation and day number
    expect(result).toMatch(/\w{3}\s+\d+/);
    // Should contain time portion
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it("should format a date-only string", () => {
    const result = formatDateTime("2024-01-01");
    expect(result).toBeTypeOf("string");
    expect(result).not.toBe("—");
  });
});

// ============================================================
// formatCurrency() - Compact Currency Formatting
// ============================================================

describe("formatCurrency", () => {
  describe("Millions (>= 1,000,000)", () => {
    it("should format 1,000,000 as $1.0M", () => {
      expect(formatCurrency(1000000)).toBe("$1.0M");
    });

    it("should format 1,500,000 as $1.5M", () => {
      expect(formatCurrency(1500000)).toBe("$1.5M");
    });

    it("should format 2,350,000 as $2.4M (rounded)", () => {
      expect(formatCurrency(2350000)).toBe("$2.4M");
    });
  });

  describe("Thousands (>= 1,000)", () => {
    it("should format 1,000 as $1K", () => {
      expect(formatCurrency(1000)).toBe("$1K");
    });

    it("should format 5,500 as $6K (rounded)", () => {
      expect(formatCurrency(5500)).toBe("$6K");
    });

    it("should format 999,999 as $1000K", () => {
      expect(formatCurrency(999999)).toBe("$1000K");
    });
  });

  describe("Below 1,000", () => {
    it("should format 0 as $0", () => {
      expect(formatCurrency(0)).toBe("$0");
    });

    it("should format 500 as $500", () => {
      expect(formatCurrency(500)).toBe("$500");
    });

    it("should format 999 as $999", () => {
      expect(formatCurrency(999)).toBe("$999");
    });

    it("should format 99.99 as $100 (rounded)", () => {
      expect(formatCurrency(99.99)).toBe("$100");
    });
  });
});
