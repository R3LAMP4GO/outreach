/**
 * Auto-reply detection module
 * Detects out-of-office and vacation responders
 */

/**
 * Headers that indicate an auto-reply
 */
const AUTO_REPLY_HEADERS: Record<string, string[]> = {
  "Auto-Submitted": ["auto-replied", "auto-generated"],
  "X-Auto-Response-Suppress": ["All", "OOF", "AutoReply"],
  "X-Autoreply": ["yes"],
  "X-Autorespond": ["yes"],
  Precedence: ["auto_reply", "bulk"],
  "X-Out-Of-Office": ["yes"],
};

/**
 * Subject patterns that indicate an auto-reply
 */
const AUTO_REPLY_SUBJECT_PATTERNS: RegExp[] = [
  /^(out of|out-of-|away from)?\s*(office|the office)/i,
  /^auto(matic)? reply/i,
  /^away message/i,
  /^vacation/i,
  /delivery (status )?notification/i,
  /currently (out|away|unavailable)/i,
  /^re:\s*(out of|away|vacation)/i,
];

/**
 * Checks if an email is an auto-reply based on headers and subject
 *
 * @param headers - Email headers as key-value pairs
 * @param subject - Email subject line
 * @returns True if auto-reply detected
 *
 * @example
 * ```typescript
 * const headers = { 'Auto-Submitted': 'auto-replied' }
 * const subject = 'Out of Office'
 * const isAuto = isAutoReply(headers, subject) // Returns: true
 * ```
 */
export function isAutoReply(headers: Record<string, string>, subject: string): boolean {
  // Check headers first (most reliable)
  for (const [header, values] of Object.entries(AUTO_REPLY_HEADERS)) {
    const headerValue = headers[header]?.toLowerCase();
    if (headerValue && values.some((v) => headerValue.includes(v.toLowerCase()))) {
      return true;
    }
  }

  // Check subject patterns
  return AUTO_REPLY_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject));
}
