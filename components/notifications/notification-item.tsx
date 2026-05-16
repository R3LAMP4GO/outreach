"use client";

import {
  IconAlertTriangle,
  IconBan,
  IconCalendarTime,
  IconCircleCheck,
  IconInfoCircle,
  IconMessage,
} from "@tabler/icons-react";
import { cn } from "@/components/shadcn/lib/utils";
import { type Notification } from "@/hooks/use-notifications";

/**
 * Pick an icon based on notification type first (so the dropdown distinguishes
 * SMS / follow-up / hot-lead at a glance) and fall back to priority for any
 * generic alerts. Mirrors the shape used by `lib/crm/event-styles.ts`.
 */
function getNotificationIcon(type: string, priority: string) {
  switch (type) {
    case "sms_received":
      return <IconMessage className="h-4 w-4 shrink-0 text-green-500" />;
    case "follow_up_due":
      return <IconCalendarTime className="h-4 w-4 shrink-0 text-slate-500" />;
    case "video_engagement":
    case "video_hot_lead":
      // Hot-lead signal from the cap-polling job. Emerald to match the
      // `video_completed` timeline style.
      return <IconCircleCheck className="h-4 w-4 shrink-0 text-emerald-500" />;
  }
  switch (priority) {
    case "CRITICAL":
      return <IconBan className="h-4 w-4 shrink-0 text-red-500" />;
    case "WARNING":
      return <IconAlertTriangle className="h-4 w-4 shrink-0 text-yellow-500" />;
    default:
      return <IconInfoCircle className="h-4 w-4 shrink-0 text-blue-500" />;
  }
}

function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

interface NotificationItemProps
  extends Pick<Notification, "type" | "priority" | "title" | "isRead" | "createdAt"> {
  onClick?: () => void;
}

export function NotificationItem({
  type,
  priority,
  title,
  isRead,
  createdAt,
  onClick,
}: NotificationItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left shadow-sm transition-colors hover:bg-muted/40",
        !isRead ? "border-border bg-muted/20" : "border-border/60 bg-background",
      )}
    >
      <div className="mt-0.5">{getNotificationIcon(type, priority)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-sm",
              !isRead ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
            )}
          >
            {title}
          </span>
          {!isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
        </div>
        <span className="mt-1 block text-xs text-muted-foreground/70">
          {formatRelativeTime(createdAt)}
        </span>
      </div>
    </button>
  );
}
