"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/ui/sheet";
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
import { Badge } from "@/components/shadcn/ui/badge";
import { Separator } from "@/components/shadcn/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/ui/tabs";
import { IconTrash, IconExternalLink, IconMail, IconCalendar } from "@tabler/icons-react";
import { toast } from "sonner";
import { DealStageHistory } from "./DealStageHistory";
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

interface DealData {
  name: string;
  amount: number | null;
  probability: number | null;
  source: string;
  created_at: string;
  stage_id: string;
  expected_close_date: string | null;
  notes: string | null;
  stage: { id: string; name: string };
  contact: { first_name: string | null; last_name: string | null; email: string } | null;
}

interface DealDetailSheetProps {
  dealId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDealUpdated?: () => void;
  onDealDeleted?: () => void;
}

export function DealDetailSheet({
  dealId,
  open,
  onOpenChange,
  onDealUpdated,
  onDealDeleted,
}: DealDetailSheetProps) {
  const [deal, setDeal] = useState<DealData | null>(null);
  const [history, setHistory] = useState<React.ComponentProps<typeof DealStageHistory>["history"]>(
    [],
  );
  const [stages, setStages] = useState<
    Array<{ id: string; name: string; slug: string; color: string | null }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    amount: "",
    probability: "",
    expected_close_date: "",
    notes: "",
    stage_id: "",
  });

  const fetchDeal = useCallback(async () => {
    if (!dealId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/crm/deals/${dealId}`);

      if (!response.ok) throw new Error("Failed to fetch deal");

      const data = await response.json();
      setDeal(data.deal);
      setHistory(data.history || []);

      // Fetch available stages for the pipeline
      const stagesResponse = await fetch(`/api/crm/pipeline-deals?pipeline=sales-pipeline`);
      if (stagesResponse.ok) {
        const pipelineData = await stagesResponse.json();
        // Extract unique stages from pipeline data
        const uniqueStages = pipelineData.stages || [];
        setStages(uniqueStages);
      }

      // Populate form
      setFormData({
        name: data.deal.name || "",
        amount: data.deal.amount?.toString() || "",
        probability: data.deal.probability?.toString() || "",
        expected_close_date: data.deal.expected_close_date || "",
        notes: data.deal.notes || "",
        stage_id: data.deal.stage_id || "",
      });
    } catch (err) {
      console.error("Error fetching deal:", err);
      toast.error("Failed to load deal");
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    if (dealId && open) {
      fetchDeal();
    }
  }, [dealId, open, fetchDeal]);

  const handleSave = async () => {
    if (!dealId) return;

    try {
      setSaving(true);

      const updateData = {
        name: formData.name,
        amount: formData.amount !== "" ? parseFloat(formData.amount) : null,
        probability: formData.probability !== "" ? parseInt(formData.probability) : null,
        expected_close_date: formData.expected_close_date || null,
        notes: formData.notes,
        stage_id: formData.stage_id,
      };

      const response = await fetch(`/api/crm/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) throw new Error("Failed to update deal");

      const data = await response.json();
      setDeal(data.deal);
      toast.success("Deal updated successfully");
      onDealUpdated?.();

      // Refresh history if stage changed
      if (formData.stage_id !== deal?.stage_id) {
        fetchDeal();
      }
    } catch (err) {
      console.error("Error updating deal:", err);
      toast.error("Failed to update deal");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!dealId) return;

    try {
      const response = await fetch(`/api/crm/deals/${dealId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete deal");

      toast.success("Deal deleted successfully");
      setShowDeleteDialog(false);
      onOpenChange(false);
      onDealDeleted?.();
    } catch (err) {
      console.error("Error deleting deal:", err);
      toast.error("Failed to delete deal");
    }
  };

  const getSourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      contact_form: "Contact Form",
      newsletter: "Newsletter",
      cal_com: "Cal.com",
      outreach: "Outreach",
      manual: "Manual",
    };
    return labels[source] || source;
  };

  if (!dealId) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-[600px] overflow-y-auto">
          {loading ? (
            <SheetHeader>
              <SheetTitle>Loading...</SheetTitle>
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">Loading deal...</p>
              </div>
            </SheetHeader>
          ) : deal ? (
            <>
              <SheetHeader>
                <SheetTitle>{deal.name}</SheetTitle>
                <SheetDescription asChild>
                  <span className="flex items-center gap-2 mt-2 text-muted-foreground text-sm">
                    <Badge>{getSourceLabel(deal.source)}</Badge>
                    <span className="text-xs text-muted-foreground">
                      Created {new Date(deal.created_at).toLocaleDateString()}
                    </span>
                  </span>
                </SheetDescription>
              </SheetHeader>

              <Tabs defaultValue="details" className="mt-6">
                <TabsList className="w-full">
                  <TabsTrigger value="details" className="flex-1">
                    Details
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex-1">
                    History
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-6 mt-6">
                  {/* Contact Info */}
                  {deal.contact && (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-gray-500">Contact</Label>
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">
                            {[deal.contact.first_name, deal.contact.last_name]
                              .filter(Boolean)
                              .join(" ") || "Unnamed"}
                          </p>
                          <p className="text-sm text-gray-500">{deal.contact.email}</p>
                        </div>
                        <Button variant="ghost" size="sm">
                          <IconExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Deal Name */}
                  <div className="space-y-2">
                    <Label htmlFor="name">Deal Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  {/* Stage */}
                  <div className="space-y-2">
                    <Label htmlFor="stage">Stage</Label>
                    <Select
                      value={formData.stage_id}
                      onValueChange={(value) => setFormData({ ...formData, stage_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.length > 0 ? (
                          stages.map((stage) => (
                            <SelectItem key={stage.id} value={stage.id}>
                              {stage.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value={deal.stage.id}>{deal.stage.name}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Amount & Probability */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="amount">Amount ($)</Label>
                      <Input
                        id="amount"
                        type="number"
                        placeholder="0"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="probability">Probability (%)</Label>
                      <Input
                        id="probability"
                        type="number"
                        placeholder="0"
                        min="0"
                        max="100"
                        value={formData.probability}
                        onChange={(e) => setFormData({ ...formData, probability: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Expected Close Date */}
                  <div className="space-y-2">
                    <Label htmlFor="close_date">Expected Close Date</Label>
                    <Input
                      id="close_date"
                      type="date"
                      value={formData.expected_close_date}
                      onChange={(e) =>
                        setFormData({ ...formData, expected_close_date: e.target.value })
                      }
                    />
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      rows={4}
                      placeholder="Add notes about this deal..."
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    />
                  </div>

                  <Separator />

                  {/* Quick Actions */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-gray-500">Quick Actions</Label>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1">
                        <IconCalendar className="h-4 w-4 mr-2" />
                        Schedule Meeting
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1">
                        <IconMail className="h-4 w-4 mr-2" />
                        Send Email
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <Button onClick={handleSave} disabled={saving} className="flex-1">
                      {saving ? "Saving..." : "Save Changes"}
                    </Button>
                    <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                      <IconTrash className="h-4 w-4" />
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="history" className="mt-6">
                  <DealStageHistory history={history} />
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <SheetHeader>
              <SheetTitle>Deal not found</SheetTitle>
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">This deal could not be loaded.</p>
              </div>
            </SheetHeader>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete deal?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the deal and its history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete Deal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
