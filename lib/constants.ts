/**
 * Application-wide constants
 *
 * This file centralizes magic numbers used throughout the codebase.
 * All time-related constants are suffixed with their units (MS, SECONDS, MINUTES, HOURS, DAYS).
 * All limit/threshold constants are prefixed with their scope.
 */

// ============================================================================
// Time Constants (Milliseconds)
// ============================================================================

/** 1 second in milliseconds */
export const ONE_SECOND_MS = 1000;

/** 1 minute in milliseconds */
export const ONE_MINUTE_MS = 60 * 1000;

/** 1 hour in milliseconds */
export const ONE_HOUR_MS = 60 * 60 * 1000;

/** 1 day in milliseconds */
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** 1 week in milliseconds */
export const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ============================================================================
// Authentication & Security
// ============================================================================

/** Delay on failed login attempts (timing attack mitigation) */
export const FAILED_LOGIN_DELAY_MS = 1000;

/** Number of failed login attempts before account lockout */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;

/** Account lockout duration in milliseconds (15 minutes) */
export const ACCOUNT_LOCKOUT_DURATION_MS = 15 * ONE_MINUTE_MS;

/** Session max age in seconds (8 hours) */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/** Invitation token expiration (7 days) */
export const INVITATION_EXPIRY_MS = 7 * ONE_DAY_MS;

// ============================================================================
// Rate Limiting
// ============================================================================

/** Password reset: max requests per hour */
export const RATE_LIMIT_PASSWORD_RESET_COUNT = 5;
/** Password reset: time window in milliseconds */
export const RATE_LIMIT_PASSWORD_RESET_WINDOW_MS = ONE_HOUR_MS;

/** Login: max requests per 15 minutes */
export const RATE_LIMIT_LOGIN_COUNT = 10;
/** Login: time window in milliseconds */
export const RATE_LIMIT_LOGIN_WINDOW_MS = 15 * ONE_MINUTE_MS;

/** General API: max requests per minute */
export const RATE_LIMIT_API_COUNT = 100;
/** General API: time window in milliseconds */
export const RATE_LIMIT_API_WINDOW_MS = ONE_MINUTE_MS;

/** Password change: max requests per hour */
export const RATE_LIMIT_PASSWORD_CHANGE_COUNT = 3;
/** Password change: time window in milliseconds */
export const RATE_LIMIT_PASSWORD_CHANGE_WINDOW_MS = ONE_HOUR_MS;

/** Invitation accept: max requests per hour */
export const RATE_LIMIT_INVITATION_ACCEPT_COUNT = 5;
/** Invitation accept: time window in milliseconds */
export const RATE_LIMIT_INVITATION_ACCEPT_WINDOW_MS = ONE_HOUR_MS;

/** TOTP setup: max requests per hour */
export const RATE_LIMIT_TOTP_SETUP_COUNT = 5;
/** TOTP setup: time window in milliseconds */
export const RATE_LIMIT_TOTP_SETUP_WINDOW_MS = ONE_HOUR_MS;

/** Invitation create: max requests per hour */
export const RATE_LIMIT_INVITATION_CREATE_COUNT = 10;
/** Invitation create: time window in milliseconds */
export const RATE_LIMIT_INVITATION_CREATE_WINDOW_MS = ONE_HOUR_MS;

/** Newsletter generation: max requests per hour per user */
export const RATE_LIMIT_NEWSLETTER_GENERATE_COUNT = 5;
/** Newsletter generation: time window in milliseconds */
export const RATE_LIMIT_NEWSLETTER_GENERATE_WINDOW_MS = ONE_HOUR_MS;

/** Rate limit cleanup interval (in-memory store) */
export const RATE_LIMIT_CLEANUP_INTERVAL_MS = ONE_MINUTE_MS;

// ============================================================================
// Newsletter System
// ============================================================================

/** RSS feed rate limiter: max concurrent fetches */
export const RSS_RATE_LIMIT_CONCURRENT = 3;

/** RSS feed rate limiter: minimum time between requests per feed */
export const RSS_RATE_LIMIT_MIN_TIME_MS = 6000;

/** RSS feed rate limiter: max requests in window */
export const RSS_RATE_LIMIT_RESERVOIR = 10;

/** RSS feed rate limiter: window duration */
export const RSS_RATE_LIMIT_WINDOW_MS = ONE_MINUTE_MS;

/** RSS rate limiter: retry delay on failure */
export const RSS_RATE_LIMIT_RETRY_DELAY_MS = 5000;

/** Newsletter rate limiter: default requests per minute */
export const NEWSLETTER_RATE_LIMIT_REQUESTS_PER_MINUTE = 50;

/** Newsletter rate limiter: default tokens per minute */
export const NEWSLETTER_RATE_LIMIT_TOKENS_PER_MINUTE = 50000;

/** Newsletter rate limiter: default estimated tokens per request */
export const NEWSLETTER_RATE_LIMIT_DEFAULT_TOKENS = 2000;

/** Newsletter rate limiter: window duration */
export const NEWSLETTER_RATE_LIMIT_WINDOW_MS = 60 * 1000;

// ============================================================================
// Retry & Circuit Breaker
// ============================================================================

/** Default retry: max attempts */
export const RETRY_DEFAULT_MAX_ATTEMPTS = 3;

/** Default retry: initial delay */
export const RETRY_DEFAULT_INITIAL_DELAY_MS = 1000;

/** Default retry: max delay */
export const RETRY_DEFAULT_MAX_DELAY_MS = 30000;

/** Default retry: backoff multiplier */
export const RETRY_DEFAULT_BACKOFF_MULTIPLIER = 2;

/** Fast retry preset: max attempts */
export const RETRY_FAST_MAX_ATTEMPTS = 3;

/** Fast retry preset: initial delay */
export const RETRY_FAST_INITIAL_DELAY_MS = 500;

/** Fast retry preset: max delay */
export const RETRY_FAST_MAX_DELAY_MS = 5000;

/** Slow retry preset: max attempts */
export const RETRY_SLOW_MAX_ATTEMPTS = 5;

/** Slow retry preset: initial delay */
export const RETRY_SLOW_INITIAL_DELAY_MS = 2000;

/** Slow retry preset: max delay */
export const RETRY_SLOW_MAX_DELAY_MS = 60000;

/** Aggressive retry preset: max attempts */
export const RETRY_AGGRESSIVE_MAX_ATTEMPTS = 7;

/** Aggressive retry preset: initial delay */
export const RETRY_AGGRESSIVE_INITIAL_DELAY_MS = 1000;

/** Aggressive retry preset: max delay */
export const RETRY_AGGRESSIVE_MAX_DELAY_MS = 120000;

/** Circuit breaker: default failure threshold */
export const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;

/** Circuit breaker: default success threshold */
export const CIRCUIT_BREAKER_SUCCESS_THRESHOLD = 2;

/** Circuit breaker: default timeout before retry */
export const CIRCUIT_BREAKER_TIMEOUT_MS = 30000;

// ============================================================================
// Outreach System
// ============================================================================

/** Outreach: default batch size for processing due emails */
export const OUTREACH_BATCH_SIZE = 50;

/** Outreach: default sender daily limit (with 5 senders = 50 total/day) */
export const OUTREACH_SENDER_DAILY_LIMIT = 10;

/** Outreach: default delay for email 2 (days) */
export const OUTREACH_EMAIL_2_DELAY_DAYS = 2;

/** Outreach: default delay for email 3 (days after email 2) */
export const OUTREACH_EMAIL_3_DELAY_DAYS = 5;

/** Outreach: default minimum send interval (minutes) */
export const OUTREACH_MIN_SEND_INTERVAL_MINUTES = 7;

/** Outreach: default random send interval (minutes) */
export const OUTREACH_RANDOM_SEND_INTERVAL_MINUTES = 5;

/** Outreach: business hours start (24-hour format) */
export const OUTREACH_BUSINESS_HOURS_START = 9;

/** Outreach: business hours end (24-hour format) */
export const OUTREACH_BUSINESS_HOURS_END = 17;

/** Outreach: business days (0=Sunday, 1=Monday, etc.) */
export const OUTREACH_BUSINESS_DAYS = [1, 2, 3, 4, 5];

/** Outreach: default timezone */
export const OUTREACH_DEFAULT_TIMEZONE = "Australia/Perth";

/** Outreach: look-ahead hours for due summary */
export const OUTREACH_DUE_SUMMARY_HOURS = 24;

/** Outreach: bounce rate threshold (%) to auto-pause campaign */
export const OUTREACH_BOUNCE_RATE_PAUSE_THRESHOLD = 8;

/** Outreach: minimum emails sent before bounce rate check applies */
export const OUTREACH_BOUNCE_RATE_MIN_SAMPLE = 10;

/** Outreach: max soft bounces before treating as hard bounce */
export const OUTREACH_MAX_SOFT_BOUNCES = 3;

/** Outreach: soft bounce reschedule delay (minutes) */
export const OUTREACH_SOFT_BOUNCE_DELAY_MINUTES = 240;

/** Outreach: domain throttle reschedule delay (minutes) */
export const OUTREACH_DOMAIN_THROTTLE_DELAY_MINUTES = 20;

/** Outreach: max emails per domain per hour */
export const OUTREACH_MAX_EMAILS_PER_DOMAIN_PER_HOUR = 3;

/** Outreach: extra delay for enterprise security gateways (ms) */
export const OUTREACH_ENTERPRISE_GATEWAY_EXTRA_DELAY_MS = 120000;

// ============================================================================
// HTTP Status Codes (for reference)
// ============================================================================

/** HTTP 429: Too Many Requests */
export const HTTP_STATUS_TOO_MANY_REQUESTS = 429;

/** HTTP 500: Internal Server Error */
export const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;

/** HTTP 502: Bad Gateway */
export const HTTP_STATUS_BAD_GATEWAY = 502;

/** HTTP 503: Service Unavailable */
export const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;

/** HTTP 504: Gateway Timeout */
export const HTTP_STATUS_GATEWAY_TIMEOUT = 504;

/** Retryable HTTP status codes */
export const RETRYABLE_HTTP_STATUS_CODES = [
  HTTP_STATUS_TOO_MANY_REQUESTS,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  HTTP_STATUS_BAD_GATEWAY,
  HTTP_STATUS_SERVICE_UNAVAILABLE,
  HTTP_STATUS_GATEWAY_TIMEOUT,
];

// ============================================================================
// Jitter & Randomization
// ============================================================================

/** Retry jitter: max percentage of delay (0.2 = 20%) */
export const RETRY_JITTER_PERCENTAGE = 0.2;

/** Circuit breaker jitter: max percentage of delay (0.5 = 50%) */
export const CIRCUIT_BREAKER_JITTER_PERCENTAGE = 0.5;
