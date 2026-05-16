"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/shadcn/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/ui/card";
import { Label } from "@/components/shadcn/ui/label";
import { Textarea } from "@/components/shadcn/ui/textarea";
import { IconLoader2, IconUpload, IconFileTypeCsv } from "@tabler/icons-react";

const EXAMPLE_HEADER = "businessName,website,phone,address,city,state,industry,notes";

interface ImportError {
  line: number;
  column?: string;
  message: string;
}

interface ImportResponse {
  imported?: number;
  errors?: ImportError[];
  error?: string;
  message?: string;
}

export default function ImportProspectsPage() {
  const [csv, setCsv] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      toast.error("Please choose a .csv file");
      return;
    }
    try {
      const text = await file.text();
      setCsv(text);
      toast.success(`Loaded ${file.name}`);
    } catch {
      toast.error("Failed to read file");
    }
  };

  const handleSubmit = async () => {
    const trimmed = csv.trim();
    if (!trimmed) {
      toast.error("Paste a CSV or choose a file first");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/prospects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: trimmed }),
      });

      const data = (await res.json().catch(() => ({}))) as ImportResponse;

      if (!res.ok) {
        // Validation problem from the server (e.g. missing required column).
        const detail =
          data.errors && data.errors.length > 0
            ? data.errors.map((e) => `Line ${e.line}: ${e.message}`).join(" • ")
            : (data.message ?? data.error ?? `Request failed (${res.status})`);
        toast.error("Import failed", { description: detail });
        return;
      }

      const imported = data.imported ?? 0;
      const errors = data.errors ?? [];

      if (imported === 0) {
        toast.error("Nothing imported", {
          description:
            errors.length > 0
              ? `${errors.length} error${errors.length === 1 ? "" : "s"} — fix and retry`
              : undefined,
        });
        return;
      }

      const description =
        errors.length === 0
          ? undefined
          : `Skipped ${errors.length} row${errors.length === 1 ? "" : "s"}: ${errors
              .slice(0, 3)
              .map((e) => `line ${e.line} — ${e.message}`)
              .join("; ")}${errors.length > 3 ? `; +${errors.length - 3} more` : ""}`;

      toast.success(
        `Imported ${imported} prospect${imported === 1 ? "" : "s"}`,
        description ? { description } : undefined,
      );
      setCsv("");
    } catch (err) {
      toast.error("Import failed", {
        description: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Import Prospects</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste a CSV or upload a .csv file. Each row creates a prospect and queues an SEO report
          job in the background.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CSV input</CardTitle>
          <CardDescription>
            Header must include <code className="font-mono">businessName</code>. Other columns are
            optional.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="text-sm">Expected header</Label>
            <pre className="mt-2 rounded-md border bg-muted/40 px-3 py-2 text-xs font-mono text-foreground overflow-x-auto">
              {EXAMPLE_HEADER}
            </pre>
          </div>

          <div>
            <Label htmlFor="csv" className="text-sm">
              Paste CSV
            </Label>
            <Textarea
              id="csv"
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={`${EXAMPLE_HEADER}\nAcme Co,acme.com,+61 2 1234 5678,...`}
              className="mt-2 min-h-64 font-mono text-xs"
              disabled={submitting}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleSubmit} disabled={submitting || !csv.trim()}>
              {submitting ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconUpload className="size-4" />
              )}
              {submitting ? "Importing…" : "Import"}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
            >
              <IconFileTypeCsv className="size-4" />
              Choose file…
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />

            {csv.trim() && !submitting && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCsv("")}
                className="text-muted-foreground"
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
