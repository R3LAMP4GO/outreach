/**
 * Structured logging
 *
 * Production-ready logger for newsletter content sources
 * Supports different log levels and structured data
 */

type LogLevel = "debug" | "info" | "warn" | "error";

class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = "info") {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  debug(data: object | string, message?: string): void {
    if (this.shouldLog("debug")) {
      console.debug(
        "[DEBUG]",
        typeof data === "string" ? data : message,
        typeof data === "object" ? data : "",
      );
    }
  }

  info(data: object | string, message?: string): void {
    if (this.shouldLog("info")) {
      console.info(
        "[INFO]",
        typeof data === "string" ? data : message,
        typeof data === "object" ? data : "",
      );
    }
  }

  warn(data: object | string, message?: string): void {
    if (this.shouldLog("warn")) {
      console.warn(
        "[WARN]",
        typeof data === "string" ? data : message,
        typeof data === "object" ? data : "",
      );
    }
  }

  error(data: object | string, message?: string): void {
    if (this.shouldLog("error")) {
      console.error(
        "[ERROR]",
        typeof data === "string" ? data : message,
        typeof data === "object" ? data : "",
      );
    }
  }
}

export const logger = new Logger((process.env.LOG_LEVEL as LogLevel) || "info");

// Helper functions for common logging patterns
export const logSourceFetchStart = (sourceName: string, feedUrl: string) => {
  logger.info({ source: sourceName, feedUrl }, `Fetching content from: ${sourceName}`);
};

export const logSourceFetchComplete = (
  sourceName: string,
  articleCount: number,
  duration?: number,
) => {
  logger.info(
    { source: sourceName, articleCount, duration },
    `Completed fetch from ${sourceName}: ${articleCount} articles`,
  );
};

export const logSourceFetchError = (sourceName: string, feedUrl: string, error: unknown) => {
  logger.error(
    {
      source: sourceName,
      feedUrl,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    },
    `Failed to fetch from ${sourceName}`,
  );
};

export const logRateLimitEvent = (event: string, details: Record<string, unknown>) => {
  logger.warn({ event, ...details }, `Rate limit event: ${event}`);
};
