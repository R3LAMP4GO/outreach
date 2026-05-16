/**
 * Pure Cap share/embed URL parsing.
 *
 * Lives in its own module (no `server-only` marker) so client components can
 * import it directly \u2014 e.g. the prospect cockpit's Cap video card uses it
 * to derive the video id from a pasted URL the instant the user types.
 *
 * Re-exported from `./client.ts` for callers already importing the rest of
 * the Cap surface from there.
 */

/**
 * Parse a Cap share/embed URL down to its video id.
 *
 * Supported shapes (all confirmed in CapSoftware/Cap source + docs):
 *   - https://cap.so/s/<id>            (default share link)
 *   - https://cap.so/v/<id>            (legacy share link, redirects to /s)
 *   - https://cap.so/embed/<id>        (iframe embed)
 *   - https://cap.so/dev/<id>          (SDK-created share link)
 *   - https://<custom-domain>/s/<id>   (org's custom domain)
 *   - https://<custom-domain>/embed/<id>
 *
 * Returns `null` for any URL that doesn't match. Strips trailing query
 * strings and hashes. Ignores extra path segments after the id (Cap appends
 * `?t=...` for timestamped links, never extra path).
 */
export function extractCapVideoId(shareUrl: string): string | null {
  if (!shareUrl || typeof shareUrl !== "string") return null;

  let parsed: URL;
  try {
    parsed = new URL(shareUrl.trim());
  } catch {
    return null;
  }

  // Only http/https — reject mailto:, javascript:, file:, etc.
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  // Strip leading slash and split. Empty entries (trailing slash) are dropped.
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const [prefix, id] = segments;
  if (prefix !== "s" && prefix !== "v" && prefix !== "embed" && prefix !== "dev") {
    return null;
  }

  if (!id || !isPlausibleVideoId(id)) return null;
  return id;
}

// Cap ids are nanoIds — alphanumeric + a small set of safe characters. We
// validate liberally (8+ chars, URL-safe) rather than tying ourselves to a
// specific nanoId charset that could change. See packages/database/schema.ts
// where the column is declared `nanoId("id")`.
function isPlausibleVideoId(id: string): boolean {
  if (id.length < 8 || id.length > 64) return false;
  return /^[A-Za-z0-9_-]+$/.test(id);
}
