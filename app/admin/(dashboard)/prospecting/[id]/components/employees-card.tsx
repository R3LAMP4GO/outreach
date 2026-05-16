"use client";

/**
 * Employees card on the prospect cockpit.
 *
 * Lists all `contacts` rows where `prospectId = current`. Each row shows
 * name, role/title, email, phone, last spoke at, plus a "Primary" badge
 * when `isPrimaryContact = true`. The "Mark primary" action PATCHes
 * `/api/admin/prospects/[id]/contacts/[contactId]`; the server transaction
 * demotes any other primary so only one row carries the flag at a time.
 *
 * "Add person" opens a dialog that POSTs to
 * `/api/admin/prospects/[id]/contacts`.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconMail,
  IconPhone,
  IconStar,
  IconStarFilled,
  IconUser,
  IconUserPlus,
} from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { Badge } from "@/components/shadcn/ui/badge";
import { Button } from "@/components/shadcn/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shadcn/ui/card";
import { Checkbox } from "@/components/shadcn/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/ui/dialog";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import type { ProspectDetailContact } from "@/lib/prospects/queries";

interface EmployeesCardProps {
  prospectId: string;
  contacts: ProspectDetailContact[];
}

function fullName(c: ProspectDetailContact): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
}

function lastSpoke(c: ProspectDetailContact): string {
  if (!c.lastSpokeAt) return "Never";
  return formatDistanceToNow(new Date(c.lastSpokeAt), { addSuffix: true });
}

export function EmployeesCard({ prospectId, contacts }: EmployeesCardProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [busyContactId, setBusyContactId] = useState<string | null>(null);

  const handleMarkPrimary = async (contactId: string) => {
    try {
      setBusyContactId(contactId);
      const response = await fetch(`/api/admin/prospects/${prospectId}/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimaryContact: true }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(data.error ?? "Failed to mark primary");
        return;
      }
      toast.success("Primary contact updated");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to mark primary");
    } finally {
      setBusyContactId(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <IconUser className="h-5 w-5 text-muted-foreground" />
            Employees ({contacts.length})
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <IconUserPlus className="h-4 w-4 mr-1" />
            Add person
          </Button>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No people captured yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {contacts.map((contact) => {
                const name = fullName(contact);
                const display = name || contact.email;
                const role = contact.roleAtCompany ?? contact.jobTitle;
                return (
                  <li key={contact.id} className="py-3 space-y-1 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{display}</p>
                          {contact.isPrimaryContact && (
                            <Badge className="border-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                              Primary
                            </Badge>
                          )}
                        </div>
                        {role && <p className="text-xs text-muted-foreground">{role}</p>}
                      </div>
                      {!contact.isPrimaryContact && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={busyContactId === contact.id}
                          onClick={() => handleMarkPrimary(contact.id)}
                        >
                          <IconStar className="h-3.5 w-3.5 mr-1" />
                          Mark primary
                        </Button>
                      )}
                      {contact.isPrimaryContact && (
                        <span className="text-xs text-emerald-700 dark:text-emerald-300 inline-flex items-center">
                          <IconStarFilled className="h-3.5 w-3.5 mr-1" />
                          Primary
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <a
                        href={`mailto:${contact.email}`}
                        className="inline-flex items-center gap-1 hover:text-primary hover:underline underline-offset-4"
                      >
                        <IconMail className="h-3.5 w-3.5" />
                        {contact.email}
                      </a>
                      {contact.phone && (
                        <a
                          href={`tel:${contact.phone.replace(/\s+/g, "")}`}
                          className="inline-flex items-center gap-1 hover:text-primary hover:underline underline-offset-4"
                        >
                          <IconPhone className="h-3.5 w-3.5" />
                          {contact.phone}
                        </a>
                      )}
                      <span>Last spoke: {lastSpoke(contact)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddPersonDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        prospectId={prospectId}
        hasExistingPrimary={contacts.some((c) => c.isPrimaryContact)}
        onAdded={() => router.refresh()}
      />
    </>
  );
}

interface AddPersonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospectId: string;
  hasExistingPrimary: boolean;
  onAdded: () => void;
}

function AddPersonDialog({
  open,
  onOpenChange,
  prospectId,
  hasExistingPrimary,
  onAdded,
}: AddPersonDialogProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [makePrimary, setMakePrimary] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setRole("");
    setMakePrimary(false);
  };

  const handleSave = async () => {
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    try {
      setSaving(true);
      const response = await fetch(`/api/admin/prospects/${prospectId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          email: email.trim(),
          phone: phone.trim() || null,
          roleAtCompany: role.trim() || null,
          isPrimaryContact: makePrimary,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? "Failed to add person");
        return;
      }
      toast.success("Person added");
      onOpenChange(false);
      reset();
      onAdded();
    } catch (err) {
      console.error(err);
      toast.error("Failed to add person");
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
          <DialogTitle>Add person</DialogTitle>
          <DialogDescription>Captures a manual contact tied to this prospect.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="person-first-name">First name</Label>
              <Input
                id="person-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="person-last-name">Last name</Label>
              <Input
                id="person-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="person-email">Email *</Label>
            <Input
              id="person-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="person-phone">Phone</Label>
            <Input id="person-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="person-role">Role</Label>
            <Input
              id="person-role"
              placeholder="Owner, Manager\u2026"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="person-primary"
              checked={makePrimary}
              onCheckedChange={(v) => setMakePrimary(v === true)}
            />
            <Label htmlFor="person-primary" className="text-sm font-normal cursor-pointer">
              Mark as primary
              {hasExistingPrimary && (
                <span className="text-xs text-muted-foreground ml-1">(replaces current)</span>
              )}
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving\u2026" : "Add person"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
