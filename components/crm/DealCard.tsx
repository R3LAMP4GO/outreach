"use client";

import { IconGripVertical, IconDots } from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/ui/dropdown-menu";
import { Button } from "@/components/shadcn/ui/button";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

export interface DealCardProps {
  deal: {
    id: string;
    name: string;
    amount: number | null;
    source?: string;
    created_at?: string;
    contact?: {
      id?: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
    } | null;
  };
  onClick?: () => void;
}

export function DealCard({ deal, onClick }: DealCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 bg-muted/50 border border-border rounded-md px-2 py-2 hover:bg-muted hover:border-border transition-colors cursor-pointer group"
      onClick={onClick}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <IconGripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Deal name */}
      <span className="flex-1 min-w-0 text-sm text-foreground truncate">{deal.name}</span>

      {/* Actions menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-foreground"
          >
            <IconDots className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>View Details</DropdownMenuItem>
          <DropdownMenuItem>Edit</DropdownMenuItem>
          <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
