"use client";

/**
 * Client filter bar for the prospecting list.
 *
 * Drives the page via URL search params so the server component stays the
 * source of truth for what's rendered. The search input debounces (300ms) to
 * match the leads/campaigns pages; the selects and "Assigned to me" toggle
 * push immediately.
 *
 * All UI primitives come from `components/shadcn/ui/` so the visual rhythm
 * matches the rest of the dashboard.
 */

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconSearch } from "@tabler/icons-react";

import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { Switch } from "@/components/shadcn/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/ui/select";

const STAGE_OPTIONS = [
  { value: "all", label: "All stages" },
  { value: "new", label: "New" },
  { value: "emailed", label: "Emailed" },
  { value: "called", label: "Called" },
  { value: "phone_captured", label: "Phone captured" },
  { value: "email_captured", label: "Email captured" },
  { value: "booked", label: "Booked" },
] as const;

const REPORT_OPTIONS = [
  { value: "all", label: "All reports" },
  { value: "pending", label: "Pending" },
  { value: "generating", label: "Generating" },
  { value: "ready", label: "Ready" },
  { value: "failed", label: "Failed" },
] as const;

interface ProspectsFiltersProps {
  initialSearch: string;
  initialStage: string; // "all" or stage value
  initialReportStatus: string; // "all" or status value
  initialAssignedToMe: boolean;
}

export function ProspectsFilters({
  initialSearch,
  initialStage,
  initialReportStatus,
  initialAssignedToMe,
}: ProspectsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(initialSearch);
  const [, startTransition] = useTransition();

  // Keep the input in sync if the URL changes externally (e.g. Back button).
  useEffect(() => {
    setSearchInput(initialSearch);
  }, [initialSearch]);

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    // Any filter change resets pagination to page 1.
    params.delete("page");
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  };

  // Debounced search — only push the URL update after the user pauses typing.
  useEffect(() => {
    if (searchInput === initialSearch) return;
    const timer = setTimeout(() => {
      updateParams({ search: searchInput.trim() || null });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search business, phone, website, city..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select
        value={initialStage}
        onValueChange={(v) => updateParams({ stage: v === "all" ? null : v })}
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STAGE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={initialReportStatus}
        onValueChange={(v) => updateParams({ reportStatus: v === "all" ? null : v })}
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REPORT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2 sm:pl-2">
        <Switch
          id="assigned-to-me"
          checked={initialAssignedToMe}
          onCheckedChange={(checked) => updateParams({ assignedToMe: checked ? "1" : null })}
        />
        <Label htmlFor="assigned-to-me" className="text-sm text-muted-foreground cursor-pointer">
          Assigned to me
        </Label>
      </div>
    </div>
  );
}
