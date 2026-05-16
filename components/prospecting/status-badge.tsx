/**
 * Status badges for the prospecting list.
 *
 * Colours mirror the patterns used in `app/admin/(dashboard)/crm/leads/page.tsx`
 * and `app/admin/(dashboard)/outreach/campaigns/page.tsx` so the prospecting
 * page reads as a sibling of those tables, not a cousin. Backgrounds are the
 * `*-100` shade in light mode and `*-900/50` in dark mode, matching the
 * existing badge tone.
 *
 * The `generating` report status gets `animate-status-pulse` — defined in
 * `app/globals.css` per the project rule that all keyframes live in CSS, not
 * inline.
 */

import { Badge } from "@/components/shadcn/ui/badge";
import { cn } from "@/components/shadcn/lib/utils";

// ---------------------------------------------------------------------------
// Outreach stage
// ---------------------------------------------------------------------------

const STAGE_CLASSES: Record<string, string> = {
  new: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  emailed: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  called: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  phone_captured: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300",
  email_captured: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
  booked: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
};

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  emailed: "Emailed",
  called: "Called",
  phone_captured: "Phone captured",
  email_captured: "Email captured",
  booked: "Booked",
};

function humaniseStage(value: string): string {
  return STAGE_LABELS[value] ?? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface ProspectStageBadgeProps {
  stage: string;
  className?: string;
}

export function ProspectStageBadge({ stage, className }: ProspectStageBadgeProps) {
  const tone =
    STAGE_CLASSES[stage] ?? "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200";

  return (
    <Badge className={cn("border-0 capitalize", tone, className)}>{humaniseStage(stage)}</Badge>
  );
}

// ---------------------------------------------------------------------------
// SEO report status
// ---------------------------------------------------------------------------

const REPORT_CLASSES: Record<string, string> = {
  pending: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  generating:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 animate-status-pulse",
  ready: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
};

const REPORT_LABELS: Record<string, string> = {
  pending: "Pending",
  generating: "Generating",
  ready: "Ready",
  failed: "Failed",
};

export interface ReportStatusBadgeProps {
  status: string;
  className?: string;
}

export function ReportStatusBadge({ status, className }: ReportStatusBadgeProps) {
  const tone =
    REPORT_CLASSES[status] ?? "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
  const label = REPORT_LABELS[status] ?? status;

  return <Badge className={cn("border-0 capitalize", tone, className)}>{label}</Badge>;
}
