/**
 * Tests for the Quo webhook signature verifier.
 *
 * Uses the production `signQuoPayload` helper to round-trip signatures,
 * then mutates pieces of the header to exercise each failure path.
 */
import { describe, expect, it } from "vitest";

import { QUO_WEBHOOK_MAX_AGE_MS, signQuoPayload, verifyQuoSignature } from "../verify-signature";

// The real Quo secret is base64-encoded; ours is the same.
const SECRET = Buffer.from("quo-test-secret").toString("base64");
const BODY = JSON.stringify({ hello: "world" });

describe("verifyQuoSignature", () => {
  it("accepts a freshly-signed payload", () => {
    const header = signQuoPayload(BODY, SECRET);
    const result = verifyQuoSignature(BODY, header, SECRET);
    expect(result.valid).toBe(true);
  });

  it("rejects when the signing secret is missing", () => {
    const header = signQuoPayload(BODY, SECRET);
    expect(verifyQuoSignature(BODY, header, "").reason).toBe("missing-secret");
    expect(verifyQuoSignature(BODY, header, null).reason).toBe("missing-secret");
  });

  it("rejects when the signature header is missing", () => {
    expect(verifyQuoSignature(BODY, null, SECRET).reason).toBe("missing-header");
    expect(verifyQuoSignature(BODY, "", SECRET).reason).toBe("missing-header");
  });

  it("rejects malformed headers (wrong number of segments)", () => {
    expect(verifyQuoSignature(BODY, "hmac;1;1234", SECRET).reason).toBe("malformed-header");
    expect(verifyQuoSignature(BODY, "hmac;1;1234;sig;extra", SECRET).reason).toBe(
      "malformed-header",
    );
  });

  it("rejects unsupported schemes", () => {
    expect(verifyQuoSignature(BODY, "rsa;1;1234;sig", SECRET).reason).toBe("unsupported-scheme");
  });

  it("rejects unsupported versions", () => {
    expect(verifyQuoSignature(BODY, "hmac;9;1234;sig", SECRET).reason).toBe("unsupported-version");
  });

  it("rejects non-numeric timestamps", () => {
    expect(verifyQuoSignature(BODY, "hmac;1;not-a-number;sig", SECRET).reason).toBe(
      "invalid-timestamp",
    );
  });

  it("rejects signatures that are too old (replay protection)", () => {
    const ancientTimestamp = Date.now() - QUO_WEBHOOK_MAX_AGE_MS - 60_000;
    const header = signQuoPayload(BODY, SECRET, ancientTimestamp);
    expect(verifyQuoSignature(BODY, header, SECRET).reason).toBe("timestamp-too-old");
  });

  it("rejects signatures from too far in the future (clock skew)", () => {
    const futureTimestamp = Date.now() + 5 * 60 * 1000;
    const header = signQuoPayload(BODY, SECRET, futureTimestamp);
    expect(verifyQuoSignature(BODY, header, SECRET).reason).toBe("timestamp-in-future");
  });

  it("rejects when the signature was computed with a different secret", () => {
    const header = signQuoPayload(BODY, SECRET);
    const otherSecret = Buffer.from("different-secret").toString("base64");
    expect(verifyQuoSignature(BODY, header, otherSecret).reason).toBe("signature-mismatch");
  });

  it("rejects when the body was tampered with after signing", () => {
    const header = signQuoPayload(BODY, SECRET);
    expect(verifyQuoSignature(`${BODY} tampered`, header, SECRET).reason).toBe(
      "signature-mismatch",
    );
  });

  it("uses the documented base64-then-binary key-encoding (matches Quo's reference example)", () => {
    // Sanity-test that we match the OpenPhone docs sample format. We can't
    // assert against their literal digest (different key) but the structure
    // must be hmac;1;<numeric>;<base64>.
    const header = signQuoPayload(BODY, SECRET, 1639710054089);
    const [scheme, version, ts, digest] = header.split(";");
    expect(scheme).toBe("hmac");
    expect(version).toBe("1");
    expect(ts).toBe("1639710054089");
    // base64 alphabet only: A-Z a-z 0-9 + / =
    expect(digest).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
