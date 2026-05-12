"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/shadcn/ui/button";
import { IconDownload, IconTrash, IconArrowRight } from "@tabler/icons-react";
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
import { toast } from "sonner";

interface Stage {
  slug: string;
  name: string;
}

interface DealsBulkActionsProps {
  selectedDealIds: string[];
  onActionComplete: () => void;
}

export function DealsBulkActions({ selectedDealIds, onActionComplete }: DealsBulkActionsProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [stages, setStages] = useState<Stage[]>([]);

  useEffect(() => {
    const fetchStages = async () => {
      try {
        const response = await fetch("/api/crm/pipeline-deals?pipeline=sales-pipeline");
        if (response.ok) {
          const data = await response.json();
          setStages(data.stages || []);
        }
      } catch {
        // Non-critical
      }
    };
    fetchStages();
  }, []);

  const handleExportCSV = () => {
    // TODO: Implement CSV export
    toast.success(`Exporting ${selectedDealIds.length} deals...`);
  };

  const handleBulkMove = async () => {
    if (!selectedStage) return;

    try {
      setLoading(true);

      const response = await fetch("/api/crm/deals/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_ids: selectedDealIds,
          updates: { stage_slug: selectedStage },
        }),
      });

      if (!response.ok) throw new Error("Failed to move deals");

      toast.success(`Moved ${selectedDealIds.length} deals successfully`);
      setShowMoveDialog(false);
      setSelectedStage("");
      onActionComplete();
    } catch (err) {
      console.error("Error moving deals:", err);
      toast.error("Failed to move deals. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    try {
      setLoading(true);

      const response = await fetch("/api/crm/deals/bulk-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_ids: selectedDealIds }),
      });

      if (!response.ok) throw new Error("Failed to delete deals");

      toast.success(`Deleted ${selectedDealIds.length} deals successfully`);
      setShowDeleteDialog(false);
      onActionComplete();
    } catch (err) {
      console.error("Error deleting deals:", err);
      toast.error("Failed to delete deals. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3 mb-4 flex items-center justify-between">
        <span className="text-sm font-medium text-blue-200">{selectedDealIds.length} selected</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowMoveDialog(true)}>
            <IconArrowRight className="h-4 w-4 mr-2" />
            Move to Stage
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <IconDownload className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
            <IconTrash className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Move to Stage Dialog */}
      <AlertDialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {selectedDealIds.length} deals</AlertDialogTitle>
            <AlertDialogDescription>
              Select a stage to move the selected deals to.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Select value={selectedStage} onValueChange={setSelectedStage}>
              <SelectTrigger>
                <SelectValue placeholder="Select stage" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage) => (
                  <SelectItem key={stage.slug} value={stage.slug}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkMove} disabled={!selectedStage || loading}>
              {loading ? "Moving..." : "Move Deals"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedDealIds.length} deals?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected deals and
              their history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={loading}
              className="bg-red-600 hover:bg-red-700"
            >
              {loading ? "Deleting..." : "Delete Deals"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
