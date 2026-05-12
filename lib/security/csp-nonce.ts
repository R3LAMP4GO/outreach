/**
 * CSP Nonce Generation
 *
 * Generates cryptographically secure nonces for Content Security Policy.
 * Uses Web Crypto API for Edge Runtime compatibility (middleware runs in Edge).
 */

/**
 * Generate a cryptographically secure nonce for CSP headers.
 * Uses Web Crypto API (available in Edge Runtime) instead of Node.js crypto.
 */
export function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  // Convert Uint8Array to base64 string (Edge Runtime compatible)
  let binary = "";
  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }
  return btoa(binary);
}

/**
 * Build the Content-Security-Policy header value with a nonce.
 *
 * Uses nonce-based CSP with 'strict-dynamic' for XSS protection.
 * - script-src: nonce + strict-dynamic (no unsafe-eval/unsafe-inline)
 * - style-src: unsafe-inline required for Tailwind CSS
 * - Called from middleware.ts on every request with a fresh nonce
 */
export function buildCspHeader(nonce: string): string {
  const directives = [
    "default-src 'self'",
    // sha256 hash covers Next.js RSC bootstrap script (self.__next_f=...) which
    // Vercel's edge runtime injects without a nonce regardless of header forwarding.
    // unsafe-eval is required in dev for React's call stack reconstruction (Turbopack).
    // It is never included in production.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'sha256-TiyWB4YB4NUrUHDJSqaW0w0OtUb7i0Tddwwo6j0O07c=' 'sha256-HugGj5oR7f2UGBbrPIOJua5vPpKBIJj8354Z6gsKoUQ='${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://app.cal.com`,
    "style-src 'self' 'unsafe-inline'",
    // Explicit allow-list for image hosts. Drop the open `https:` wildcard — known hosts only.
    "img-src 'self' data: blob: https://images.unsplash.com https://framerusercontent.com https://lh3.googleusercontent.com https://api.qrserver.com",
    "font-src 'self' data:",
    "connect-src 'self' https://app.cal.com",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src https://cal.com https://app.cal.com",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ];

  return directives.join("; ");
}
