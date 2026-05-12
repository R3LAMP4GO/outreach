import { describe, it, expect } from "vitest";
import {
  escapeForPostgresLike,
  sanitizeSearchQuery,
  validatePaginationParams,
  validateOffsetPaginationParams,
  paginationToRange,
} from "../input-validation";

// ============================================================
// escapeForPostgresLike
// ============================================================
describe("escapeForPostgresLike", () => {
  it("returns empty string unchanged", () => {
    expect(escapeForPostgresLike("")).toBe("");
  });

  it("returns plain text unchanged", () => {
    expect(escapeForPostgresLike("hello world")).toBe("hello world");
  });

  it("escapes percent wildcard", () => {
    expect(escapeForPostgresLike("100%")).toBe("100\\%");
  });

  it("escapes underscore wildcard", () => {
    expect(escapeForPostgresLike("user_name")).toBe("user\\_name");
  });

  it("escapes backslash", () => {
    expect(escapeForPostgresLike("path\\to\\file")).toBe("path\\\\to\\\\file");
  });

  it("escapes all special characters together", () => {
    expect(escapeForPostgresLike("%_\\")).toBe("\\%\\_\\\\");
  });

  it("escapes multiple occurrences", () => {
    expect(escapeForPostgresLike("%%__\\\\")).toBe("\\%\\%\\_\\_\\\\\\\\");
  });

  it("handles mixed content with special chars", () => {
    expect(escapeForPostgresLike("50% off_sale")).toBe("50\\% off\\_sale");
  });

  // SQL injection payloads
  it("escapes SQL injection with LIKE wildcards", () => {
    const payload = "%'; DROP TABLE--";
    const escaped = escapeForPostgresLike(payload);
    expect(escaped).toBe("\\%'; DROP TABLE--");
    // The % is escaped with a preceding backslash, making it a literal match
    expect(escaped.startsWith("\\%")).toBe(true);
  });

  it("escapes OR injection payload", () => {
    const payload = "' OR '1'='1";
    const escaped = escapeForPostgresLike(payload);
    // No special LIKE chars to escape, but the string is preserved as-is
    expect(escaped).toBe("' OR '1'='1");
  });

  it("handles complex injection with wildcards", () => {
    const payload = "%' UNION SELECT * FROM users--";
    const escaped = escapeForPostgresLike(payload);
    expect(escaped).toBe("\\%' UNION SELECT * FROM users--");
  });

  it("handles payload with underscore wildcards", () => {
    const payload = "_admin";
    const escaped = escapeForPostgresLike(payload);
    expect(escaped).toBe("\\_admin");
  });
});

// ============================================================
// sanitizeSearchQuery
// ============================================================
describe("sanitizeSearchQuery", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeSearchQuery("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(sanitizeSearchQuery("   ")).toBe("");
    expect(sanitizeSearchQuery("\t\n")).toBe("");
  });

  it("returns empty string for null-like values", () => {
    expect(sanitizeSearchQuery(null as unknown as string)).toBe("");
    expect(sanitizeSearchQuery(undefined as unknown as string)).toBe("");
    expect(sanitizeSearchQuery(123 as unknown as string)).toBe("");
  });

  it("trims whitespace from input", () => {
    expect(sanitizeSearchQuery("  hello  ")).toBe("hello");
  });

  it("escapes LIKE wildcards in search terms", () => {
    expect(sanitizeSearchQuery("100% discount")).toBe("100\\% discount");
  });

  it("truncates to default max length of 200", () => {
    const longInput = "a".repeat(300);
    const result = sanitizeSearchQuery(longInput);
    expect(result.length).toBe(200);
  });

  it("truncates to custom max length", () => {
    const longInput = "a".repeat(100);
    const result = sanitizeSearchQuery(longInput, 50);
    expect(result.length).toBe(50);
  });

  it("does not truncate input within limit", () => {
    const input = "short query";
    expect(sanitizeSearchQuery(input)).toBe("short query");
  });

  it("trims before truncating", () => {
    const input = "   " + "a".repeat(200) + "   ";
    const result = sanitizeSearchQuery(input, 200);
    expect(result.length).toBe(200);
    expect(result).toBe("a".repeat(200));
  });

  // SQL injection payloads
  it("sanitizes DROP TABLE injection", () => {
    const result = sanitizeSearchQuery("%'; DROP TABLE contacts--");
    expect(result).toBe("\\%'; DROP TABLE contacts--");
    // The % is escaped, Supabase parameterizes the rest
  });

  it("sanitizes OR always-true injection", () => {
    const result = sanitizeSearchQuery("' OR '1'='1");
    expect(result).toBe("' OR '1'='1");
    // No LIKE-specific chars to escape; the string is used as a
    // parameterized value by Supabase, preventing SQL injection
  });

  it("sanitizes UNION SELECT injection", () => {
    const result = sanitizeSearchQuery("%' UNION SELECT * FROM users--");
    expect(result).toBe("\\%' UNION SELECT * FROM users--");
  });

  it("sanitizes nested escape attempts", () => {
    const result = sanitizeSearchQuery("\\%\\_");
    expect(result).toBe("\\\\\\%\\\\\\_");
    // All backslashes, percents, and underscores are properly escaped
  });

  it("handles unicode input", () => {
    const result = sanitizeSearchQuery("こんにちは");
    expect(result).toBe("こんにちは");
  });

  it("handles emoji input", () => {
    const result = sanitizeSearchQuery("test 🎉 search");
    expect(result).toBe("test 🎉 search");
  });
});

// ============================================================
// validatePaginationParams
// ============================================================
describe("validatePaginationParams", () => {
  it("parses valid string params", () => {
    const result = validatePaginationParams("3", "25");
    expect(result).toEqual({ page: 3, limit: 25 });
  });

  it("parses valid number params", () => {
    const result = validatePaginationParams(2, 10);
    expect(result).toEqual({ page: 2, limit: 10 });
  });

  it("uses defaults for null values", () => {
    const result = validatePaginationParams(null, null);
    expect(result).toEqual({ page: 1, limit: 20 });
  });

  it("uses defaults for undefined values", () => {
    const result = validatePaginationParams(undefined, undefined);
    expect(result).toEqual({ page: 1, limit: 20 });
  });

  it("uses custom defaults", () => {
    const result = validatePaginationParams(null, null, {
      page: 5,
      limit: 50,
    });
    expect(result).toEqual({ page: 5, limit: 50 });
  });

  it("clamps page to minimum of 1", () => {
    const result = validatePaginationParams("0", "20");
    // Zod .catch(1) falls back to default on validation failure
    expect(result.page).toBe(1);
  });

  it("clamps negative page to default", () => {
    const result = validatePaginationParams("-5", "20");
    expect(result.page).toBe(1);
  });

  it("clamps limit to maximum of 100", () => {
    const result = validatePaginationParams("1", "500");
    // Zod .catch(20) falls back to default on validation failure
    expect(result.limit).toBe(20);
  });

  it("clamps limit to minimum of 1", () => {
    const result = validatePaginationParams("1", "0");
    expect(result.limit).toBe(20);
  });

  it("handles non-numeric string page", () => {
    const result = validatePaginationParams("abc", "20");
    expect(result.page).toBe(1);
  });

  it("handles non-numeric string limit", () => {
    const result = validatePaginationParams("1", "xyz");
    expect(result.limit).toBe(20);
  });

  it("handles float values by truncating to integer", () => {
    const result = validatePaginationParams("2.7", "15.3");
    // z.coerce.number() will parse, then .int() validates
    // 2.7 coerces to 2.7 which is not int, so .catch kicks in
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("accepts boundary value: limit = 100", () => {
    const result = validatePaginationParams("1", "100");
    expect(result.limit).toBe(100);
  });

  it("rejects limit = 101", () => {
    const result = validatePaginationParams("1", "101");
    expect(result.limit).toBe(20);
  });

  it("handles SQL injection in page param", () => {
    const result = validatePaginationParams("1; DROP TABLE--", "20");
    expect(result.page).toBe(1); // falls back to default
  });

  it("handles SQL injection in limit param", () => {
    const result = validatePaginationParams("1", "20; DROP TABLE--");
    expect(result.limit).toBe(20); // falls back to default
  });
});

// ============================================================
// validateOffsetPaginationParams
// ============================================================
describe("validateOffsetPaginationParams", () => {
  it("parses valid string params", () => {
    const result = validateOffsetPaginationParams("10", "25");
    expect(result).toEqual({ offset: 10, limit: 25 });
  });

  it("parses valid number params", () => {
    const result = validateOffsetPaginationParams(0, 50);
    expect(result).toEqual({ offset: 0, limit: 50 });
  });

  it("uses defaults for null values", () => {
    const result = validateOffsetPaginationParams(null, null);
    expect(result).toEqual({ offset: 0, limit: 50 });
  });

  it("uses custom defaults", () => {
    const result = validateOffsetPaginationParams(null, null, {
      offset: 100,
      limit: 25,
    });
    expect(result).toEqual({ offset: 100, limit: 25 });
  });

  it("clamps negative offset to default", () => {
    const result = validateOffsetPaginationParams("-5", "50");
    expect(result.offset).toBe(0);
  });

  it("allows offset of 0", () => {
    const result = validateOffsetPaginationParams("0", "50");
    expect(result.offset).toBe(0);
  });

  it("clamps limit above 100 to default", () => {
    const result = validateOffsetPaginationParams("0", "200");
    expect(result.limit).toBe(50);
  });

  it("handles non-numeric strings", () => {
    const result = validateOffsetPaginationParams("abc", "xyz");
    expect(result).toEqual({ offset: 0, limit: 50 });
  });
});

// ============================================================
// paginationToRange
// ============================================================
describe("paginationToRange", () => {
  it("converts page 1 with limit 20", () => {
    const result = paginationToRange({ page: 1, limit: 20 });
    expect(result).toEqual({ from: 0, to: 19 });
  });

  it("converts page 2 with limit 20", () => {
    const result = paginationToRange({ page: 2, limit: 20 });
    expect(result).toEqual({ from: 20, to: 39 });
  });

  it("converts page 3 with limit 10", () => {
    const result = paginationToRange({ page: 3, limit: 10 });
    expect(result).toEqual({ from: 20, to: 29 });
  });

  it("converts page 1 with limit 100", () => {
    const result = paginationToRange({ page: 1, limit: 100 });
    expect(result).toEqual({ from: 0, to: 99 });
  });

  it("handles large page numbers", () => {
    const result = paginationToRange({ page: 50, limit: 20 });
    expect(result).toEqual({ from: 980, to: 999 });
  });
});
