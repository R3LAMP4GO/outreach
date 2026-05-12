"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/shadcn/ui/card";
import { Input } from "@/components/shadcn/ui/input";
import { Button } from "@/components/shadcn/ui/button";
import { Label } from "@/components/shadcn/ui/label";
import { Textarea } from "@/components/shadcn/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shadcn/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/shadcn/ui/alert-dialog";
import { Skeleton } from "@/components/shadcn/ui/skeleton";
import { IconPlus, IconLoader2, IconTrash, IconSearch } from "@tabler/icons-react";

interface BlocklistEntry {
  id: string;
  email: string;
  reason: string | null;
  created_at: string;
}

export default function BlocklistPage() {
  const [entries, setEntries] = useState<BlocklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newReason, setNewReason] = useState("");
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;

  const fetchBlocklist = useCallback(async () => {
    setLoading(true);
    try {
      // TODO: Create blocklist API endpoint
      // For now, use stub data
      setEntries([]);
    } catch (error) {
      console.error("Error fetching blocklist:", error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBlocklist();
  }, [fetchBlocklist]);

  const addToBlocklist = async () => {
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      alert("Please enter a valid email address");
      return;
    }

    setSaving(true);
    try {
      // TODO: Create blocklist add endpoint
      // For now, add to local state
      const newEntry: BlocklistEntry = {
        id: Date.now().toString(),
        email: newEmail,
        reason: newReason || null,
        created_at: new Date().toISOString(),
      };

      setEntries([newEntry, ...entries]);
      setIsAddOpen(false);
      setNewEmail("");
      setNewReason("");
    } catch (error) {
      console.error("Error adding to blocklist:", error);
      alert("Failed to add email to blocklist");
    }
    setSaving(false);
  };

  const removeFromBlocklist = async (id: string) => {
    try {
      // TODO: Create blocklist remove endpoint
      // For now, remove from local state
      setEntries(entries.filter((entry) => entry.id !== id));
    } catch (error) {
      console.error("Error removing from blocklist:", error);
      alert("Failed to remove email from blocklist");
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Filter entries
  const filteredEntries = entries.filter(
    (entry) =>
      searchQuery === "" ||
      entry.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.reason?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Pagination
  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage);
  const paginatedEntries = filteredEntries.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Email Blocklist</h1>
          <p className="text-muted-foreground">
            Manage blocked email addresses across all campaigns
          </p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <IconPlus className="w-4 h-4 mr-2" />
              Add Email
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Email to Blocklist</DialogTitle>
              <DialogDescription>
                This email will be blocked from all current and future campaigns.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="reason">Reason (Optional)</Label>
                <Textarea
                  id="reason"
                  placeholder="e.g., Bounced, Unsubscribed, Complaint"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="mt-1"
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={addToBlocklist} disabled={saving || !newEmail}>
                {saving && <IconLoader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add to Blocklist
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        {/* Search Bar */}
        <div className="p-4 border-b">
          <div className="relative">
            <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by email or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            {searchQuery ? (
              <p>No blocked emails match your search</p>
            ) : (
              <>
                <p className="text-lg mb-2">No blocked emails</p>
                <p className="text-sm">
                  Emails that bounce or unsubscribe will automatically be added here
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email Address</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Date Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium text-foreground">{entry.email}</TableCell>
                    <TableCell className="text-foreground">{entry.reason || "-"}</TableCell>
                    <TableCell className="text-foreground">
                      {formatDate(entry.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <IconTrash className="w-4 h-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove from Blocklist</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove {entry.email} from the blocklist? This
                              email will be able to receive campaigns again.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => removeFromBlocklist(entry.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages} ({filteredEntries.length} total)
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
