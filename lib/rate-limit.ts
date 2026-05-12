/**
 * In-memory rate limiter for API routes
 *
 * Provides basic protection for a single-instance Railway deployment.
 * Resets on cold starts — acceptable for the single-admin use case.
 */

import {
  RATE_LIMIT_CLEANUP_INTERVAL_MS,
  RATE_LIMIT_PASSWORD_RESET_COUNT,
  RATE_LIMIT_PASSWORD_RESET_WINDOW_MS,
  RATE_LIMIT_LOGIN_COUNT,
  RATE_LIMIT_LOGIN_WINDOW_MS,
  RATE_LIMIT_API_COUNT,
  RATE_LIMIT_API_WINDOW_MS,
  RATE_LIMIT_PASSWORD_CHANGE_COUNT,
  RATE_LIMIT_PASSWORD_CHANGE_WINDOW_MS,
  RATE_LIMIT_INVITATION_ACCEPT_COUNT,
  RATE_LIMIT_INVITATION_ACCEPT_WINDOW_MS,
  RATE_LIMIT_TOTP_SETUP_COUNT,
  RATE_LIMIT_TOTP_SETUP_WINDOW_MS,
  RATE_LIMIT_INVITATION_CREATE_COUNT,
  RATE_LIMIT_INVITATION_CREATE_WINDOW_MS,
} from "./constants";

type RateLimitEntry = {
  count: number;
  resetTime: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < RATE_LIMIT_CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Time window in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  success: boolean;
  /** Number of requests remaining in the window */
  remaining: number;
  /** Time in ms until the rate limit resets */
  resetIn: number;
}

/**
 * Check rate limit for a given identifier.
 *
 * @param identifier - Unique identifier (e.g., IP address, user ID)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig,
  _type?: "passwordReset" | "login" | "api",
): Promise<RateLimitResult> {
  cleanup();

  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || entry.resetTime < now) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return {
      success: true,
      remaining: config.limit - 1,
      resetIn: config.windowMs,
    };
  }

  if (entry.count >= config.limit) {
    return {
      success: false,
      remaining: 0,
      resetIn: entry.resetTime - now,
    };
  }

  entry.count++;
  return {
    success: true,
    remaining: config.limit - entry.count,
    resetIn: entry.resetTime - now,
  };
}

/**
 * Get client IP from request headers.
 * Works with Cloudflare, Nginx, and most reverse proxies.
 */
export function getClientIp(request: Request): string {
  const isValidIp = (ip: string): boolean => {
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    if (ipv4Pattern.test(ip)) {
      return ip.split(".").every((o) => {
        const n = parseInt(o, 10);
        return n >= 0 && n <= 255;
      });
    }
    return ipv6Pattern.test(ip);
  };

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp && isValidIp(firstIp)) return firstIp;
  }

  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp && isValidIp(cfIp)) return cfIp;

  const realIp = request.headers.get("x-real-ip");
  if (realIp && isValidIp(realIp)) return realIp;

  return "unknown";
}

// Pre-configured rate limiters for common use cases
export const rateLimiters = {
  /** Password reset: 5 requests per hour per IP */
  passwordReset: {
    limit: RATE_LIMIT_PASSWORD_RESET_COUNT,
    windowMs: RATE_LIMIT_PASSWORD_RESET_WINDOW_MS,
  },
  /** Login: 10 requests per 15 minutes per IP */
  login: { limit: RATE_LIMIT_LOGIN_COUNT, windowMs: RATE_LIMIT_LOGIN_WINDOW_MS },
  /** API general: 100 requests per minute per IP */
  api: { limit: RATE_LIMIT_API_COUNT, windowMs: RATE_LIMIT_API_WINDOW_MS },
  /** Password change: 3 requests per hour per user */
  passwordChange: {
    limit: RATE_LIMIT_PASSWORD_CHANGE_COUNT,
    windowMs: RATE_LIMIT_PASSWORD_CHANGE_WINDOW_MS,
  },
  /** Invitation accept: 5 requests per hour per IP */
  invitationAccept: {
    limit: RATE_LIMIT_INVITATION_ACCEPT_COUNT,
    windowMs: RATE_LIMIT_INVITATION_ACCEPT_WINDOW_MS,
  },
  /** TOTP setup: 5 requests per hour per user */
  totpSetup: { limit: RATE_LIMIT_TOTP_SETUP_COUNT, windowMs: RATE_LIMIT_TOTP_SETUP_WINDOW_MS },
  /** Invitation create: 10 requests per hour per user */
  invitationCreate: {
    limit: RATE_LIMIT_INVITATION_CREATE_COUNT,
    windowMs: RATE_LIMIT_INVITATION_CREATE_WINDOW_MS,
  },
};
