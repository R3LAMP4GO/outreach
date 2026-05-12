"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/ui/select";
import { Label } from "@/components/shadcn/ui/label";

type AdminUser = {
  id: string;
  name: string | null;
  email: string;
  role: "admin" | "super_admin";
};

type CampaignOwnerSelectProps = {
  campaignId: string;
  currentOwnerId: string | null;
};

export function CampaignOwnerSelect({ campaignId, currentOwnerId }: CampaignOwnerSelectProps) {
  const { data: session } = useSession();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(
    currentOwnerId || session?.user?.id || null,
  );

  const fetchAdminUsers = async () => {
    try {
      const response = await fetch("/api/admin/users");
      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }
      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error("Error fetching admin users:", error);
      toast.error("Failed to load admin users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminUsers();
  }, []);

  const handleOwnerChange = async (newOwnerId: string) => {
    try {
      setSelectedOwnerId(newOwnerId);

      const response = await fetch(`/api/outreach/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          owner_id: newOwnerId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update campaign owner");
      }

      const newOwner = users.find((u) => u.id === newOwnerId);
      const ownerName = newOwner?.name || newOwner?.email || "Unknown";
      toast.success(`Campaign owner updated to ${ownerName}`);
    } catch (error) {
      console.error("Error updating campaign owner:", error);
      toast.error("Failed to update campaign owner");
      // Revert selection on error
      setSelectedOwnerId(currentOwnerId || session?.user?.id || null);
    }
  };

  const getDisplayName = (user: AdminUser): string => {
    return user.name || user.email;
  };

  if (loading) {
    return (
      <div className="flex items-start justify-between">
        <div>
          <Label className="text-sm font-semibold text-foreground">Owner</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Select the ownership of this campaign
          </p>
        </div>
        <div className="w-64 h-9 bg-gray-100 animate-pulse rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between">
      <div>
        <Label className="text-sm font-semibold text-foreground">Owner</Label>
        <p className="text-sm text-muted-foreground mt-1">Select the ownership of this campaign</p>
      </div>
      <Select value={selectedOwnerId || undefined} onValueChange={handleOwnerChange}>
        <SelectTrigger className="w-64 h-9 bg-gray-50 border border-gray-300 shadow-sm">
          <SelectValue placeholder="Select owner" />
        </SelectTrigger>
        <SelectContent>
          {users.map((user) => (
            <SelectItem key={user.id} value={user.id}>
              {getDisplayName(user)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
