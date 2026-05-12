/**
 * Scheduling module types
 */

import type { BusinessHoursConfig } from "../types/config";

export type { BusinessHoursConfig };

/**
 * Next send time calculation result
 */
export interface NextSendTime {
  date: Date;
  timezone: string;
  isBusinessHour: boolean;
}
