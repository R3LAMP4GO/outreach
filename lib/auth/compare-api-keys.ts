import { timingSafeEqual } from "crypto";

/**
 * Compare API keys using constant-time comparison to prevent timing attacks
 *
 * Uses crypto.timingSafeEqual to ensure comparison time is independent of
 * input values, preventing attackers from using timing information to guess
 * the correct API key character by character.
 *
 * Trims whitespace to handle environment variable formatting inconsistencies
 * (e.g., trailing newlines in Vercel environment variables).
 *
 * @param provided - API key from request header
 * @param expected - Expected API key from environment variable
 * @returns true if keys match, false otherwise
 *
 * @example
 * ```typescript
 * const apiKey = request.headers.get('x-api-key');
 * const expectedKey = process.env.OUTREACH_API_KEY;
 *
 * if (!apiKey || !expectedKey || !compareApiKeys(apiKey, expectedKey)) {
 *   return Response.json({ error: 'Unauthorized' }, { status: 401 });
 * }
 * ```
 */
export function compareApiKeys(provided: string, expected: string): boolean {
  try {
    // Trim whitespace/newlines to handle env var edge cases (e.g., trailing \n in Vercel)
    const trimmedProvided = provided.trim();
    const trimmedExpected = expected.trim();

    // Length check is not timing-safe but reveals no secret information
    // (attacker doesn't know expected length, and this prevents buffer allocation attacks)
    if (trimmedProvided.length !== trimmedExpected.length) {
      return false;
    }

    // Use crypto.timingSafeEqual for constant-time comparison
    // This prevents timing attacks where an attacker measures response time
    // to determine if they're getting closer to the correct key
    return timingSafeEqual(Buffer.from(trimmedProvided), Buffer.from(trimmedExpected));
  } catch {
    // Catch any buffer encoding errors or timingSafeEqual failures
    // Return false to avoid leaking information via error types
    return false;
  }
}

/**
 * Compare Bearer tokens using constant-time comparison
 *
 * Extracts token from "Bearer <token>" format and compares using timingSafeEqual.
 *
 * @param authHeader - Authorization header value (e.g., "Bearer abc123")
 * @param expectedToken - Expected token value from environment variable
 * @returns true if tokens match, false otherwise
 *
 * @example
 * ```typescript
 * const authHeader = request.headers.get('authorization');
 * const expectedToken = process.env.CRON_SECRET;
 *
 * if (!authHeader || !expectedToken || !compareBearerToken(authHeader, expectedToken)) {
 *   return Response.json({ error: 'Unauthorized' }, { status: 401 });
 * }
 * ```
 */
export function compareBearerToken(authHeader: string, expectedToken: string): boolean {
  try {
    // Extract token from "Bearer <token>" format and trim to handle client whitespace
    const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : "";

    // Trim expected token to handle env var edge cases
    const trimmedExpected = expectedToken.trim();

    // Length check prevents buffer allocation attacks
    if (token.length !== trimmedExpected.length) {
      return false;
    }

    // Constant-time comparison
    return timingSafeEqual(Buffer.from(token), Buffer.from(trimmedExpected));
  } catch {
    // Catch any buffer encoding errors or timingSafeEqual failures
    // Return false to avoid leaking information via error types
    return false;
  }
}
