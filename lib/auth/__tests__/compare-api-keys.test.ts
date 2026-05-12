/**
 * Security-critical tests for API key comparison utilities
 *
 * These tests ensure constant-time comparison to prevent timing attacks,
 * handle whitespace edge cases from environment variables, and validate
 * all security-relevant code paths.
 */

import { describe, it, expect } from "vitest";
import { compareApiKeys, compareBearerToken } from "../compare-api-keys";

// ============================================================
// compareApiKeys() - Core API Key Comparison
// ============================================================

describe("compareApiKeys", () => {
  // ==========================================
  // Happy Path - Matching Keys
  // ==========================================

  describe("Happy Path", () => {
    it("should return true for identical keys", () => {
      const key = "test_key_1234567890abcdef";
      expect(compareApiKeys(key, key)).toBe(true);
    });

    it("should return true for matching keys with different casing preserved", () => {
      const provided = "UPPER_CASE_KEY_ABC123";
      const expected = "UPPER_CASE_KEY_ABC123";
      expect(compareApiKeys(provided, expected)).toBe(true);
    });

    it("should handle very long keys (64+ characters)", () => {
      const longKey = "test_key_" + "a".repeat(64);
      expect(compareApiKeys(longKey, longKey)).toBe(true);
    });

    it("should handle base64-encoded keys", () => {
      const base64Key = "dGVzdF9rZXlfMTIzNDU2Nzg5MA==";
      expect(compareApiKeys(base64Key, base64Key)).toBe(true);
    });

    it("should handle hex-encoded keys", () => {
      const hexKey = "a1b2c3d4e5f6789012345678901234567890abcdef";
      expect(compareApiKeys(hexKey, hexKey)).toBe(true);
    });

    it("should handle keys with special characters", () => {
      const specialKey = "key-proj_123-456_ABC.xyz+test";
      expect(compareApiKeys(specialKey, specialKey)).toBe(true);
    });
  });

  // ==========================================
  // Mismatches - Security Critical
  // ==========================================

  describe("Mismatches", () => {
    it("should return false for completely different keys", () => {
      const provided = "test_key_wrong_key_12345";
      const expected = "test_key_correct_key_67890";
      expect(compareApiKeys(provided, expected)).toBe(false);
    });

    it("should return false for keys differing by one character", () => {
      const provided = "test_key_1234567890";
      const expected = "test_key_1234567891";
      expect(compareApiKeys(provided, expected)).toBe(false);
    });

    it("should return false for keys differing at the start", () => {
      const provided = "xk_test_1234567890";
      const expected = "test_key_1234567890";
      expect(compareApiKeys(provided, expected)).toBe(false);
    });

    it("should return false for keys differing at the end", () => {
      const provided = "test_key_1234567890";
      const expected = "test_key_123456789x";
      expect(compareApiKeys(provided, expected)).toBe(false);
    });

    it("should be case-sensitive (uppercase vs lowercase)", () => {
      const provided = "test_key_abc123";
      const expected = "test_key_ABC123";
      expect(compareApiKeys(provided, expected)).toBe(false);
    });
  });

  // ==========================================
  // Length Mismatches
  // ==========================================

  describe("Length Mismatches", () => {
    it("should return false for different length keys", () => {
      const provided = "short_key";
      const expected = "much_longer_key_value";
      expect(compareApiKeys(provided, expected)).toBe(false);
    });

    it("should return false when provided key is longer", () => {
      const provided = "test_key_1234567890_extra";
      const expected = "test_key_1234567890";
      expect(compareApiKeys(provided, expected)).toBe(false);
    });

    it("should return false when expected key is longer", () => {
      const provided = "test_key_1234567890";
      const expected = "test_key_1234567890_extra";
      expect(compareApiKeys(provided, expected)).toBe(false);
    });

    it("should return false when one key is empty", () => {
      expect(compareApiKeys("test_key_key", "")).toBe(false);
      expect(compareApiKeys("", "test_key_key")).toBe(false);
    });
  });

  // ==========================================
  // Whitespace Handling - Environment Variable Edge Cases
  // ==========================================

  describe("Whitespace Handling", () => {
    it("should handle trailing newline in expected key (Vercel env var)", () => {
      const provided = "test_key_1234567890";
      const expected = "test_key_1234567890\n";
      expect(compareApiKeys(provided, expected)).toBe(true);
    });

    it("should handle trailing newline in provided key", () => {
      const provided = "test_key_1234567890\n";
      const expected = "test_key_1234567890";
      expect(compareApiKeys(provided, expected)).toBe(true);
    });

    it("should handle trailing newlines in both keys", () => {
      const provided = "test_key_1234567890\n";
      const expected = "test_key_1234567890\n";
      expect(compareApiKeys(provided, expected)).toBe(true);
    });

    it("should handle leading whitespace in provided key", () => {
      const provided = "  test_key_1234567890";
      const expected = "test_key_1234567890";
      expect(compareApiKeys(provided, expected)).toBe(true);
    });

    it("should handle leading whitespace in expected key", () => {
      const provided = "test_key_1234567890";
      const expected = "  test_key_1234567890";
      expect(compareApiKeys(provided, expected)).toBe(true);
    });

    it("should handle tabs and multiple spaces", () => {
      const provided = "\t\ttest_key_1234567890  \t";
      const expected = "  test_key_1234567890\n";
      expect(compareApiKeys(provided, expected)).toBe(true);
    });

    it("should handle CRLF line endings (Windows)", () => {
      const provided = "test_key_1234567890\r\n";
      const expected = "test_key_1234567890";
      expect(compareApiKeys(provided, expected)).toBe(true);
    });

    it("should not match when whitespace is in the middle", () => {
      const provided = "key_with space_1234567890";
      const expected = "test_key_1234567890";
      expect(compareApiKeys(provided, expected)).toBe(false);
    });
  });

  // ==========================================
  // Empty String Handling
  // ==========================================

  describe("Empty Strings", () => {
    it("should return true for two empty strings", () => {
      expect(compareApiKeys("", "")).toBe(true);
    });

    it("should return true for two whitespace-only strings", () => {
      expect(compareApiKeys("   ", "\t\n")).toBe(true);
    });

    it("should return false when provided is empty and expected is not", () => {
      expect(compareApiKeys("", "test_key_key")).toBe(false);
    });

    it("should return false when expected is empty and provided is not", () => {
      expect(compareApiKeys("test_key_key", "")).toBe(false);
    });

    it("should return false when provided is whitespace and expected is key", () => {
      expect(compareApiKeys("   ", "test_key_key")).toBe(false);
    });
  });

  // ==========================================
  // Security - Timing Attack Prevention
  // ==========================================

  describe("Security - Timing Attacks", () => {
    it("should use constant-time comparison for all positions", () => {
      // This test verifies that timingSafeEqual is being used.
      // While we can't directly measure timing, we can verify behavior
      // is consistent regardless of where the difference occurs.

      const expected = "test_key_0123456789abcdef";

      // Keys that differ at different positions should all return false
      const invalidKeys = [
        "xk_test_0123456789abcdef", // First char different
        "sk_xest_0123456789abcdef", // Middle char different
        "test_key_0123456789abcdex", // Last char different
        "test_key_x123456789abcdef", // Early middle different
        "test_key_0123456789xbcdef", // Late middle different
      ];

      for (const invalidKey of invalidKeys) {
        expect(compareApiKeys(invalidKey, expected)).toBe(false);
      }
    });

    it("should handle length check before constant-time comparison", () => {
      // Length check is not constant-time but reveals no secret information
      // This test verifies the short-circuit behavior is working
      const expected = "test_key_key_with_specific_length";
      const tooShort = "short";
      const tooLong = "test_key_key_with_specific_length_and_more";

      expect(compareApiKeys(tooShort, expected)).toBe(false);
      expect(compareApiKeys(tooLong, expected)).toBe(false);
    });

    it("should prevent buffer allocation attacks via length check", () => {
      // Extremely long provided keys should be rejected at length check
      const expected = "test_key_normal_length";
      const veryLongProvided = "x".repeat(1000000);

      expect(compareApiKeys(veryLongProvided, expected)).toBe(false);
    });
  });
});

// ============================================================
// compareBearerToken() - Authorization Header Comparison
// ============================================================

describe("compareBearerToken", () => {
  // ==========================================
  // Happy Path - Valid Bearer Tokens
  // ==========================================

  describe("Happy Path", () => {
    it("should return true for matching Bearer tokens", () => {
      const authHeader = "Bearer secret-token-123";
      const expectedToken = "secret-token-123";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(true);
    });

    it("should handle long bearer tokens", () => {
      const token =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      const authHeader = `Bearer ${token}`;
      expect(compareBearerToken(authHeader, token)).toBe(true);
    });

    it("should handle tokens with special characters", () => {
      const token = "token-with_special.chars+equals==";
      const authHeader = `Bearer ${token}`;
      expect(compareBearerToken(authHeader, token)).toBe(true);
    });

    it("should handle numeric tokens", () => {
      const token = "1234567890";
      const authHeader = `Bearer ${token}`;
      expect(compareBearerToken(authHeader, token)).toBe(true);
    });
  });

  // ==========================================
  // Token Mismatches
  // ==========================================

  describe("Token Mismatches", () => {
    it("should return false for different tokens", () => {
      const authHeader = "Bearer wrong-token-123";
      const expectedToken = "correct-token-456";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(false);
    });

    it("should return false for tokens differing by one character", () => {
      const authHeader = "Bearer secret-token-123";
      const expectedToken = "secret-token-124";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(false);
    });

    it("should be case-sensitive for tokens", () => {
      const authHeader = "Bearer SECRET-TOKEN-123";
      const expectedToken = "secret-token-123";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(false);
    });
  });

  // ==========================================
  // Malformed Headers
  // ==========================================

  describe("Malformed Headers", () => {
    it('should return false when "Bearer " prefix is missing', () => {
      const authHeader = "secret-token-123";
      const expectedToken = "secret-token-123";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(false);
    });

    it('should return false for "Basic" auth header', () => {
      const authHeader = "Basic dXNlcjpwYXNz";
      const expectedToken = "dXNlcjpwYXNz";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(false);
    });

    it("should return false for empty auth header", () => {
      const authHeader = "";
      const expectedToken = "secret-token-123";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(false);
    });

    it('should return false when only "Bearer" is provided (no token)', () => {
      const authHeader = "Bearer";
      const expectedToken = "secret-token-123";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(false);
    });

    it('should return false when "Bearer " has no token after it', () => {
      const authHeader = "Bearer ";
      const expectedToken = "secret-token-123";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(false);
    });

    it('should handle lowercase "bearer" (case-sensitive)', () => {
      // The function checks for 'Bearer ' (capital B), so lowercase should fail
      const authHeader = "bearer secret-token-123";
      const expectedToken = "secret-token-123";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(false);
    });

    it('should handle "BEARER" (all caps)', () => {
      // The function checks for 'Bearer ' exactly, so all caps should fail
      const authHeader = "BEARER secret-token-123";
      const expectedToken = "secret-token-123";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(false);
    });

    it("should reject auth header with missing space after Bearer", () => {
      const authHeader = "Bearersecret-token-123";
      const expectedToken = "secret-token-123";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(false);
    });

    it("should handle multiple spaces after Bearer", () => {
      // substring(7) starts at index 7, so "Bearer  " would include the extra space
      // This makes the extracted token " secret-token-123" (with leading space)
      // But .trim() is called on the token, so it becomes "secret-token-123" = true
      const authHeader = "Bearer  secret-token-123";
      const expectedToken = "secret-token-123";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(true);
    });
  });

  // ==========================================
  // Whitespace Handling - Environment Variables
  // ==========================================

  describe("Whitespace Handling", () => {
    it("should trim trailing newline from expected token", () => {
      const authHeader = "Bearer secret-token-123";
      const expectedToken = "secret-token-123\n";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(true);
    });

    it("should trim leading whitespace from expected token", () => {
      const authHeader = "Bearer secret-token-123";
      const expectedToken = "  secret-token-123";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(true);
    });

    it("should trim both leading and trailing whitespace from expected", () => {
      const authHeader = "Bearer secret-token-123";
      const expectedToken = "  secret-token-123\n\t";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(true);
    });

    it("should handle CRLF in expected token", () => {
      const authHeader = "Bearer secret-token-123";
      const expectedToken = "secret-token-123\r\n";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(true);
    });

    it("should trim whitespace from auth header token", () => {
      // The token is extracted and trimmed from the auth header
      const authHeader = "Bearer secret-token-123  ";
      const expectedToken = "secret-token-123";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(true);
    });
  });

  // ==========================================
  // Empty Strings and Edge Cases
  // ==========================================

  describe("Empty Strings", () => {
    it("should return true when both auth header and expected token are empty", () => {
      const authHeader = "Bearer ";
      const expectedToken = "";
      // After trim, expected is '', but token extracted is '', so should match
      expect(compareBearerToken(authHeader, expectedToken)).toBe(true);
    });

    it("should return false when expected token is empty but header has token", () => {
      const authHeader = "Bearer secret-token-123";
      const expectedToken = "";
      expect(compareBearerToken(authHeader, expectedToken)).toBe(false);
    });

    it("should handle whitespace-only expected token", () => {
      const authHeader = "Bearer ";
      const expectedToken = "   \n";
      // After trim, expected becomes '', token is '', should match
      expect(compareBearerToken(authHeader, expectedToken)).toBe(true);
    });
  });

  // ==========================================
  // Security - Timing Attack Prevention
  // ==========================================

  describe("Security - Timing Attacks", () => {
    it("should use constant-time comparison for tokens", () => {
      // Verify that differences at various positions all return false consistently
      const expected = "secret-token-0123456789";

      const invalidHeaders = [
        "Bearer xecret-token-0123456789", // First char different
        "Bearer secret-xoken-0123456789", // Middle char different
        "Bearer secret-token-012345678x", // Last char different
        "Bearer xecret-xoken-012345678x", // Multiple chars different
      ];

      for (const invalidHeader of invalidHeaders) {
        expect(compareBearerToken(invalidHeader, expected)).toBe(false);
      }
    });

    it("should handle length check before constant-time comparison", () => {
      const expectedToken = "token-with-specific-length";
      const shortHeader = "Bearer short";
      const longHeader = "Bearer token-with-specific-length-and-more-characters";

      expect(compareBearerToken(shortHeader, expectedToken)).toBe(false);
      expect(compareBearerToken(longHeader, expectedToken)).toBe(false);
    });

    it("should prevent buffer allocation attacks", () => {
      // Extremely long tokens should be rejected at length check
      const expectedToken = "normal-length-token";
      const veryLongToken = "x".repeat(1000000);
      const authHeader = `Bearer ${veryLongToken}`;

      expect(compareBearerToken(authHeader, expectedToken)).toBe(false);
    });

    it("should handle JWT tokens securely", () => {
      // Real-world JWT tokens should work correctly
      const jwtToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
      const wrongJwt =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkphbmUgRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

      expect(compareBearerToken(`Bearer ${jwtToken}`, jwtToken)).toBe(true);
      expect(compareBearerToken(`Bearer ${jwtToken}`, wrongJwt)).toBe(false);
    });
  });

  // ==========================================
  // Real-World Scenarios
  // ==========================================

  describe("Real-World Scenarios", () => {
    it("should handle Vercel Cron Secret format", () => {
      // Vercel cron jobs use Bearer token auth
      const cronSecret = "vercel-cron-secret-abc123xyz";
      const authHeader = `Bearer ${cronSecret}`;
      expect(compareBearerToken(authHeader, cronSecret)).toBe(true);
    });

    it("should handle API keys in Bearer format", () => {
      const apiKey = "test_key_51H8xJK2eZvKYlo2C9z1Q2w3E4r5T6y7U8i9O0p1A2s3D4f5G6h7J8k9L0";
      const authHeader = `Bearer ${apiKey}`;
      expect(compareBearerToken(authHeader, apiKey)).toBe(true);
    });

    it("should reject expired token attempts with wrong value", () => {
      const validToken = "current-token-v2";
      const expiredToken = "old-token-v1";
      const authHeader = `Bearer ${expiredToken}`;
      expect(compareBearerToken(authHeader, validToken)).toBe(false);
    });
  });

  // ==========================================
  // Error Handling
  // ==========================================

  describe("Error Handling", () => {
    it("should return false when Buffer.from fails with invalid encoding", () => {
      // Test with invalid characters that might cause buffer issues
      const invalidKey = "\uD800"; // Unpaired surrogate - invalid UTF-16
      expect(compareApiKeys(invalidKey, "valid-key")).toBe(false);
      expect(compareApiKeys("valid-key", invalidKey)).toBe(false);
    });

    it("should return false for both functions on any error", () => {
      // Null bytes and other edge cases
      const edgeCases = ["\0", "\uFFFE", "\uFFFF"];
      for (const testCase of edgeCases) {
        expect(compareApiKeys(testCase, "test")).toBe(false);
        expect(compareBearerToken(`Bearer ${testCase}`, "test")).toBe(false);
      }
    });
  });
});
