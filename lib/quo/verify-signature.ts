/**
 * Quo (formerly OpenPhone) webhook signature verification.
 *
 * Format (per https://support.openphone.com/core-concepts/integrations/webhooks,
 * verified 2026-05-15):
 *
 *   Header: `openphone-signature`
 *   Value:  `hmac;1;<timestampMs>;<base64-signature>`
 *
 *   signedData = `${timestampMs}.${rawBody}`
 *   signingKey = base64Decode(QUO_WEBHOOK_SECRET) converted to a binary
 *                (latin1) string before being passed to createHmac
 *   signature  = base64(HMAC-SHA256(signingKey, signedData))
 *
 * The "convert base64 → binary string" step is unusual but is the documented
 * behaviour — Quo's own Node example does exactly this. We replicate it
 * verbatim so the same secret pasted from the Quo dashboard produces the
 * same digest here.
 *
 * If a future Quo API rev moves to a simpler `hex(HMAC(secret, body))` shape,
 * adjust this single file — the route handler only sees `true | false`.
 *
 * Pure utility — no I/O, no DB, no side effects. Safe to call from anywhere.
 */
import crypto from "node:crypto";

/** Maximum age of a signed webhook before we treat it as a replay attempt. */
export const QUO_WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;
/** Tolerance for slight clock skew between Quo and our server. */
export const QUO_WEBHOOK_CLOCK_SKEW_MS = 30 * 1000;

export type QuoSignatureFailureReason =
  | "missing-header"
  | "missing-secret"
  | "malformed-header"
  | "unsupported-scheme"
  | "unsupported-version"
  | "invalid-timestamp"
  | "timestamp-too-old"
  | "timestamp-in-future"
  | "signature-mismatch";

export interface QuoSignatureResult {
  valid: boolean;
  reason?: QuoSignatureFailureReason;
}

/**
 * Verify a Quo webhook signature.
 *
 * @param rawBody     Exact bytes of the request body as received. MUST be the
 *                    raw bytes — re-stringifying parsed JSON drops whitespace
 *                    and breaks the digest.
 * @param header      Value of the `openphone-signature` request header.
 * @param secret      Base64-encoded signing key from the Quo webhook settings.
 * @param now         Override for current time (test seam). Defaults to Date.now.
 */
export function verifyQuoSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string | null | undefined,
  now: number = Date.now(),
): QuoSignatureResult {
  if (!secret) return { valid: false, reason: "missing-secret" };
  if (!header) return { valid: false, reason: "missing-header" };

  // hmac;1;1639710054089;mw1K4fvh5m9XzsGon4C5N3KvL0bkmPZSAyb/9Vms2Qo=
  const parts = header.split(";");
  if (parts.length !== 4) return { valid: false, reason: "malformed-header" };

  const [scheme, version, timestampStr, providedDigest] = parts;
  if (scheme !== "hmac") return { valid: false, reason: "unsupported-scheme" };
  // Only v1 documented today. Reject unknown versions rather than silently
  // accepting them with a v1 verification path.
  if (version !== "1") return { valid: false, reason: "unsupported-version" };
  if (!timestampStr || !providedDigest) return { valid: false, reason: "malformed-header" };

  const timestampMs = Number(timestampStr);
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    return { valid: false, reason: "invalid-timestamp" };
  }

  const ageMs = now - timestampMs;
  if (ageMs > QUO_WEBHOOK_MAX_AGE_MS) {
    return { valid: false, reason: "timestamp-too-old" };
  }
  if (ageMs < -QUO_WEBHOOK_CLOCK_SKEW_MS) {
    return { valid: false, reason: "timestamp-in-future" };
  }

  const signedData = `${timestampStr}.${rawBody}`;

  // Quo docs explicitly require: base64-decode the signing key → convert to a
  // binary (latin1) string → use THAT as the HMAC key. Skipping the
  // `.toString("binary")` produces a different digest and would silently
  // reject every real Quo webhook.
  const signingKeyBinary = Buffer.from(secret, "base64").toString("binary");

  const computedDigest = crypto
    .createHmac("sha256", signingKeyBinary)
    .update(Buffer.from(signedData, "utf8"))
    .digest("base64");

  // timingSafeEqual requires equal-length buffers. A length mismatch is an
  // automatic fail and also makes the comparison itself safe to skip.
  const providedBuf = Buffer.from(providedDigest, "utf8");
  const computedBuf = Buffer.from(computedDigest, "utf8");
  if (providedBuf.length !== computedBuf.length) {
    return { valid: false, reason: "signature-mismatch" };
  }
  if (!crypto.timingSafeEqual(providedBuf, computedBuf)) {
    return { valid: false, reason: "signature-mismatch" };
  }

  return { valid: true };
}

/**
 * Build a valid Quo signature header for the given body + secret.
 *
 * Test helper only — never call from production code. Pasting this into a
 * real Quo webhook config will not work (Quo signs with its own internal
 * key, not whatever we hand it).
 */
export function signQuoPayload(
  rawBody: string,
  secret: string,
  timestampMs: number = Date.now(),
): string {
  const signingKeyBinary = Buffer.from(secret, "base64").toString("binary");
  const signedData = `${timestampMs}.${rawBody}`;
  const digest = crypto
    .createHmac("sha256", signingKeyBinary)
    .update(Buffer.from(signedData, "utf8"))
    .digest("base64");
  return `hmac;1;${timestampMs};${digest}`;
}
