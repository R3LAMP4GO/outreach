/**
 * Server-rendered counters for the prospecting header.
 *
 * Renders as a single dotted line ("12 ready to call · 3 reports failed ·
 * 5 follow-ups today") to match the lightweight tone of the leads and
 * campaigns pages — no extra cards or shadows, just supporting text.
 *
 * "Reports failed" tints red so admins can spot regression at a glance; the
 * other two stay muted.
 */

import { getProspectingStats } from "@/lib/prospects/queries";
import { cn } from "@/components/shadcn/lib/utils";

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export async function ProspectingStatsBar({ className }: { className?: string }) {
  const { readyToCall, reportsFailed, followUpsToday } = await getProspectingStats();

  return (
    <p
      className={cn(
        "text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1",
        className,
      )}
    >
      <span>{plural(readyToCall, "ready to call", "ready to call")}</span>
      <span aria-hidden="true">·</span>
      <span
        className={reportsFailed > 0 ? "text-red-600 dark:text-red-400 font-medium" : undefined}
      >
        {plural(reportsFailed, "report failed", "reports failed")}
      </span>
      <span aria-hidden="true">·</span>
      <span>{plural(followUpsToday, "follow-up today", "follow-ups today")}</span>
    </p>
  );
}
