"use client";

import { useState } from "react";
import { PipelineKanban } from "@/components/crm/PipelineKanban";
import { DealDetailSheet } from "@/components/crm/DealDetailSheet";

export default function PipelinePage() {
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleDealClick = (dealId: string) => {
    setSelectedDealId(dealId);
    setSheetOpen(true);
  };

  const handleDealUpdated = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleDealDeleted = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Pipeline</h2>
          <p className="text-sm text-muted-foreground">
            Drag and drop deals between stages to update their progress
          </p>
        </div>
      </div>

      <PipelineKanban key={refreshKey} onDealClick={handleDealClick} />

      <DealDetailSheet
        dealId={selectedDealId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onDealUpdated={handleDealUpdated}
        onDealDeleted={handleDealDeleted}
      />
    </div>
  );
}
