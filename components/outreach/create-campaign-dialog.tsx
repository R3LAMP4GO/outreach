"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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
import { IconLoader2 } from "@tabler/icons-react";

export interface CreateCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateCampaignDialog({ open, onOpenChange }: CreateCampaignDialogProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!name || name.trim().length < 3) {
      setError("Campaign name must be at least 3 characters");
      return;
    }

    if (name.length > 100) {
      setError("Campaign name must be at most 100 characters");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/outreach/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          from_name: session?.user?.name || "Campaign Owner",
          from_email: session?.user?.email || "noreply@example.com",
        }),
      });

      const data = await res.json();
      console.log("Campaign creation response:", { status: res.status, data });

      if (res.ok && data.campaign) {
        toast.success("Campaign created", {
          description: `${name} is ready to configure`,
        });
        onOpenChange(false);
        setName("");
        router.push(`/admin/outreach/campaigns/${data.campaign.id}`);
      } else {
        const errorMsg = data.message || data.error || "Failed to create campaign";
        console.error("Campaign creation failed:", errorMsg, data);
        setError(errorMsg);
        toast.error("Failed to create campaign", {
          description: errorMsg,
        });
      }
    } catch (err) {
      console.error("Error creating campaign:", err);
      setError("Failed to create campaign. Please try again.");
      toast.error("Failed to create campaign", {
        description: "Please check your connection and try again",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!loading) {
      onOpenChange(newOpen);
      if (!newOpen) {
        // Reset form when closing
        setName("");
        setError("");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Campaign</DialogTitle>
            <DialogDescription>
              Give your campaign a name to get started. You can configure everything else after
              creation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="campaign-name">
                Campaign Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="campaign-name"
                placeholder="e.g., Q1 2025 Outreach"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                disabled={loading}
                autoFocus
                aria-invalid={!!error}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? (
                <>
                  <IconLoader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Campaign"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
