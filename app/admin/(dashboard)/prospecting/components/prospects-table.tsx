"use client";

/**
 * Client table for the prospecting list.
 *
 * Server-side pagination + filtering — this component receives `rows` and
 * `total` from the server page and only owns column rendering. Pagination
 * controls navigate via URL search params, the same channel the filter bar
 * uses, so Back/Forward + shareable URLs both work.
 *
 * Visual rhythm (border, header tone, hover, cell padding) mirrors the
 * leads page so this reads as a sibling table.
 */

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/shadcn/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/ui/avatar";
import { ProspectStageBadge, ReportStatusBadge } from "@/components/prospecting/status-badge";
import type { ProspectListRow } from "@/lib/prospects/queries";

interface ProspectsTableProps {
  rows: ProspectListRow[];
  total: number;
  page: number;
  limit: number;
}

function initials(name: string | null, email: string | null): string {
  const source = (name?.trim() || email?.trim() || "").trim();
  if (!source) return "·";
  const parts = source.split(/\s+/);
  const letters =
    parts.length >= 2 ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}` : (source[0] ?? "");
  return letters.toUpperCase();
}

function formatRelativeTouched(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return formatDistanceToNow(d, { addSuffix: true });
}

export function ProspectsTable({ rows, total, page, limit }: ProspectsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const columns = useMemo<ColumnDef<ProspectListRow>[]>(
    () => [
      {
        accessorKey: "businessName",
        header: "Business",
        cell: ({ row }) => (
          <div className="flex flex-col items-center">
            <Link
              href={`/admin/prospecting/${row.original.id}`}
              className="font-medium text-foreground hover:text-primary hover:underline underline-offset-4"
            >
              {row.original.businessName}
            </Link>
            {row.original.website && (
              <span className="text-xs text-muted-foreground truncate max-w-xs">
                {row.original.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => {
          const phone = row.original.phone;
          if (!phone) return <span className="text-muted-foreground">—</span>;
          return (
            <a
              href={`tel:${phone.replace(/\s+/g, "")}`}
              className="text-sm text-foreground hover:text-primary hover:underline underline-offset-4"
              onClick={(e) => e.stopPropagation()}
            >
              {phone}
            </a>
          );
        },
      },
      {
        id: "location",
        header: "Location",
        cell: ({ row }) => {
          const { city, state } = row.original;
          const text = [city, state].filter(Boolean).join(", ");
          return <span className="text-sm text-muted-foreground">{text || "—"}</span>;
        },
      },
      {
        accessorKey: "outreachStage",
        header: "Stage",
        cell: ({ row }) => <ProspectStageBadge stage={row.original.outreachStage} />,
      },
      {
        accessorKey: "seoReportStatus",
        header: "Report",
        cell: ({ row }) => <ReportStatusBadge status={row.original.seoReportStatus} />,
      },
      {
        accessorKey: "lastTouchedAt",
        header: "Last touched",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatRelativeTouched(row.original.lastTouchedAt)}
          </span>
        ),
      },
      {
        accessorKey: "assignedUserName",
        header: "Assigned",
        cell: ({ row }) => {
          if (!row.original.assignedUserId) {
            return <span className="text-sm text-muted-foreground">—</span>;
          }
          const name = row.original.assignedUserName;
          const email = row.original.assignedUserEmail;
          const label = name || email || "Assigned";
          return (
            <div className="flex items-center justify-center gap-2" title={label}>
              <Avatar className="size-7">
                {row.original.assignedUserAvatarUrl && (
                  <AvatarImage src={row.original.assignedUserAvatarUrl} alt={label} />
                )}
                <AvatarFallback className="text-xs">{initials(name, email)}</AvatarFallback>
              </Avatar>
            </div>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  const buildPageUrl = (nextPage: number, nextLimit?: number): string => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) {
      params.delete("page");
    } else {
      params.set("page", nextPage.toString());
    }
    if (nextLimit && nextLimit !== 50) {
      params.set("limit", nextLimit.toString());
    } else if (nextLimit) {
      params.delete("limit");
    }
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const handlePageSizeChange = (value: string) => {
    const nextLimit = Number(value);
    router.replace(buildPageUrl(1, nextLimit));
  };

  return (
    <div className="space-y-4">
      <div className="border border-border rounded-lg overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/50 hover:bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-center">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-muted-foreground py-8"
                >
                  No prospects match these filters
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="text-sm text-center">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination — mirrors the leads/campaigns tables. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="text-sm text-muted-foreground">
            Showing {start} to {end} of {total} prospects
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page</span>
            <Select value={limit.toString()} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="w-[70px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            asChild={page > 1}
            className="flex-1 sm:flex-none"
          >
            {page > 1 ? <Link href={buildPageUrl(page - 1)}>Previous</Link> : <span>Previous</span>}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            asChild={page < totalPages}
            className="flex-1 sm:flex-none"
          >
            {page < totalPages ? (
              <Link href={buildPageUrl(page + 1)}>Next</Link>
            ) : (
              <span>Next</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
