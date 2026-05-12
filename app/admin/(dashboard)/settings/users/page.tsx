"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { Button } from "@/components/shadcn/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shadcn/ui/card";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/shadcn/ui/sheet";
import { IconCopy, IconLoader2, IconUserPlus } from "@tabler/icons-react";
import { toast } from "sonner";
import { useSiteSettings } from "@/lib/site-settings-context";

const DEFAULT_LOGO = "/logos/logo.svg";

type AdminUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

function formatRole(role: string) {
  return role === "super_admin" ? "Super Admin" : "Admin";
}

export default function UsersSettingsPage() {
  const { data: session } = useSession();
  const { settings } = useSiteSettings();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "super_admin">("admin");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const res = await fetch("/api/admin/users");
        const data = await res.json();
        if (res.ok) setUsers(data.users || []);
      } catch (error) {
        console.error("Failed to load users:", error);
      } finally {
        setIsLoadingUsers(false);
      }
    };
    loadUsers();
  }, []);

  const handleInviteUser = async () => {
    if (!inviteEmail) {
      toast.error("Email is required");
      return;
    }
    setIsInviting(true);
    try {
      const res = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error);
        return;
      }
      setInviteUrl(data.inviteUrl);
      toast.success("Invitation created");
    } catch {
      toast.error("Failed to create invitation");
    } finally {
      setIsInviting(false);
    }
  };

  const isSuperAdmin = session?.user?.role === "super_admin";
  const logoSrc = settings.logoUrl || DEFAULT_LOGO;
  const displayName = settings.businessName || "__YOUR_BRAND__";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">User Management</h2>
          <p className="text-sm text-muted-foreground mt-1">Create and manage admin accounts</p>
        </div>
        {isSuperAdmin && (
          <Sheet
            open={sheetOpen}
            onOpenChange={(open) => {
              setSheetOpen(open);
              if (!open) {
                setInviteEmail("");
                setInviteUrl("");
              }
            }}
          >
            <SheetTrigger asChild>
              <Button className="shadow-sm">
                <IconUserPlus className="w-4 h-4" />
                New User
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoSrc}
                    alt={displayName}
                    className="h-14 w-14 shrink-0 rounded-xl object-contain"
                  />
                  <div>
                    <SheetTitle>New User</SheetTitle>
                    <SheetDescription>
                      Create an account and generate a setup link.
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="inviteEmail">Email Address</Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inviteRole">Role</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(value: "admin" | "super_admin") => setInviteRole(value)}
                  >
                    <SelectTrigger id="inviteRole">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {inviteUrl && (
                  <div className="space-y-1.5">
                    <Label>Setup Link</Label>
                    <div className="space-y-2 rounded-md border bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">
                        Share this link with the user. It expires in 7 days.
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">
                          {inviteUrl}
                        </code>
                        <Button
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          onClick={() => {
                            navigator.clipboard.writeText(inviteUrl);
                            toast.success("Copied");
                          }}
                        >
                          <IconCopy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <SheetFooter>
                <Button
                  onClick={handleInviteUser}
                  disabled={isInviting || !inviteEmail}
                  className="w-full shadow-sm"
                >
                  {isInviting ? (
                    <IconLoader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <IconUserPlus className="w-4 h-4" />
                  )}
                  Create Invitation
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingUsers ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <IconLoader2 className="w-4 h-4 animate-spin" />
              Loading users...
            </div>
          ) : users.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">No users yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.name || "—"}
                      {user.id === session?.user?.id && (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <span
                        className={
                          user.role === "super_admin"
                            ? "inline-flex items-center rounded-md bg-foreground px-2 py-0.5 text-xs font-medium text-background"
                            : "inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {formatRole(user.role)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
