"use client";

/**
 * SEO report card on the prospect cockpit.
 *
 * Four visual states, driven by `seoReportStatus`:
 *   - 'ready'      \u2192 embed via `<iframe>` + "Open in new tab" + "Regenerate"
 *   - 'generating' \u2192 pulse animation + "Generating\u2026" copy
 *   - 'failed'     \u2192 red callout with `seoReportError` + "Retry"
 *   - 'pending'    \u2192 "Queued for generation" + "Run now"
 *
 * Both "Regenerate" and "Run now" POST to `/regenerate-report`, which flips
 * status back to `pending` and re-enqueues the pg-boss job. We
 * `router.refresh()` after so the badge re-renders from server state.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconExternalLink,
  IconRefresh,
  IconFileSearch,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { Button } from "@/components/shadcn/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shadcn/ui/card";
import { ReportStatusBadge } from "@/components/prospecting/status-badge";

interface SeoReportCardProps {
  prospectId: string;
  status: string;
  reportUrl: string | null;
  reportError: string | null;
}

export function SeoReportCard({ prospectId, status, reportUrl, reportError }: SeoReportCardProps) {
  const router = useRouter();
  const [regenerating, setRegenerating] = useState(false);

  const handleRegenerate = async () => {
    try {
      setRegenerating(true);
      const response = await fetch(`/api/admin/prospects/${prospectId}/regenerate-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(data.error ?? "Failed to enqueue regeneration");
        return;
      }
      toast.success("Report queued for regeneration");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to enqueue regeneration");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <IconFileSearch className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">SEO report</CardTitle>
          <ReportStatusBadge status={status} />
        </div>
        {status === "ready" && (
          <div className="flex items-center gap-2">
            {reportUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={reportUrl} target="_blank" rel="noopener noreferrer">
                  <IconExternalLink className="h-4 w-4 mr-1" />
                  Open
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={regenerating}>
              <IconRefresh className="h-4 w-4 mr-1" />
              {regenerating ? "Queuing\u2026" : "Regenerate"}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {status === "ready" && reportUrl && (
          <div className="border border-border rounded-lg overflow-hidden bg-muted/30">
            <iframe
              src={reportUrl}
              title="SEO report"
              className="w-full h-[600px]"
              sandbox="allow-same-origin allow-scripts allow-popups"
            />
          </div>
        )}
        {status === "ready" && !reportUrl && (
          <p className="text-sm text-muted-foreground">
            Report marked ready but no URL on file. Try Regenerate.
          </p>
        )}
        {status === "generating" && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-6 animate-status-pulse">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <p className="text-sm text-muted-foreground">
              Generating SEO report\u2026 this can take a few minutes.
            </p>
          </div>
        )}
        {status === "failed" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/30 dark:border-red-700 p-4">
              <div className="flex items-start gap-2">
                <IconAlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    SEO report failed
                  </p>
                  {reportError && (
                    <p className="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap break-words">
                      {reportError}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={regenerating}>
              <IconRefresh className="h-4 w-4 mr-1" />
              {regenerating ? "Retrying\u2026" : "Retry"}
            </Button>
          </div>
        )}
        {status === "pending" && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-4">
            <p className="text-sm text-muted-foreground">
              Queued for generation. The worker will pick it up shortly.
            </p>
            <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={regenerating}>
              <IconRefresh className="h-4 w-4 mr-1" />
              {regenerating ? "Queuing\u2026" : "Run now"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
