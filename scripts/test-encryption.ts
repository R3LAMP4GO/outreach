/**
 * Test script for encryption library
 *
 * Run with: bun run scripts/test-encryption.ts
 */

import {
  encryptCredential,
  decryptCredential,
  validateEncryptionSetup,
  testEncryption,
} from "../lib/encryption";

console.log("🔐 Testing Encryption System...\n");

try {
  // Test 1: Validate encryption setup
  console.log("Test 1: Validating encryption setup...");
  validateEncryptionSetup();
  console.log("✅ Encryption key is properly configured\n");

  // Test 2: Round-trip encryption test
  console.log("Test 2: Testing encryption round-trip...");
  testEncryption();
  console.log("✅ Encryption/decryption works correctly\n");

  // Test 3: Encrypt a sample API key
  console.log("Test 3: Encrypting sample API key...");
  const testApiKey = "sk-test-1234567890abcdefghijklmnopqrstuvwxyz";
  const encrypted = encryptCredential(testApiKey);
  console.log("Encrypted value:", encrypted.encryptedValue.substring(0, 20) + "...");
  console.log("IV length:", encrypted.iv.length);
  console.log("Tag length:", encrypted.tag.length);
  console.log("✅ API key encrypted successfully\n");

  // Test 4: Decrypt the API key
  console.log("Test 4: Decrypting API key...");
  const decrypted = decryptCredential(encrypted.encryptedValue, encrypted.iv, encrypted.tag);

  if (decrypted === testApiKey) {
    console.log("✅ Decryption successful - values match!\n");
  } else {
    throw new Error("Decrypted value does not match original");
  }

  // Test 5: Verify different IVs for same plaintext
  console.log("Test 5: Verifying unique IVs for same plaintext...");
  const encrypted1 = encryptCredential("same-value");
  const encrypted2 = encryptCredential("same-value");

  if (encrypted1.iv !== encrypted2.iv) {
    console.log("✅ Different IVs generated (as expected)\n");
  } else {
    throw new Error("IVs should be unique for each encryption");
  }

  console.log("🎉 All encryption tests passed!");
  console.log("\nYou can now safely store encrypted credentials in the database.");
} catch (error) {
  console.error("❌ Encryption test failed:", error);
  process.exit(1);
}
