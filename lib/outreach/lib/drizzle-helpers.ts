/**
 * Helpers for converting between Drizzle's camelCase column names
 * and the snake_case types expected by the outreach module.
 *
 * Drizzle schema columns use camelCase (e.g., `campaignId`, `nextSendAt`),
 * but the outreach types (Campaign, Contact, etc.) were originally generated
 * and use snake_case (e.g., `campaign_id`, `next_send_at`).
 */

/**
 * Convert a camelCase key to snake_case.
 * e.g., "campaignId" → "campaign_id", "email1SentAt" → "email_1_sent_at"
 */
function camelToSnake(str: string): string {
  return str
    .replace(/([a-z])(\d)/g, "$1_$2") // letter followed by digit: "email1" → "email_1"
    .replace(/(\d)([A-Z])/g, "$1_$2") // digit followed by uppercase: "1S" → "1_S"
    .replace(/([a-z])([A-Z])/g, "$1_$2") // lowercase followed by uppercase
    .toLowerCase();
}

/**
 * Convert a single Drizzle row (camelCase keys) to a snake_case object.
 */
export function toSnakeCase<T>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[camelToSnake(key)] = value;
  }
  return result as T;
}

/**
 * Convert an array of Drizzle rows to snake_case objects.
 */
export function toSnakeCaseArray<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map((row) => toSnakeCase<T>(row));
}

/**
 * Convert a snake_case updates object to camelCase keys for Drizzle's .set().
 * e.g., { campaign_id: "x", next_send_at: "y" } → { campaignId: "x", nextSendAt: "y" }
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

export function toCamelCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[snakeToCamel(key)] = value;
  }
  return result;
}
