"use client";

/**
 * Follow-ups card on the prospect cockpit.
 *
 * Lists pending `prospect_follow_ups` rows for the prospect with per-row
 * "Complete" / "Snooze 1 day" / "Cancel" buttons that PATCH the existing
 * `/api/admin/prospects/[id]/follow-ups/[followUpId]` route.
 *
 * "Add follow-up" opens a dialog with a `react-day-picker` calendar (via the
 * shadcn `Calendar` wrapper) + reason text, then POSTs to
 * `/api/admin/prospects/[id]/follow-ups`.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconBell, IconBellPlus, IconCheck, IconClockHour9, IconX } from "@tabler/icons-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { Badge } from "@/components/shadcn/ui/badge";
import { Button } from "@/components/shadcn/ui/button";
import { Calendar } from "@/components/shadcn/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shadcn/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/ui/dialog";
import { Label } from "@/components/shadcn/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/ui/popover";
import { Textarea } from "@/components/shadcn/ui/textarea";
import type { ProspectDetailFollowUp } from "@/lib/prospects/queries";

interface FollowUpsCardProps {
  prospectId: string;
  followUps: ProspectDetailFollowUp[];
}

function statusTone(status: string): string {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300";
    case "completed":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300";
    case "cancelled":
      return "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
    case "snoozed":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300";
    default:
      return "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
  }
}

export function FollowUpsCard({ prospectId, followUps }: FollowUpsCardProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = followUps.filter((f) => f.status === "pending" || f.status === "snoozed");

  const patchFollowUp = async (followUpId: string, body: Record<string, unknown>) => {
    setBusyId(followUpId);
    try {
      const response = await fetch(`/api/admin/prospects/${prospectId}/follow-ups/${followUpId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? "Failed to update follow-up");
        return false;
      }
      router.refresh();
      return true;
    } catch (err) {
      console.error(err);
      toast.error("Failed to update follow-up");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleComplete = async (id: string) => {
    if (await patchFollowUp(id, { status: "completed" })) {
      toast.success("Follow-up completed");
    }
  };

  const handleSnooze = async (id: string) => {
    const newDueAt = new Date();
    newDueAt.setDate(newDueAt.getDate() + 1);
    if (
      await patchFollowUp(id, {
        status: "snoozed",
        newDueAt: newDueAt.toISOString(),
      })
    ) {
      toast.success("Snoozed 1 day");
    }
  };

  const handleCancel = async (id: string) => {
    if (await patchFollowUp(id, { status: "cancelled" })) {
      toast.success("Follow-up cancelled");
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <IconBell className="h-5 w-5 text-muted-foreground" />
            Follow-ups ({pending.length})
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <IconBellPlus className="h-4 w-4 mr-1" />
            Add follow-up
          </Button>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No pending follow-ups.</p>
          ) : (
            <ul className="divide-y divide-border">
              {pending.map((followUp) => {
                const due = new Date(followUp.dueAt);
                return (
                  <li key={followUp.id} className="py-3 space-y-2 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {format(due, "EEE, MMM d \u2014 h:mm a")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(due, { addSuffix: true })}
                        </p>
                        {followUp.reason && (
                          <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                            {followUp.reason}
                          </p>
                        )}
                      </div>
                      <Badge className={`border-0 capitalize ${statusTone(followUp.status)}`}>
                        {followUp.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7"
                        disabled={busyId === followUp.id}
                        onClick={() => handleComplete(followUp.id)}
                      >
                        <IconCheck className="h-3.5 w-3.5 mr-1" />
                        Complete
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7"
                        disabled={busyId === followUp.id}
                        onClick={() => handleSnooze(followUp.id)}
                      >
                        <IconClockHour9 className="h-3.5 w-3.5 mr-1" />
                        Snooze 1 day
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-muted-foreground"
                        disabled={busyId === followUp.id}
                        onClick={() => handleCancel(followUp.id)}
                      >
                        <IconX className="h-3.5 w-3.5 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddFollowUpDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        prospectId={prospectId}
        onCreated={() => router.refresh()}
      />
    </>
  );
}

interface AddFollowUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospectId: string;
  onCreated: () => void;
}

function AddFollowUpDialog({ open, onOpenChange, prospectId, onCreated }: AddFollowUpDialogProps) {
  const [dueDate, setDueDate] = useState<Date | undefined>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const reset = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setDueDate(d);
    setReason("");
  };

  const handleSave = async () => {
    if (!dueDate) {
      toast.error("Pick a date");
      return;
    }
    try {
      setSaving(true);
      // Default to 9am local time on the chosen day if the user picked a
      // bare date \u2014 same convention as `process-quo-call.ts:scheduleFollowUp`.
      const dueAt = new Date(dueDate);
      dueAt.setHours(9, 0, 0, 0);

      const response = await fetch(`/api/admin/prospects/${prospectId}/follow-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dueAt: dueAt.toISOString(),
          reason: reason.trim() || null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? "Failed to create follow-up");
        return;
      }
      toast.success("Follow-up scheduled");
      onOpenChange(false);
      reset();
      onCreated();
    } catch (err) {
      console.error(err);
      toast.error("Failed to create follow-up");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add follow-up</DialogTitle>
          <DialogDescription>
            Schedule a reminder. The worker will fire a notification at the chosen date.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label>Due date</Label>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start font-normal"
                  type="button"
                >
                  {dueDate ? format(dueDate, "EEE, MMM d, yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  onSelect={(d) => {
                    setDueDate(d);
                    setPopoverOpen(false);
                  }}
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  autoFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label htmlFor="followup-reason">Reason</Label>
            <Textarea
              id="followup-reason"
              rows={3}
              placeholder="Promised to call back about pricing\u2026"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !dueDate}>
            {saving ? "Saving\u2026" : "Add follow-up"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
