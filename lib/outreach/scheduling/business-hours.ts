/**
 * Business hours and timezone utilities
 */

import { toZonedTime, fromZonedTime } from "date-fns-tz";
import type { BusinessHoursConfig } from "./types";
import { DEFAULT_BUSINESS_HOURS } from "../types/config";

/**
 * Map of day names to JS day numbers (0=Sunday, 1=Monday, ...)
 */
const DAY_NAME_TO_NUMBER: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

/**
 * Convert an outreach schedule (day names + "HH:mm" times) to BusinessHoursConfig
 *
 * @param schedule - Schedule with send_days as day name strings and HH:mm time windows
 * @returns BusinessHoursConfig compatible with isBusinessHour/getNextBusinessHour
 */
export function scheduleToBusinessHours(schedule: {
  send_days: string[];
  send_window_start: string;
  send_window_end: string;
  timezone?: string | null;
}): BusinessHoursConfig {
  const days = schedule.send_days
    .map((name) => DAY_NAME_TO_NUMBER[name])
    .filter((n): n is number => n !== undefined);

  const [startH, startM] = schedule.send_window_start.split(":").map(Number);
  const start = startH + (startM || 0) / 60;
  const [endH, endM] = schedule.send_window_end.split(":").map(Number);
  const end = endH + (endM || 0) / 60;

  return { start, end, days, ...(schedule.timezone ? { timezone: schedule.timezone } : {}) };
}

/**
 * Check if a date/time is within business hours in a specific timezone
 *
 * @param date - Date to check (can be in any timezone)
 * @param timezone - IANA timezone string (e.g., 'Australia/Perth')
 * @param config - Business hours configuration
 * @returns True if within business hours
 *
 * @example
 * ```typescript
 * const now = new Date()
 * const isOpen = isBusinessHour(now, 'Australia/Perth')
 * // Returns true if it's 9am-5pm Mon-Fri in Perth
 * ```
 */
export function isBusinessHour(
  date: Date,
  timezone: string,
  config: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS,
): boolean {
  // Convert to recipient's timezone
  const zonedDate = toZonedTime(date, timezone);

  const fractionalHour = zonedDate.getHours() + zonedDate.getMinutes() / 60;
  const day = zonedDate.getDay();

  // Check if day is a business day
  if (!config.days.includes(day)) {
    return false;
  }

  // Check if time is within business hours (supports fractional hours like 9.5 for 9:30)
  return fractionalHour >= config.start && fractionalHour < config.end;
}

/**
 * Get the next business hour from a given date in a timezone
 *
 * @param date - Starting date
 * @param timezone - IANA timezone string
 * @param config - Business hours configuration
 * @returns Next business hour date
 *
 * @example
 * ```typescript
 * const now = new Date()
 * const nextOpen = getNextBusinessHour(now, 'Australia/Perth')
 * // Returns the next time within 9am-5pm Mon-Fri in Perth
 * ```
 */
export function getNextBusinessHour(
  date: Date,
  timezone: string,
  config: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS,
): Date {
  const current = new Date(toZonedTime(date, timezone));

  // If already in business hours, return as-is
  if (isBusinessHour(fromZonedTime(current, timezone), timezone, config)) {
    return date;
  }

  // Maximum iterations to prevent infinite loop (14 days worth of hours)
  const maxIterations = 14 * 24;
  let iterations = 0;

  while (!isBusinessHour(fromZonedTime(current, timezone), timezone, config)) {
    if (iterations++ > maxIterations) {
      throw new Error("Could not find next business hour within 14 days");
    }

    const fractionalHour = current.getHours() + current.getMinutes() / 60;
    const day = current.getDay();
    const startHour = Math.floor(config.start);
    const startMinute = Math.round((config.start - startHour) * 60);

    // If before business hours on a business day, jump to start time
    if (config.days.includes(day) && fractionalHour < config.start) {
      current.setHours(startHour, startMinute, 0, 0);
      continue;
    }

    // If after business hours or on weekend, jump to next day
    current.setDate(current.getDate() + 1);
    current.setHours(startHour, startMinute, 0, 0);
  }

  // Convert back to UTC
  return fromZonedTime(current, timezone);
}

/**
 * Add randomness to send time (within 1 hour window) to appear more natural
 *
 * @param date - Base send time
 * @param maxMinutes - Maximum minutes to add (default: 60)
 * @returns Date with random offset
 *
 * @example
 * ```typescript
 * const baseTime = new Date()
 * const randomTime = addRandomOffset(baseTime, 30)
 * // Returns date with 0-30 minutes added
 * ```
 */
export function addRandomOffset(date: Date, maxMinutes: number = 60): Date {
  const randomMinutes = Math.floor(Math.random() * maxMinutes);
  const newDate = new Date(date);
  newDate.setMinutes(newDate.getMinutes() + randomMinutes);
  return newDate;
}

/**
 * Check if current time is within business hours for a timezone
 *
 * @param timezone - IANA timezone string
 * @param config - Business hours configuration
 * @returns True if current time is within business hours
 */
export function isCurrentlyBusinessHours(
  timezone: string,
  config: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS,
): boolean {
  return isBusinessHour(new Date(), timezone, config);
}

/**
 * Get the timezone offset in hours for a specific timezone
 *
 * @param timezone - IANA timezone string
 * @returns Offset in hours from UTC
 */
export function getTimezoneOffset(timezone: string): number {
  const now = new Date();
  const utcDate = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzDate = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60);
}

/**
 * Format a date in a specific timezone
 *
 * @param date - Date to format
 * @param timezone - IANA timezone string
 * @param format - Format string (default: ISO)
 * @returns Formatted date string
 */
export function formatInTimezone(
  date: Date,
  timezone: string,
  format: "iso" | "locale" = "iso",
): string {
  const zonedDate = toZonedTime(date, timezone);

  if (format === "locale") {
    return zonedDate.toLocaleString("en-US", { timeZone: timezone });
  }

  return zonedDate.toISOString();
}
