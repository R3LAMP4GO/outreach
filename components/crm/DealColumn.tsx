"use client";

import { DealCard } from "./DealCard";
import { Button } from "@/components/shadcn/ui/button";
import { IconPlus } from "@tabler/icons-react";
import { Badge } from "@/components/shadcn/ui/badge";
import { useDroppable } from "@dnd-kit/core";
import { formatCurrency } from "@/lib/utils";

export interface DealColumnProps {
  stage: {
    id: string;
    name: string;
    slug: string;
    color: string | null;
    display_order: number;
  };
  deals: Array<{
    id: string;
    name: string;
    amount: number | null;
    probability: number | null;
    contact?: {
      first_name: string | null;
      last_name: string | null;
      email: string;
    } | null;
  }>;
  onDealClick?: (dealId: string) => void;
  onAddDeal?: () => void;
}

export function DealColumn({ stage, deals, onDealClick, onAddDeal }: DealColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.slug,
  });

  // Use DB hex color, fallback to gray
  const stageColor = stage.color || "#6b7280";

  // Calculate total value
  const totalValue = deals.reduce((sum, deal) => sum + (deal.amount || 0), 0);

  const formatValue = (value: number) => {
    if (value === 0) return "$0";
    return formatCurrency(value);
  };

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[320px] max-w-[320px] bg-card rounded-lg border border-border transition-colors ${
        isOver ? "ring-2 ring-ring bg-muted" : ""
      }`}
    >
      {/* Column Header */}
      <div className="rounded-t-lg px-3 py-3 text-white" style={{ backgroundColor: stageColor }}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{stage.name}</h3>
          <Badge
            variant="secondary"
            className="bg-white/20 text-white border-white/30 text-xs px-1.5 py-0"
          >
            {deals.length}
          </Badge>
        </div>
        <div className="text-xs opacity-80 mt-1">{formatValue(totalValue)} total value</div>
      </div>

      {/* Deals List */}
      <div className="flex-1 p-2 space-y-1.5 overflow-y-auto max-h-[calc(100vh-340px)]">
        {deals.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-6">
            No deals in this stage
          </div>
        ) : (
          deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} onClick={() => onDealClick?.(deal.id)} />
          ))
        )}
      </div>

      {/* Add Deal Button */}
      <div className="p-2 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          onClick={onAddDeal}
        >
          <IconPlus className="h-4 w-4 mr-2" />
          Add Deal
        </Button>
      </div>
    </div>
  );
}
