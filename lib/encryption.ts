/**
 * AES-256-GCM Encryption Library
 *
 * Provides secure encryption/decryption for sensitive credentials
 * (API keys, OAuth tokens, webhook secrets).
 *
 * Security Features:
 * - AES-256-GCM authenticated encryption
 * - 96-bit random IV per NIST SP 800-38D §5.2.1.1 recommendation
 * - Authentication tags to prevent tampering
 * - Base64 encoding for database storage
 * - Backward-compatible decryption of legacy 128-bit IV ciphertext
 *
 * Environment Variable Required:
 * - INTEGRATION_ENCRYPTION_KEY (64-character hex string = 32 bytes)
 *
 * Generate key with: openssl rand -hex 32
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits — NIST SP 800-38D §5.2.1.1 recommended length for AES-GCM
const LEGACY_IV_LENGTH = 16; // 128 bits — used before migration, kept for backward compatibility
const TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Get encryption key from environment variable
 * @throws {Error} If INTEGRATION_ENCRYPTION_KEY is not set or invalid
 */
function getEncryptionKey(): Buffer {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;

  if (!key) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY environment variable is not set. " +
        "Generate with: openssl rand -hex 32",
    );
  }

  if (key.length !== KEY_LENGTH * 2) {
    throw new Error(
      `INTEGRATION_ENCRYPTION_KEY must be ${KEY_LENGTH * 2} characters (${KEY_LENGTH} bytes hex-encoded). ` +
        `Current length: ${key.length}`,
    );
  }

  // Validate hex format
  if (!/^[0-9a-f]+$/i.test(key)) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY must be a valid hex string");
  }

  return Buffer.from(key, "hex");
}

/**
 * Encrypted credential result
 */
export interface EncryptedCredential {
  encryptedValue: string; // Base64-encoded ciphertext
  iv: string; // Base64-encoded initialization vector
  tag: string; // Base64-encoded authentication tag
}

/**
 * Encrypt a credential value
 *
 * @param plaintext - The credential to encrypt (API key, token, etc.)
 * @returns Encrypted credential with IV and authentication tag
 * @throws {Error} If encryption fails
 *
 * @example
 * const encrypted = encryptCredential('my-secret-credential');
 * // Store encrypted.encryptedValue, encrypted.iv, encrypted.tag in database
 */
export function encryptCredential(plaintext: string): EncryptedCredential {
  try {
    const key = getEncryptionKey();

    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt data
    let encrypted = cipher.update(plaintext, "utf8", "base64");
    encrypted += cipher.final("base64");

    // Get authentication tag
    const tag = cipher.getAuthTag();

    return {
      encryptedValue: encrypted,
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
    };
  } catch (error) {
    throw new Error(
      `Failed to encrypt credential: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Decrypt a credential value
 *
 * @param encryptedValue - Base64-encoded ciphertext
 * @param iv - Base64-encoded initialization vector
 * @param tag - Base64-encoded authentication tag
 * @returns Decrypted plaintext credential
 * @throws {Error} If decryption fails or authentication tag is invalid
 *
 * @example
 * const plaintext = decryptCredential(
 *   credential.encrypted_value,
 *   credential.encryption_iv,
 *   credential.encryption_tag
 * );
 */
export function decryptCredential(encryptedValue: string, iv: string, tag: string): string {
  try {
    const key = getEncryptionKey();

    // Convert from base64
    const ivBuffer = Buffer.from(iv, "base64");
    const tagBuffer = Buffer.from(tag, "base64");

    // Accept both 12-byte (NIST-recommended) and 16-byte (legacy) IVs.
    // Legacy 16-byte IVs exist from data encrypted before the migration to
    // NIST SP 800-38D compliant 96-bit IVs. AES-GCM handles both lengths
    // natively — Node.js passes the IV directly to OpenSSL which performs
    // GHASH-based derivation for non-96-bit IVs, so legacy data still decrypts.
    if (ivBuffer.length !== IV_LENGTH && ivBuffer.length !== LEGACY_IV_LENGTH) {
      throw new Error(
        `Invalid IV length: expected ${IV_LENGTH} or ${LEGACY_IV_LENGTH}, got ${ivBuffer.length}`,
      );
    }

    // Validate tag length
    if (tagBuffer.length !== TAG_LENGTH) {
      throw new Error(`Invalid tag length: expected ${TAG_LENGTH}, got ${tagBuffer.length}`);
    }

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
    decipher.setAuthTag(tagBuffer);

    // Decrypt data
    let decrypted = decipher.update(encryptedValue, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    throw new Error(
      `Failed to decrypt credential: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Validate that encryption key is configured correctly
 *
 * @returns true if encryption is properly configured
 * @throws {Error} If encryption key is missing or invalid
 */
export function validateEncryptionSetup(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch (error) {
    throw error;
  }
}

/**
 * Test encryption/decryption round-trip
 *
 * @returns true if encryption/decryption works correctly
 * @throws {Error} If test fails
 */
export function testEncryption(): boolean {
  const testData = "test-credential-123";

  try {
    // Encrypt
    const encrypted = encryptCredential(testData);

    // Decrypt
    const decrypted = decryptCredential(encrypted.encryptedValue, encrypted.iv, encrypted.tag);

    // Verify
    if (decrypted !== testData) {
      throw new Error("Decrypted value does not match original");
    }

    return true;
  } catch (error) {
    throw new Error(
      `Encryption test failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
