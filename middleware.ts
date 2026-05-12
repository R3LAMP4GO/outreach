import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { generateNonce, buildCspHeader } from "@/lib/security/csp-nonce";

// Instantiate NextAuth here from the Edge-safe config so the middleware bundle
// never pulls in `lib/auth.ts` (which transitively imports bcryptjs, postgres.js,
// and node:crypto via lib/encryption — none of which are valid in Edge runtime).
const { auth } = NextAuth(authConfig);

/**
 * Create a NextResponse.next() with CSP nonce headers.
 * Sets the nonce as a request header so layout.tsx can read it,
 * and sets the CSP header on the response.
 */
function nextWithCsp(nonce: string, cspHeader: string, request: Request) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next.js reads 'content-security-policy' from request headers at render time
  // (app-render.js:166) to extract the nonce and apply it to its own RSC inline
  // scripts. Without this, Next.js injects unnested inline scripts that violate
  // the CSP, causing a blank screen on client-component pages.
  requestHeaders.set("content-security-policy", cspHeader);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  // Generate CSP nonce for this request
  const nonce = generateNonce();
  const cspHeader = buildCspHeader(nonce);

  // Webhook hostname lockdown:
  // `hooks.__YOUR_DOMAIN__` (and any future `hooks.*` / `webhooks.*` host) is a
  // dedicated webhook subdomain that bypasses Cloudflare (DNS-only / grey cloud).
  // To minimise attack surface, this hostname must ONLY serve webhook routes.
  // Everything else returns 404 — the marketing site and admin must use the apex
  // domain (which sits behind Cloudflare's bot/DDoS protection).
  //
  // Webhook routes themselves (/api/webhooks/*, /api/outreach/webhooks/*) are
  // excluded from this middleware via the matcher, so they never reach this code
  // regardless of hostname. This guard only applies to non-webhook paths that
  // happen to be requested on the hooks subdomain.
  const hostHeader = req.headers.get("host") ?? "";
  const hostname = hostHeader.split(":")[0].toLowerCase();
  const isWebhookHost = hostname.startsWith("hooks.") || hostname.startsWith("webhooks.");
  if (isWebhookHost) {
    return new NextResponse(null, { status: 404 });
  }

  // CSRF Protection for API routes
  // Note: webhook and import routes (/api/webhooks/*, /api/outreach/webhooks/*, /api/outreach/import/*)
  // are excluded from the middleware matcher entirely and never reach this code.
  const isApiRoute = nextUrl.pathname.startsWith("/api/");
  const isStateChangingMethod = ["POST", "PUT", "DELETE", "PATCH"].includes(req.method);

  if (isApiRoute && isStateChangingMethod) {
    const origin = req.headers.get("origin");
    const referer = req.headers.get("referer");
    const host = req.headers.get("host");

    // Expected origins (dynamically construct from host header)
    const expectedOrigins = [
      `https://${host}`,
      `http://${host}`,
      process.env.NEXT_PUBLIC_SITE_URL, // Changed from SITE_URL to match .env.local
      process.env.NEXTAUTH_URL,
    ].filter(Boolean);

    // Verify origin or referer matches expected host
    const isValidOrigin = origin && expectedOrigins.some((expected) => origin === expected);
    const isValidReferer =
      referer && expectedOrigins.some((expected) => referer.startsWith(expected!));

    if (!isValidOrigin && !isValidReferer) {
      console.warn("CSRF protection: Blocked request with mismatched origin");
      return new NextResponse(JSON.stringify({ error: "Invalid request origin" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const isAdminRoute = nextUrl.pathname.startsWith("/admin");
  const isAuthPage =
    nextUrl.pathname === "/admin/login" ||
    nextUrl.pathname.startsWith("/admin/invite/") ||
    nextUrl.pathname.startsWith("/admin/reset-password");

  // Allow public routes
  if (!isAdminRoute) {
    return nextWithCsp(nonce, cspHeader, req);
  }

  // Allow auth pages without login
  if (isAuthPage) {
    // Redirect to dashboard if already logged in
    if (isLoggedIn && nextUrl.pathname === "/admin/login") {
      return NextResponse.redirect(new URL("/admin", nextUrl));
    }
    return nextWithCsp(nonce, cspHeader, req);
  }

  // Protect admin routes
  if (!isLoggedIn) {
    const loginUrl = new URL("/admin/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return nextWithCsp(nonce, cspHeader, req);
});

export const config = {
  matcher: [
    // Match all admin routes
    "/admin/:path*",
    // Match API routes EXCEPT: /api/auth, /api/webhooks/*, /api/outreach/webhooks/*, /api/outreach/import/*,
    // /api/outreach/process, /api/outreach/unsubscribe/*
    // These routes authenticate via Bearer token or HMAC — skip NextAuth wrapper entirely
    "/api/((?!auth|webhooks|outreach/webhooks|outreach/import|outreach/process|outreach/unsubscribe).*)",
    // Other routes (exclude static files, /api/auth, webhook routes, and outreach cron routes)
    "/((?!_next/static|_next/image|favicon.ico|api/auth|api/webhooks|api/outreach/webhooks|api/outreach/import|api/outreach/process|api/outreach/unsubscribe).*)",
  ],
};
