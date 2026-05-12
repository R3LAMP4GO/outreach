import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date string as a short date + time (e.g. "Feb 18 3:45 PM").
 * Returns an em dash for null/undefined/invalid input.
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

/**
 * Format currency value in compact notation (e.g., $5K, $1.2M)
 */
export function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}
