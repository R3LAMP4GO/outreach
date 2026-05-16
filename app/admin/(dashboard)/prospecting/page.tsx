/**
 * Prospecting list page (server component).
 *
 * Fetches the prospect list + the current admin session in parallel, then
 * hands the rows to a client `ProspectsTable` for column rendering and to a
 * client `ProspectsFilters` bar that pushes filter changes through URL
 * search params. The header counters (`ProspectingStatsBar`) are themselves
 * a server component so they share the same request scope as the page.
 *
 * Visual rhythm (header layout, container padding, badge tones, pagination)
 * mirrors `crm/leads/page.tsx` and `outreach/campaigns/page.tsx` so the page
 * reads as a sibling of those tables.
 */

import { Suspense } from "react";
import Link from "next/link";
import { IconUpload } from "@tabler/icons-react";

import { auth } from "@/lib/auth";
import { listProspects } from "@/lib/prospects/queries";
import { Button } from "@/components/shadcn/ui/button";
import { Card, CardContent, CardHeader } from "@/components/shadcn/ui/card";
import { ProspectingStatsBar } from "@/components/prospecting/stats-bar";

import { ProspectsFilters } from "./components/prospects-filters";
import { ProspectsTable } from "./components/prospects-table";

const DEFAULT_LIMIT = 50;
const ALLOWED_LIMITS = new Set([20, 50, 100]);

interface ProspectingPageProps {
  searchParams: Promise<{
    search?: string | string[];
    stage?: string | string[];
    reportStatus?: string | string[];
    assignedToMe?: string | string[];
    page?: string | string[];
    limit?: string | string[];
  }>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parsePage(value: string | undefined): number {
  if (!value) return 1;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

function parseLimit(value: string | undefined): number {
  if (!value) return DEFAULT_LIMIT;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || !ALLOWED_LIMITS.has(n)) return DEFAULT_LIMIT;
  return n;
}

export default async function ProspectingPage({ searchParams }: ProspectingPageProps) {
  const [session, params] = await Promise.all([auth(), searchParams]);

  const search = firstParam(params.search)?.trim() ?? "";
  const stage = firstParam(params.stage)?.trim() ?? "";
  const reportStatus = firstParam(params.reportStatus)?.trim() ?? "";
  const assignedToMe = firstParam(params.assignedToMe) === "1";
  const page = parsePage(firstParam(params.page));
  const limit = parseLimit(firstParam(params.limit));

  const assignedUserId = assignedToMe && session?.user?.id ? session.user.id : null;

  const { rows, total } = await listProspects({
    search: search || undefined,
    stage: stage || undefined,
    reportStatus: reportStatus || undefined,
    assignedUserId,
    page,
    limit,
  });

  const hasAnyFilter = Boolean(search || stage || reportStatus || assignedToMe);
  const isEmpty = total === 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Prospecting</h2>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading counters…</p>}>
            <ProspectingStatsBar />
          </Suspense>
        </div>
        <Button asChild>
          <Link href="/admin/prospecting/import">
            <IconUpload className="h-4 w-4 mr-2" />
            Import CSV
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <ProspectsFilters
            initialSearch={search}
            initialStage={stage || "all"}
            initialReportStatus={reportStatus || "all"}
            initialAssignedToMe={assignedToMe}
          />
        </CardHeader>

        <CardContent>
          {isEmpty && !hasAnyFilter ? (
            <EmptyState />
          ) : (
            <ProspectsTable rows={rows} total={total} page={page} limit={limit} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center space-y-4 py-12">
      <div className="rounded-full bg-muted p-3">
        <IconUpload className="w-6 h-6 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">No prospects yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Import a CSV to seed the pipeline. Each row queues an SEO report job in the background and
          shows up here.
        </p>
      </div>
      <Button asChild>
        <Link href="/admin/prospecting/import">
          <IconUpload className="w-4 h-4 mr-2" />
          Import CSV
        </Link>
      </Button>
    </div>
  );
}
