"use client";

/**
 * Sticky header card for the prospect cockpit.
 *
 * Shows business name (h1), address, city/state, industry, phone (`tel:`
 * link), website (external link), and the stage badge from the prior task.
 * The "Edit" toggle swaps the read view for an inline form on the editable
 * fields; saving PATCHes `/api/admin/prospects/[id]` and `router.refresh()`s
 * so server data is the source of truth.
 *
 * Visual rhythm \u2014 `Card` + `CardHeader` + `CardContent`, header pt/pb spacing,
 * muted text tones, badge placement \u2014 mirrors `ContactDetailSheet.tsx` and
 * `prospects-table.tsx` so the page reads as a sibling of those views.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconBuildingStore,
  IconEdit,
  IconExternalLink,
  IconMapPin,
  IconPhone,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { Button } from "@/components/shadcn/ui/button";
import { Card, CardContent, CardHeader } from "@/components/shadcn/ui/card";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { Textarea } from "@/components/shadcn/ui/textarea";
import { ProspectStageBadge } from "@/components/prospecting/status-badge";
import type { ProspectDetailRow } from "@/lib/prospects/queries";

interface ProspectHeaderProps {
  prospect: ProspectDetailRow;
}

interface FormState {
  businessName: string;
  address: string;
  city: string;
  state: string;
  industry: string;
  phone: string;
  website: string;
  notes: string;
}

function toFormState(p: ProspectDetailRow): FormState {
  return {
    businessName: p.businessName ?? "",
    address: p.address ?? "",
    city: p.city ?? "",
    state: p.state ?? "",
    industry: p.industry ?? "",
    phone: p.phone ?? "",
    website: p.website ?? "",
    notes: p.notes ?? "",
  };
}

function normaliseWebsite(value: string | null): string | null {
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function ProspectHeader({ prospect }: ProspectHeaderProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(() => toFormState(prospect));

  const handleSave = async () => {
    try {
      setSaving(true);
      const initial = toFormState(prospect);
      const payload: Record<string, string | null> = {};
      for (const key of Object.keys(form) as (keyof FormState)[]) {
        if (form[key] !== initial[key]) {
          payload[key] = form[key].trim() === "" ? null : form[key].trim();
        }
      }
      if (Object.keys(payload).length === 0) {
        toast.info("No changes to save");
        setEditing(false);
        return;
      }

      const response = await fetch(`/api/admin/prospects/${prospect.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? "Failed to update prospect");
        return;
      }
      toast.success("Prospect updated");
      setEditing(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update prospect");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(toFormState(prospect));
    setEditing(false);
  };

  const websiteHref = normaliseWebsite(prospect.website);
  const locationLine = [prospect.city, prospect.state].filter(Boolean).join(", ");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2 flex-1 min-w-0">
            {editing ? (
              <div className="space-y-2">
                <Label htmlFor="businessName" className="text-xs text-muted-foreground">
                  Business name
                </Label>
                <Input
                  id="businessName"
                  value={form.businessName}
                  onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                />
              </div>
            ) : (
              <h1 className="text-2xl font-semibold text-foreground truncate">
                {prospect.businessName}
              </h1>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <ProspectStageBadge stage={prospect.outreachStage} />
              {prospect.industry && !editing && (
                <span className="inline-flex items-center text-sm text-muted-foreground">
                  <IconBuildingStore className="h-4 w-4 mr-1" />
                  {prospect.industry}
                </span>
              )}
              {(prospect.address || locationLine) && !editing && (
                <span className="inline-flex items-center text-sm text-muted-foreground">
                  <IconMapPin className="h-4 w-4 mr-1" />
                  {[prospect.address, locationLine].filter(Boolean).join(" \u2014 ")}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
                  <IconX className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving\u2026" : "Save"}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <IconEdit className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                placeholder="https://\u2026"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {prospect.phone && (
              <a
                href={`tel:${prospect.phone.replace(/\s+/g, "")}`}
                className="inline-flex items-center text-sm text-foreground hover:text-primary hover:underline underline-offset-4"
              >
                <IconPhone className="h-4 w-4 mr-1.5" />
                {prospect.phone}
              </a>
            )}
            {websiteHref && (
              <a
                href={websiteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-sm text-foreground hover:text-primary hover:underline underline-offset-4"
              >
                <IconExternalLink className="h-4 w-4 mr-1.5" />
                {prospect.website?.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            )}
            {prospect.notes && (
              <p className="text-sm text-muted-foreground w-full whitespace-pre-wrap">
                {prospect.notes}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
