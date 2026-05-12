"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/shadcn/ui/card";
import { Input } from "@/components/shadcn/ui/input";
import { Button } from "@/components/shadcn/ui/button";
import { IconSearch, IconDownload, IconTrash, IconTag, IconMail } from "@tabler/icons-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/shadcn/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcn/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/ui/dialog";
import { Label } from "@/components/shadcn/ui/label";
import { ContactDetailSheet } from "@/components/crm/ContactDetailSheet";

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  contact_status: string | null;
  source: string;
  company: string | null;
  job_title: string | null;
  created_at: string;
  updated_at: string | null;
}

export default function LeadsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sheet state
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Bulk action dialogs
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (selectedStatus !== "all") params.set("status", selectedStatus);

      const response = await fetch(`/api/crm/contacts?${params}`);
      if (!response.ok) throw new Error("Failed to fetch contacts");

      const data = await response.json();
      setContacts(data.contacts || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("Error fetching contacts:", err);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, selectedStatus, limit]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleContactClick = (contactId: string) => {
    setSelectedContactId(contactId);
    setSheetOpen(true);
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    }
  };

  // ── Bulk Delete ──
  const handleBulkDelete = async () => {
    try {
      setBulkLoading(true);
      const response = await fetch("/api/crm/contacts/bulk-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_ids: Array.from(selectedIds) }),
      });

      if (!response.ok) throw new Error("Failed to delete contacts");

      toast.success(`Deleted ${selectedIds.size} contacts`);
      setShowDeleteDialog(false);
      setSelectedIds(new Set());
      fetchContacts();
    } catch (err) {
      console.error("Error deleting contacts:", err);
      toast.error("Failed to delete contacts");
    } finally {
      setBulkLoading(false);
    }
  };

  // ── Bulk Tag ──
  const handleBulkTag = async () => {
    const tags = tagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length === 0) {
      toast.error("Enter at least one tag");
      return;
    }

    try {
      setBulkLoading(true);
      const response = await fetch("/api/crm/contacts/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_ids: Array.from(selectedIds),
          updates: { add_tags: tags },
        }),
      });

      if (!response.ok) throw new Error("Failed to tag contacts");

      toast.success(`Tagged ${selectedIds.size} contacts with: ${tags.join(", ")}`);
      setShowTagDialog(false);
      setTagInput("");
      setSelectedIds(new Set());
      fetchContacts();
    } catch (err) {
      console.error("Error tagging contacts:", err);
      toast.error("Failed to tag contacts");
    } finally {
      setBulkLoading(false);
    }
  };

  // ── Export CSV ──
  const handleExportCSV = () => {
    if (selectedIds.size === 0) {
      toast.error("Select contacts to export");
      return;
    }
    const selected = contacts.filter((c) => selectedIds.has(c.id));
    const headers = ["Name", "Email", "Phone", "Company", "Status", "Source", "Created"];
    const rows = selected.map((c) => [
      [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed",
      c.email,
      c.phone || "",
      c.company || "",
      c.contact_status || "",
      c.source || "",
      new Date(c.created_at).toLocaleDateString(),
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `contacts-export-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success(`Exported ${selected.length} contacts`);
  };

  const getStatusClassName = (status: string | null): string => {
    const classes: Record<string, string> = {
      subscriber: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
      lead: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
      qualified: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
      customer: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
    };
    return classes[status || ""] || "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
  };

  const getSourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      contact_form: "Contact Form",
      form_submission: "Form",
      newsletter: "Newsletter",
      newsletter_signup: "Newsletter",
      cal_com: "Cal.com",
      outreach: "Outreach",
      manual: "Manual",
      n8n_import: "N8N Import",
    };
    return labels[source] || source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Leads & Contacts</h2>
          <p className="text-sm text-muted-foreground">Manage your contacts and lead information</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          {/* Filters */}
          <div className="flex flex-col gap-3 mt-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={selectedStatus}
              onValueChange={(v) => {
                setSelectedStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="subscriber">Subscriber</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 dark:bg-blue-900/30 dark:border-blue-700 rounded-lg p-3 flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-medium text-blue-700 dark:text-blue-200">
                {selectedIds.size} selected
              </span>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowTagDialog(true)}>
                  <IconTag className="h-4 w-4 mr-2" />
                  Tag
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportCSV}>
                  <IconDownload className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.info("Campaign feature coming soon")}
                >
                  <IconMail className="h-4 w-4 mr-2" />
                  Send to Campaign
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
                  <IconTrash className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="border border-border rounded-lg overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-center w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === contacts.length && contacts.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-600"
                    />
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                    Name
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                    Email
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                    Company
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                    Source
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                    Created
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                    Last Updated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      Loading contacts...
                    </td>
                  </tr>
                ) : contacts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      No contacts found
                    </td>
                  </tr>
                ) : (
                  contacts.map((contact) => (
                    <tr
                      key={contact.id}
                      className="hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleContactClick(contact.id)}
                    >
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(contact.id)}
                          onChange={() => toggleSelect(contact.id)}
                          className="rounded border-gray-600"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground text-center">
                        {[contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
                          "Unnamed"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground text-center">
                        {contact.email}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground text-center">
                        {contact.company || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <Badge
                          className={`border-0 capitalize ${getStatusClassName(contact.contact_status)}`}
                        >
                          {contact.contact_status || "Unknown"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <Badge className="bg-gray-100 text-gray-600 border-0 dark:bg-gray-800 dark:text-gray-300">
                          {getSourceLabel(contact.source)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground text-center">
                        {formatDateTime(contact.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground text-center">
                        {formatDateTime(contact.updated_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-col gap-3 mt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <div className="text-sm text-muted-foreground">
                Showing {total > 0 ? (page - 1) * limit + 1 : 0} to {Math.min(page * limit, total)}{" "}
                of {total} contacts
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
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="flex-1 sm:flex-none"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="flex-1 sm:flex-none"
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ContactDetailSheet
        contactId={selectedContactId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onContactUpdated={fetchContacts}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} contacts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected contacts along with their deals, timeline,
              and submission history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {bulkLoading ? "Deleting..." : "Delete Contacts"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tag Dialog */}
      <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tag {selectedIds.size} contacts</DialogTitle>
            <DialogDescription>
              Add tags to the selected contacts. Separate multiple tags with commas.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              placeholder="e.g. hot-lead, follow-up, priority"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleBulkTag();
              }}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTagDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkTag} disabled={bulkLoading}>
              {bulkLoading ? "Tagging..." : "Add Tags"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
