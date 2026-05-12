/**
 * Tests for AES-256-GCM encryption/decryption of credentials
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Valid 64-char hex key (32 bytes)
const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const WRONG_KEY = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

// We need to set env before importing the module, so use dynamic imports
async function loadModule() {
  // Clear module cache so env changes take effect
  vi.resetModules();
  const mod = await import("../encryption");
  return mod;
}

// ============================================================
// encryptCredential / decryptCredential - Round Trip
// ============================================================

describe("Encryption Round Trip", () => {
  beforeEach(() => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", TEST_KEY);
  });

  it("should encrypt and decrypt back to original plaintext", async () => {
    const { encryptCredential, decryptCredential } = await loadModule();
    const plaintext = "test-credential-value-1234";
    const encrypted = encryptCredential(plaintext);

    expect(encrypted.encryptedValue).toBeTypeOf("string");
    expect(encrypted.iv).toBeTypeOf("string");
    expect(encrypted.tag).toBeTypeOf("string");

    const decrypted = decryptCredential(encrypted.encryptedValue, encrypted.iv, encrypted.tag);
    expect(decrypted).toBe(plaintext);
  });

  it("should produce different ciphertext for the same plaintext (random IV)", async () => {
    const { encryptCredential } = await loadModule();
    const plaintext = "same-secret-value";
    const enc1 = encryptCredential(plaintext);
    const enc2 = encryptCredential(plaintext);
    expect(enc1.encryptedValue).not.toBe(enc2.encryptedValue);
    expect(enc1.iv).not.toBe(enc2.iv);
  });

  it("should handle empty string encryption", async () => {
    const { encryptCredential, decryptCredential } = await loadModule();
    const encrypted = encryptCredential("");
    const decrypted = decryptCredential(encrypted.encryptedValue, encrypted.iv, encrypted.tag);
    expect(decrypted).toBe("");
  });

  it("should handle long plaintext", async () => {
    const { encryptCredential, decryptCredential } = await loadModule();
    const longText = "a".repeat(10000);
    const encrypted = encryptCredential(longText);
    const decrypted = decryptCredential(encrypted.encryptedValue, encrypted.iv, encrypted.tag);
    expect(decrypted).toBe(longText);
  });
});

// ============================================================
// Decryption with Wrong Key
// ============================================================

describe("Decrypt with Wrong Key", () => {
  it("should fail to decrypt when key changes", async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", TEST_KEY);
    const { encryptCredential } = await loadModule();
    const encrypted = encryptCredential("secret-data");

    // Switch to wrong key
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", WRONG_KEY);
    const { decryptCredential } = await loadModule();

    expect(() => decryptCredential(encrypted.encryptedValue, encrypted.iv, encrypted.tag)).toThrow(
      "Failed to decrypt credential",
    );
  });
});

// ============================================================
// Missing Environment Variable
// ============================================================

describe("Missing Encryption Key", () => {
  it("should throw when INTEGRATION_ENCRYPTION_KEY is not set", async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "");
    const { encryptCredential } = await loadModule();
    expect(() => encryptCredential("test")).toThrow("INTEGRATION_ENCRYPTION_KEY");
  });

  it("should throw when key has wrong length", async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "tooshort");
    const { encryptCredential } = await loadModule();
    expect(() => encryptCredential("test")).toThrow("must be 64 characters");
  });

  it("should throw when key is not valid hex", async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "g".repeat(64));
    const { encryptCredential } = await loadModule();
    expect(() => encryptCredential("test")).toThrow("valid hex string");
  });
});

// ============================================================
// Tampered Ciphertext
// ============================================================

describe("Tampered Ciphertext", () => {
  beforeEach(() => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", TEST_KEY);
  });

  it("should fail when ciphertext is tampered with", async () => {
    const { encryptCredential, decryptCredential } = await loadModule();
    const encrypted = encryptCredential("sensitive-credential");

    // Tamper with the encrypted value
    const tampered =
      encrypted.encryptedValue.slice(0, -2) +
      (encrypted.encryptedValue.endsWith("AA") ? "BB" : "AA");

    expect(() => decryptCredential(tampered, encrypted.iv, encrypted.tag)).toThrow(
      "Failed to decrypt credential",
    );
  });

  it("should fail when auth tag is tampered with", async () => {
    const { encryptCredential, decryptCredential } = await loadModule();
    const encrypted = encryptCredential("sensitive-credential");

    // Tamper with the tag
    const tamperedTag = encrypted.tag.slice(0, -2) + (encrypted.tag.endsWith("AA") ? "BB" : "AA");

    expect(() => decryptCredential(encrypted.encryptedValue, encrypted.iv, tamperedTag)).toThrow(
      "Failed to decrypt credential",
    );
  });
});

// ============================================================
// Legacy 16-byte IV Backward Compatibility
// ============================================================

describe("Legacy 16-byte IV Compatibility", () => {
  beforeEach(() => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", TEST_KEY);
  });

  it("should decrypt data encrypted with a 16-byte IV", async () => {
    const { decryptCredential } = await loadModule();

    // Manually encrypt with 16-byte IV to simulate legacy data
    const key = Buffer.from(TEST_KEY, "hex");
    const iv = crypto.randomBytes(16); // Legacy IV length
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update("legacy-secret", "utf8", "base64");
    encrypted += cipher.final("base64");
    const tag = cipher.getAuthTag();

    const decrypted = decryptCredential(encrypted, iv.toString("base64"), tag.toString("base64"));
    expect(decrypted).toBe("legacy-secret");
  });

  it("should reject IVs that are neither 12 nor 16 bytes", async () => {
    const { decryptCredential } = await loadModule();

    const badIv = crypto.randomBytes(8).toString("base64"); // 8-byte IV
    const fakeTag = crypto.randomBytes(16).toString("base64");

    expect(() => decryptCredential("dGVzdA==", badIv, fakeTag)).toThrow("Invalid IV length");
  });
});

// ============================================================
// validateEncryptionSetup / testEncryption
// ============================================================

describe("validateEncryptionSetup", () => {
  it("should return true when key is valid", async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", TEST_KEY);
    const { validateEncryptionSetup } = await loadModule();
    expect(validateEncryptionSetup()).toBe(true);
  });

  it("should throw when key is missing", async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "");
    const { validateEncryptionSetup } = await loadModule();
    expect(() => validateEncryptionSetup()).toThrow("INTEGRATION_ENCRYPTION_KEY");
  });
});

describe("testEncryption", () => {
  it("should return true for a working round-trip", async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", TEST_KEY);
    const { testEncryption } = await loadModule();
    expect(testEncryption()).toBe(true);
  });
});
