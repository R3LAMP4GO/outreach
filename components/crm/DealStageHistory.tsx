"use client";

import { IconArrowRight, IconRobot, IconUser } from "@tabler/icons-react";
import { Badge } from "@/components/shadcn/ui/badge";

interface StageHistoryEntry {
  id: string;
  changed_at: string;
  automated: boolean | null;
  changed_by: string | null;
  from_stage: {
    id: string;
    name: string;
    slug: string;
  } | null;
  to_stage: {
    id: string;
    name: string;
    slug: string;
  };
  notes: string | null;
}

interface DealStageHistoryProps {
  history: StageHistoryEntry[];
}

export function DealStageHistory({ history }: DealStageHistoryProps) {
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  if (history.length === 0) {
    return <div className="text-center text-muted-foreground py-8">No stage changes yet</div>;
  }

  return (
    <div className="space-y-4">
      {history.map((entry, index) => (
        <div key={entry.id} className="flex gap-3">
          {/* Timeline connector */}
          <div className="flex flex-col items-center">
            <div
              className={`rounded-full p-2 ${
                entry.automated ? "bg-purple-900/50" : "bg-blue-900/50"
              }`}
            >
              {entry.automated ? (
                <IconRobot className="h-4 w-4 text-purple-400" />
              ) : (
                <IconUser className="h-4 w-4 text-blue-400" />
              )}
            </div>
            {index < history.length - 1 && <div className="w-px h-full bg-border mt-2" />}
          </div>

          {/* Content */}
          <div className="flex-1 pb-4">
            <div className="flex items-center gap-2 mb-1">
              {entry.from_stage && (
                <>
                  <Badge
                    variant="secondary"
                    className="bg-secondary text-secondary-foreground border-border"
                  >
                    {entry.from_stage.name}
                  </Badge>
                  <IconArrowRight className="h-4 w-4 text-muted-foreground" />
                </>
              )}
              <Badge
                variant="secondary"
                className="bg-secondary text-secondary-foreground border-border"
              >
                {entry.to_stage.name}
              </Badge>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatTimestamp(entry.changed_at)}</span>
              <span>•</span>
              <span>{entry.automated ? "Automated" : entry.changed_by || "Manual"}</span>
            </div>

            {entry.notes && <p className="text-sm text-foreground/80 mt-2">{entry.notes}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
