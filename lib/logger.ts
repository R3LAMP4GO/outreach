/**
 * Production-safe logger utility
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.debug('Debug info:', data) // Only logs in development
 *   logger.info('Info message:', data) // Logs in non-test environments
 *   logger.warn('Warning message:', data) // Logs in non-test environments
 *   logger.error('Error occurred:', error) // Always logs, sanitized in production
 */

interface LoggerContext {
  [key: string]: unknown;
}

/**
 * Sanitizes data for production logging
 * Removes sensitive information like passwords, tokens, API keys
 */
function sanitizeForProduction(data: unknown[]): string {
  return data
    .map((item) => {
      if (typeof item === "string") {
        // Redact common sensitive patterns
        return item
          .replace(/("password"?:\s*")[^"]*"/gi, '$1***"')
          .replace(/("token"?:\s*")[^"]*"/gi, '$1***"')
          .replace(/("apiKey"?:\s*")[^"]*"/gi, '$1***"')
          .replace(/("secret"?:\s*")[^"]*"/gi, '$1***"')
          .replace(/(sb_secret_[a-zA-Z0-9]+)/g, "***")
          .replace(/(sk-[a-zA-Z0-9_-]+)/g, "***")
          .replace(/(re_[a-zA-Z0-9_-]+)/g, "***")
          .replace(/(whsec_[a-zA-Z0-9]+)/g, "***")
          .replace(/(AKIA[0-9A-Z]{16})/g, "***")
          .replace(/(AIza[0-9A-Za-z_-]{20,})/g, "***")
          .replace(
            /(eyJ[A-Za-z0-9_-]{10,})\.([A-Za-z0-9_-]{10,})\.([A-Za-z0-9_-]{10,})/g,
            "***.***.***",
          )
          .replace(/(postgres(?:ql)?:\/\/)([^:@\s]+):([^@\s]+)@/g, "$1$2:***@")
          .replace(/([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, "***@$2")
          .replace(/(Bearer [a-zA-Z0-9\-._~+/]+=*)/g, "Bearer ***");
      }

      if (typeof item === "object" && item !== null) {
        // Redact sensitive keys in objects
        const sanitized = { ...item };
        const sensitiveKeys = ["password", "token", "apiKey", "secret", "authorization"];

        for (const key of sensitiveKeys) {
          if (key in sanitized) {
            (sanitized as Record<string, unknown>)[key] = "***";
          }
        }

        return JSON.stringify(sanitized);
      }

      return String(item);
    })
    .join(" ");
}

/**
 * Logger class with environment-aware logging
 */
class Logger {
  private isDevelopment: boolean;
  private isTest: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === "development";
    this.isTest = process.env.NODE_ENV === "test";
  }

  /**
   * Debug level - only logs in development
   */
  debug(...args: unknown[]): void {
    if (this.isDevelopment) {
      console.log("[DEBUG]", ...args);
    }
  }

  /**
   * Info level - logs in non-test environments
   */
  info(...args: unknown[]): void {
    if (!this.isTest) {
      console.info("[INFO]", ...args);
    }
  }

  /**
   * Warning level - logs in non-test environments
   */
  warn(...args: unknown[]): void {
    if (!this.isTest) {
      console.warn("[WARN]", ...args);
    }
  }

  /**
   * Error level - always logs, but sanitizes in production
   */
  error(...args: unknown[]): void {
    if (this.isDevelopment || this.isTest) {
      console.error("[ERROR]", ...args);
    } else {
      // Production: sanitize sensitive data
      const sanitized = sanitizeForProduction(args);
      console.error("[ERROR]", sanitized);
    }
  }

  /**
   * Log with context (useful for structured logging)
   */
  withContext(context: LoggerContext) {
    return {
      debug: (...args: unknown[]) => this.debug(...args, context),
      info: (...args: unknown[]) => this.info(...args, context),
      warn: (...args: unknown[]) => this.warn(...args, context),
      error: (...args: unknown[]) => this.error(...args, context),
    };
  }
}

// Singleton instance
export const logger = new Logger();

/**
 * Convenience function for logging errors in API routes
 * Automatically handles error serialization
 */
export function logApiError(endpoint: string, error: unknown, context?: LoggerContext): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  logger.error(`[${endpoint}]`, errorMessage, context || "", {
    ...(errorStack && { stack: errorStack }),
  });
}
