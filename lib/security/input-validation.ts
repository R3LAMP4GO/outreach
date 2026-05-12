import { z } from "zod";

// ============================================================
// PostgreSQL LIKE Pattern Escaping
// ============================================================

/**
 * Escapes special characters in a string for use in PostgreSQL LIKE/ILIKE patterns.
 * The special characters are: % (wildcard), _ (single char), and \ (escape char).
 * The backslash must be escaped first to avoid double-escaping.
 */
export function escapeForPostgresLike(input: string): string {
  return input
    .replace(/\\/g, "\\\\") // escape backslash first
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Sanitizes a user-provided search query for safe use in SQL ILIKE filters.
 * - Trims whitespace
 * - Escapes PostgreSQL LIKE special characters (%, _, \)
 * - Limits length to prevent overly long queries
 * - Returns empty string for empty/whitespace-only input
 */
export function sanitizeSearchQuery(input: string, maxLength: number = 200): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return "";
  }

  const truncated = trimmed.slice(0, maxLength);
  return escapeForPostgresLike(truncated);
}

/**
 * Escapes characters that are significant in PostgREST filter syntax.
 * Commas separate filter conditions, periods separate field.operator.value.
 * Use this when interpolating user input into .or() filter strings.
 */
export function escapeForPostgrestFilter(input: string): string {
  // Commas and periods are PostgREST syntax - escape them
  return input.replace(/,/g, "\\,").replace(/\./g, "\\.");
}

/**
 * Fully sanitizes a search query for use in PostgREST .or() filter strings.
 * Applies both PostgreSQL LIKE escaping and PostgREST filter syntax escaping.
 */
export function sanitizeSearchForOrFilter(input: string, maxLength: number = 200): string {
  const sanitized = sanitizeSearchQuery(input, maxLength);
  if (!sanitized) return "";
  return escapeForPostgrestFilter(sanitized);
}

// ============================================================
// Pagination Validation
// ============================================================

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).default(20).catch(20),
});

const offsetPaginationSchema = z.object({
  offset: z.coerce.number().int().min(0).default(0).catch(0),
  limit: z.coerce.number().int().min(1).max(100).default(50).catch(50),
});

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface OffsetPaginationParams {
  offset: number;
  limit: number;
}

/**
 * Validates and sanitizes page-based pagination parameters.
 * - page: integer >= 1 (default: 1)
 * - limit: integer 1-100 (default: 20)
 * Invalid values fall back to defaults instead of throwing.
 */
export function validatePaginationParams(
  page: string | number | null | undefined,
  limit: string | number | null | undefined,
  defaults?: { page?: number; limit?: number },
): PaginationParams {
  const defaultPage = defaults?.page ?? 1;
  const defaultLimit = defaults?.limit ?? 20;

  const result = paginationSchema.parse({
    page: page ?? defaultPage,
    limit: limit ?? defaultLimit,
  });

  return result;
}

/**
 * Validates and sanitizes offset-based pagination parameters.
 * - offset: integer >= 0 (default: 0)
 * - limit: integer 1-100 (default: 50)
 * Invalid values fall back to defaults instead of throwing.
 */
export function validateOffsetPaginationParams(
  offset: string | number | null | undefined,
  limit: string | number | null | undefined,
  defaults?: { offset?: number; limit?: number },
): OffsetPaginationParams {
  const defaultOffset = defaults?.offset ?? 0;
  const defaultLimit = defaults?.limit ?? 50;

  const result = offsetPaginationSchema.parse({
    offset: offset ?? defaultOffset,
    limit: limit ?? defaultLimit,
  });

  return result;
}

/**
 * Converts page-based pagination to range params (start/end inclusive offsets).
 * Returns { from, to } for use with .range(from, to).
 */
export function paginationToRange(params: PaginationParams): {
  from: number;
  to: number;
} {
  const from = (params.page - 1) * params.limit;
  const to = from + params.limit - 1;
  return { from, to };
}
