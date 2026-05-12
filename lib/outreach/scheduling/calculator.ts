/**
 * Send time calculation utilities
 */

import { addDays } from "date-fns";
import { getNextBusinessHour, addRandomOffset, isBusinessHour } from "./business-hours";
import type { Contact } from "../types";
import type { BusinessHoursConfig } from "../types/config";
import { DEFAULT_TIMEZONE, DEFAULT_BUSINESS_HOURS } from "../types/config";

/**
 * Calculate the next send time for a contact based on delay and timezone
 *
 * @param contact - Contact with timezone information
 * @param delayDays - Number of days to delay
 * @param addRandom - Add random offset to appear more natural (default: true)
 * @returns Next send time in UTC
 *
 * @example
 * ```typescript
 * const nextSend = calculateNextSendTime(contact, 2, true)
 * // Returns a date 2 days from now, during business hours in contact's timezone
 * ```
 */
export function calculateNextSendTime(
  contact: Contact | { timezone?: string | null },
  delayDays: number,
  addRandom: boolean = true,
  businessHours?: BusinessHoursConfig,
): Date {
  const config = businessHours || DEFAULT_BUSINESS_HOURS;
  const timezone = config.timezone || contact.timezone || DEFAULT_TIMEZONE;
  const now = new Date();

  // Add delay days
  let targetDate = addDays(now, delayDays);

  // Ensure it's during business hours in recipient's timezone
  targetDate = getNextBusinessHour(targetDate, timezone, config);

  // Add random offset to make sending appear more natural
  if (addRandom) {
    // Calculate remaining business hours to avoid pushing to next day
    const hour = targetDate.getHours();
    const minute = targetDate.getMinutes();
    const businessHoursEnd = config.end;
    const remainingMinutes = (businessHoursEnd - hour) * 60 - minute;

    // Limit random offset to remaining business hours (max 60 minutes)
    const maxOffset = Math.min(60, Math.max(0, remainingMinutes - 1));

    if (maxOffset > 0) {
      targetDate = addRandomOffset(targetDate, maxOffset);
    }

    // Re-check business hours after adding random offset (defensive)
    if (!isBusinessHour(targetDate, timezone, config)) {
      targetDate = getNextBusinessHour(targetDate, timezone, config);
    }
  }

  return targetDate;
}

/**
 * Calculate next send time for Email 1 (immediate but during business hours)
 *
 * @param contact - Contact with timezone
 * @param addRandom - Add random offset
 * @returns Next send time for email 1
 */
export function calculateEmail1SendTime(
  contact: Contact | { timezone?: string | null },
  addRandom: boolean = true,
  businessHours?: BusinessHoursConfig,
): Date {
  return calculateNextSendTime(contact, 0, addRandom, businessHours);
}

/**
 * Calculate next send time for Email 2 (2 days after Email 1)
 *
 * @param contact - Contact with timezone
 * @param email2Delay - Days to delay (default: 2)
 * @param addRandom - Add random offset
 * @returns Next send time for email 2
 */
export function calculateEmail2SendTime(
  contact: Contact | { timezone?: string | null },
  email2Delay: number = 2,
  addRandom: boolean = true,
  businessHours?: BusinessHoursConfig,
): Date {
  return calculateNextSendTime(contact, email2Delay, addRandom, businessHours);
}

/**
 * Calculate next send time for Email 3 (called when Email 2 is sent)
 *
 * This is called at the moment Email 2 is sent, so only the delay from
 * Email 2 to Email 3 is needed (email2Delay has already elapsed).
 *
 * @param contact - Contact with timezone
 * @param email3Delay - Days from Email 2 to Email 3 (default: 5)
 * @param addRandom - Add random offset
 * @returns Next send time for email 3
 *
 * @example
 * // Default: 5 days after Email 2 is sent
 * calculateEmail3SendTime(contact) // now + 5 days
 *
 * // Custom: 3 days after Email 2 is sent
 * calculateEmail3SendTime(contact, 3) // now + 3 days
 */
export function calculateEmail3SendTime(
  contact: Contact | { timezone?: string | null },
  email3Delay: number = 5,
  addRandom: boolean = true,
  businessHours?: BusinessHoursConfig,
): Date {
  return calculateNextSendTime(contact, email3Delay, addRandom, businessHours);
}

/**
 * Batch calculate send times for multiple contacts
 *
 * @param contacts - Array of contacts
 * @param delayDays - Delay in days
 * @returns Map of contact ID to send time
 */
export function batchCalculateSendTimes(
  contacts: (Contact | { id: string; timezone?: string | null })[],
  delayDays: number,
): Map<string, Date> {
  const sendTimes = new Map<string, Date>();

  for (const contact of contacts) {
    const sendTime = calculateNextSendTime(contact, delayDays);
    sendTimes.set(contact.id, sendTime);
  }

  return sendTimes;
}

/**
 * Get the optimal send time spread across a day
 * Useful for batch scheduling to avoid sending all emails at once
 *
 * @param contactCount - Number of contacts to send to
 * @param timezone - Timezone for business hours
 * @returns Array of send times spread across business hours
 */
export function getOptimalSendTimeSpread(
  contactCount: number,
  timezone: string = DEFAULT_TIMEZONE,
): Date[] {
  const sendTimes: Date[] = [];
  const now = new Date();
  const baseTime = getNextBusinessHour(now, timezone);

  // Business hours are typically 8 hours (9am-5pm)
  const businessHoursDuration = 8 * 60; // in minutes
  const interval = Math.floor(businessHoursDuration / contactCount);

  for (let i = 0; i < contactCount; i++) {
    const sendTime = new Date(baseTime);
    sendTime.setMinutes(sendTime.getMinutes() + i * interval);

    // Add small random offset
    const randomOffset = Math.floor(Math.random() * 5); // 0-5 minutes
    sendTime.setMinutes(sendTime.getMinutes() + randomOffset);

    sendTimes.push(sendTime);
  }

  return sendTimes;
}
