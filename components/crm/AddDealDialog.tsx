"use client";

/**
 * AddDealDialog
 *
 * Controlled dialog for creating a new deal from the CRM dashboard or kanban.
 *
 * Fetches contacts (search) + stages on first open (cached for the dialog's
 * lifetime). Submits to `POST /api/crm/deals`. On success, fires
 * `onCreated(dealId)` so the parent can refetch / push the user somewhere.
 *
 * Stage can be pre-selected via `defaultStageSlug` (used by the per-column
 * "Add Deal" buttons in the kanban so the new deal lands in the right column).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/ui/dialog";
import { Button } from "@/components/shadcn/ui/button";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { Textarea } from "@/components/shadcn/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/ui/select";
import { IconLoader2 } from "@tabler/icons-react";

interface StageOption {
  id: string;
  name: string;
  slug: string;
  display_order: number;
}

interface ContactOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

export interface AddDealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Slug of the stage to pre-select. Defaults to the first stage if omitted. */
  defaultStageSlug?: string;
  /** Pipeline to attach the deal to. Defaults to `sales-pipeline`. */
  pipelineSlug?: string;
  /** Called with the new deal id after a successful POST. */
  onCreated?: (dealId: string) => void;
}

const DEFAULT_PIPELINE = "sales-pipeline";

export function AddDealDialog({
  open,
  onOpenChange,
  defaultStageSlug,
  pipelineSlug = DEFAULT_PIPELINE,
  onCreated,
}: AddDealDialogProps) {
  const router = useRouter();

  // Form state
  const [name, setName] = useState("");
  const [stageSlug, setStageSlug] = useState<string>("");
  const [contactId, setContactId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [probability, setProbability] = useState<string>("");
  const [source, setSource] = useState<string>("manual");
  const [notes, setNotes] = useState<string>("");

  // Async data state
  const [stages, setStages] = useState<StageOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loadingStages, setLoadingStages] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setName("");
      setAmount("");
      setProbability("");
      setSource("manual");
      setNotes("");
      // keep stageSlug + contactId since they're populated from async fetches
    }
  }, [open]);

  // Fetch stages + contacts on first open
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoadingStages(true);
    fetch(`/api/crm/pipeline-deals?pipeline=${encodeURIComponent(pipelineSlug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((data: { stages?: StageOption[] }) => {
        if (cancelled) return;
        const rows = (data.stages ?? []).slice().sort((a, b) => a.display_order - b.display_order);
        setStages(rows);
        if (!stageSlug) {
          const fallback = defaultStageSlug
            ? rows.find((s) => s.slug === defaultStageSlug)?.slug
            : undefined;
          setStageSlug(fallback ?? rows[0]?.slug ?? "");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error("Failed to load stages", {
          description: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingStages(false);
      });

    setLoadingContacts(true);
    fetch(`/api/crm/contacts?limit=100&page=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((data: { contacts?: ContactOption[] }) => {
        if (cancelled) return;
        setContacts(data.contacts ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error("Failed to load contacts", {
          description: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingContacts(false);
      });

    return () => {
      cancelled = true;
    };
    // We intentionally only refetch when `open` flips true. `pipelineSlug` and
    // `defaultStageSlug` are stable per-mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Re-pick stage if defaultStageSlug changes between opens
  useEffect(() => {
    if (open && defaultStageSlug && stages.some((s) => s.slug === defaultStageSlug)) {
      setStageSlug(defaultStageSlug);
    }
  }, [open, defaultStageSlug, stages]);

  const contactLabel = useMemo(() => {
    const c = contacts.find((c) => c.id === contactId);
    if (!c) return "";
    const parts = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    return parts ? `${parts} (${c.email})` : c.email;
  }, [contactId, contacts]);

  const canSubmit =
    name.trim().length > 0 && stageSlug.length > 0 && contactId.length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const body: Record<string, unknown> = {
      name: name.trim(),
      contact_id: contactId,
      stage_slug: stageSlug,
      pipeline_slug: pipelineSlug,
      source: source.trim() || "manual",
    };
    if (amount.trim()) {
      const n = Number(amount);
      if (Number.isFinite(n) && n >= 0) body.amount = n;
    }
    if (probability.trim()) {
      const n = Number(probability);
      if (Number.isFinite(n) && n >= 0 && n <= 100) body.probability = Math.round(n);
    }
    if (notes.trim()) body.notes = notes.trim();

    setSubmitting(true);
    try {
      const res = await fetch("/api/crm/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };

      if (!res.ok || !data.id) {
        toast.error("Failed to create deal", {
          description: data.error ?? `Request failed (${res.status})`,
        });
        return;
      }

      toast.success(`Deal created: ${name.trim()}`);
      onOpenChange(false);
      onCreated?.(data.id);
      router.refresh();
    } catch (err) {
      toast.error("Failed to create deal", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New deal</DialogTitle>
          <DialogDescription>
            Attach a deal to an existing contact. Stage history starts now.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="deal-name">Name</Label>
            <Input
              id="deal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Co. — discovery"
              required
              maxLength={200}
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="deal-stage">Stage</Label>
              <Select
                value={stageSlug}
                onValueChange={setStageSlug}
                disabled={loadingStages || submitting || stages.length === 0}
              >
                <SelectTrigger id="deal-stage">
                  <SelectValue placeholder={loadingStages ? "Loading…" : "Select stage"} />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.slug}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deal-amount">Amount</Label>
              <Input
                id="deal-amount"
                type="number"
                min="0"
                step="100"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deal-contact">Contact</Label>
            <Select
              value={contactId}
              onValueChange={setContactId}
              disabled={loadingContacts || submitting || contacts.length === 0}
            >
              <SelectTrigger id="deal-contact">
                <SelectValue
                  placeholder={
                    loadingContacts
                      ? "Loading…"
                      : contacts.length === 0
                        ? "No contacts found — create one first"
                        : "Select contact"
                  }
                >
                  {contactLabel || undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {contacts.map((c) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
                  return (
                    <SelectItem key={c.id} value={c.id}>
                      {name ? `${name} — ${c.email}` : c.email}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="deal-probability">Probability (%)</Label>
              <Input
                id="deal-probability"
                type="number"
                min="0"
                max="100"
                step="5"
                value={probability}
                onChange={(e) => setProbability(e.target.value)}
                placeholder="50"
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deal-source">Source</Label>
              <Input
                id="deal-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="manual"
                maxLength={100}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deal-notes">Notes</Label>
            <Textarea
              id="deal-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth remembering for this deal"
              rows={3}
              maxLength={2000}
              disabled={submitting}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitting ? "Creating…" : "Create deal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
