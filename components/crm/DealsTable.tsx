"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  ColumnDef,
  flexRender,
} from "@tanstack/react-table";
import { Card, CardContent, CardHeader } from "@/components/shadcn/ui/card";
import { Input } from "@/components/shadcn/ui/input";
import { Button } from "@/components/shadcn/ui/button";
import { Badge } from "@/components/shadcn/ui/badge";
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
import { IconSearch, IconArrowUp, IconArrowDown } from "@tabler/icons-react";
import { DealsBulkActions } from "./DealsBulkActions";
import { formatCurrency, formatDateTime } from "@/lib/utils";

interface Deal {
  id: string;
  name: string;
  amount: number | null;
  probability: number | null;
  source: string;
  created_at: string;
  updated_at: string | null;
  stage_entered_at: string | null;
  meeting_booked_at: string | null;
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    contact_status: string | null;
  } | null;
  stage: {
    id: string;
    name: string;
    slug: string;
    color: string | null;
  };
}

interface DealsTableProps {
  onDealClick?: (dealId: string) => void;
}

export function DealsTable({ onDealClick }: DealsTableProps) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<{ slug: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStage, setSelectedStage] = useState<string>("all");
  const [selectedPipeline, setSelectedPipeline] = useState("sales-pipeline");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [limit, setLimit] = useState(20);

  const selectedDealIds = useMemo(() => {
    return Object.keys(rowSelection).filter((id) => rowSelection[id]);
  }, [rowSelection]);

  const columns = useMemo<ColumnDef<Deal>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            className="rounded border-border"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="rounded border-border"
          />
        ),
      },
      {
        accessorKey: "name",
        header: "Deal Name",
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
      },
      {
        accessorKey: "contact.name",
        header: "Contact",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.contact
              ? [row.original.contact.first_name, row.original.contact.last_name]
                  .filter(Boolean)
                  .join(" ") || row.original.contact.email
              : "—"}
          </span>
        ),
      },
      {
        accessorKey: "stage.name",
        header: "Stage",
        cell: ({ row }) => {
          const stage = row.original.stage;
          const bgColor = stage.color || "#6b7280";

          return (
            <Badge className="text-white border-0" style={{ backgroundColor: bgColor }}>
              {stage.name}
            </Badge>
          );
        },
      },
      {
        accessorKey: "meeting_booked_at",
        header: "Booking Date",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDateTime(row.original.meeting_booked_at)}
          </span>
        ),
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => {
          const amount = row.original.amount;
          if (!amount) return <span className="text-muted-foreground">—</span>;
          return <span className="font-medium text-foreground">{formatCurrency(amount)}</span>;
        },
      },
      {
        accessorKey: "probability",
        header: "Probability",
        cell: ({ row }) => {
          const prob = row.original.probability;
          if (prob === null) return <span className="text-muted-foreground">—</span>;
          return <span className="text-muted-foreground">{prob}%</span>;
        },
      },
      {
        accessorKey: "source",
        header: "Source",
        cell: ({ row }) => {
          const getSourceLabel = (source: string) => {
            const labels: Record<string, string> = {
              contact_form: "Form",
              form_submission: "Form",
              newsletter: "Newsletter",
              newsletter_signup: "Newsletter",
              cal_com: "Cal.com",
              outreach: "Outreach",
              manual: "Manual",
              n8n_import: "N8N Import",
            };
            return (
              labels[source] || source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
            );
          };

          return (
            <Badge className="bg-gray-100 text-gray-600 border-0 dark:bg-gray-800 dark:text-gray-300">
              {getSourceLabel(row.original.source)}
            </Badge>
          );
        },
      },
      {
        accessorKey: "stage_entered_at",
        header: "Days in Stage",
        cell: ({ row }) => {
          if (!row.original.stage_entered_at)
            return <span className="text-muted-foreground">—</span>;

          const enteredAt = new Date(row.original.stage_entered_at);
          const now = new Date();
          const days = Math.floor((now.getTime() - enteredAt.getTime()) / (1000 * 60 * 60 * 24));

          return <span className="text-sm text-muted-foreground">{days}d</span>;
        },
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDateTime(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: "updated_at",
        header: "Last Updated",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDateTime(row.original.updated_at)}
          </span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: deals,
    columns,
    state: {
      sorting,
      rowSelection,
    },
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
  });

  const fetchDeals = useCallback(async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams({
        pipeline: selectedPipeline,
        page: page.toString(),
        limit: limit.toString(),
      });

      if (searchQuery) params.append("search", searchQuery);
      if (selectedStage !== "all") params.append("stage", selectedStage);

      const response = await fetch(`/api/crm/deals?${params}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Failed to fetch deals (${response.status})`);
      }

      const data = await response.json();
      setDeals(data.deals || []);
      setTotalCount(data.total || 0);
    } catch (err) {
      console.error("Error fetching deals:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedPipeline, page, limit, searchQuery, selectedStage]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchDeals();
    }, 300); // Debounce search

    return () => clearTimeout(timeout);
  }, [fetchDeals]);

  // Fetch stages dynamically for the filter dropdown
  useEffect(() => {
    const fetchStages = async () => {
      try {
        const response = await fetch(`/api/crm/pipeline-deals?pipeline=${selectedPipeline}`);
        if (response.ok) {
          const data = await response.json();
          setStages(data.stages || []);
        }
      } catch {
        // Non-critical - dropdown will just be empty
      }
    };
    fetchStages();
  }, [selectedPipeline]);

  const handleBulkAction = () => {
    // Refresh table after bulk action
    fetchDeals();
    setRowSelection({});
  };

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <Card>
      <CardHeader>
        {/* Filters */}
        <div className="flex items-center gap-3 mt-4">
          <div className="relative flex-1">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search deals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sales-pipeline">Sales Pipeline</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedStage} onValueChange={setSelectedStage}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {stages.map((stage) => (
                <SelectItem key={stage.slug} value={stage.slug}>
                  {stage.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {/* Bulk Actions */}
        {selectedDealIds.length > 0 && (
          <DealsBulkActions selectedDealIds={selectedDealIds} onActionComplete={handleBulkAction} />
        )}

        {/* Table */}
        <div className="border border-border rounded-lg overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="bg-muted/50 hover:bg-muted/50">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="text-center">
                      {header.isPlaceholder ? null : (
                        <div
                          className={
                            header.column.getCanSort()
                              ? "cursor-pointer select-none flex items-center justify-center gap-2"
                              : "flex justify-center"
                          }
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === "asc" && (
                            <IconArrowUp className="h-3 w-3" />
                          )}
                          {header.column.getIsSorted() === "desc" && (
                            <IconArrowDown className="h-3 w-3" />
                          )}
                        </div>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="text-center text-muted-foreground py-8"
                  >
                    Loading deals...
                  </TableCell>
                </TableRow>
              ) : deals.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="text-center text-muted-foreground py-8"
                  >
                    No deals found
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => onDealClick?.(row.original.id)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className="text-sm text-center"
                        onClick={(e) => {
                          if (cell.column.id === "select") {
                            e.stopPropagation();
                          }
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Showing {totalCount > 0 ? (page - 1) * limit + 1 : 0} to{" "}
              {Math.min(page * limit, totalCount)} of {totalCount} deals
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows per page</span>
              <Select
                value={limit.toString()}
                onValueChange={(v) => {
                  setLimit(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[70px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
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
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
