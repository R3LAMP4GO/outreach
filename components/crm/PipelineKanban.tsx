"use client";

import { useEffect, useState, useCallback } from "react";
import { DealColumn } from "./DealColumn";
import { Card, CardContent } from "@/components/shadcn/ui/card";
import { Button } from "@/components/shadcn/ui/button";
import { IconRefresh } from "@tabler/icons-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/ui/select";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

interface Stage {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  display_order: number;
}

interface Deal {
  id: string;
  name: string;
  amount: number | null;
  probability: number | null;
  stage?: Stage;
  contact?: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
}

interface PipelineKanbanProps {
  onDealClick?: (dealId: string) => void;
}

export function PipelineKanban({ onDealClick }: PipelineKanbanProps) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [dealsByStage, setDealsByStage] = useState<Record<string, Deal[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPipeline, setSelectedPipeline] = useState("sales-pipeline");
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  // Split mouse vs. touch sensors so horizontal swipe on mobile scrolls the kanban
  // instead of triggering a drag. Touch requires a long-press (250ms) to start a drag,
  // matching dnd-kit's recommendation for touch + scroll coexistence.
  // https://docs.dndkit.com/api-documentation/sensors/touch
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
  );

  const fetchDeals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/crm/pipeline-deals?pipeline=${selectedPipeline}`);

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Failed to fetch deals (${response.status})`);
      }

      const data = await response.json();
      setStages(data.stages || []);
      setDealsByStage(data.dealsByStage || {});
    } catch (err) {
      console.error("Error fetching deals:", err);
      setError("Failed to load pipeline. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [selectedPipeline]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const dealId = active.id as string;

    // Find the deal being dragged
    for (const stageDeals of Object.values(dealsByStage)) {
      const deal = stageDeals.find((d) => d.id === dealId);
      if (deal) {
        setActiveDeal(deal);
        break;
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveDeal(null);

    if (!over) return;

    const dealId = active.id as string;
    const newStageSlug = over.id as string;

    // Find current stage
    let currentStageSlug = "";
    let deal: Deal | null = null;

    for (const [slug, stageDeals] of Object.entries(dealsByStage)) {
      const foundDeal = stageDeals.find((d) => d.id === dealId);
      if (foundDeal) {
        currentStageSlug = slug;
        deal = foundDeal;
        break;
      }
    }

    if (!deal || currentStageSlug === newStageSlug) return;

    // Find new stage ID
    const newStage = stages.find((s) => s.slug === newStageSlug);
    if (!newStage) return;

    // Optimistic UI update
    const updatedDealsByStage = { ...dealsByStage };
    updatedDealsByStage[currentStageSlug] = updatedDealsByStage[currentStageSlug].filter(
      (d) => d.id !== dealId,
    );
    updatedDealsByStage[newStageSlug] = [
      ...updatedDealsByStage[newStageSlug],
      { ...deal, stage: newStage },
    ];
    setDealsByStage(updatedDealsByStage);

    // API call
    try {
      const response = await fetch(`/api/crm/deals/${dealId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: newStage.id }),
      });

      if (!response.ok) {
        throw new Error("Failed to move deal");
      }

      toast.success("Deal moved successfully");
    } catch (err) {
      console.error("Error moving deal:", err);
      toast.error("Failed to move deal. Please try again.");

      // Revert optimistic update
      setDealsByStage(dealsByStage);
    }
  };

  const handleAddDeal = (stageSlug: string) => {
    // TODO: Implement add deal modal
    console.log("Add deal to stage:", stageSlug);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center text-muted-foreground">Loading pipeline...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={fetchDeals} variant="outline">
              <IconRefresh className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate total stats
  const totalDeals = Object.values(dealsByStage).reduce((sum, deals) => sum + deals.length, 0);
  const totalValue = Object.values(dealsByStage)
    .flat()
    .reduce((sum, deal) => sum + (deal.amount || 0), 0);

  return (
    <div className="space-y-4">
      {/* Pipeline Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select pipeline" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sales-pipeline">Sales Pipeline</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={fetchDeals}>
            <IconRefresh className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          {totalDeals} deals • {formatCurrency(totalValue)} total value
        </div>
      </div>

      {/* Kanban Board */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {stages.map((stage) => (
              <DealColumn
                key={stage.id}
                stage={stage}
                deals={dealsByStage[stage.slug] || []}
                onDealClick={onDealClick}
                onAddDeal={() => handleAddDeal(stage.slug)}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeDeal ? (
            <div className="rotate-3 opacity-90">
              <div className="flex items-center gap-2 bg-card border border-border rounded-md px-2 py-2 shadow-lg min-w-[250px]">
                <span className="text-sm text-foreground truncate">{activeDeal.name}</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Pipeline Summary Stats */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {stages.map((stage) => {
          const deals = dealsByStage[stage.slug] || [];
          const value = deals.reduce((sum, deal) => sum + (deal.amount || 0), 0);
          const stageColor = stage.color || "#6b7280";

          return (
            <div
              key={stage.id}
              className="flex-1 min-w-[140px] rounded-lg border border-border bg-card p-3 relative overflow-hidden"
            >
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ backgroundColor: stageColor }}
              />
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-foreground">{deals.length}</span>
                {value > 0 && (
                  <span className="text-xs text-muted-foreground">{formatCurrency(value)}</span>
                )}
              </div>
              <div className="text-xs font-medium text-muted-foreground mt-0.5">{stage.name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
