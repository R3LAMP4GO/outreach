"use client";

import { useState } from "react";
import { IconBell } from "@tabler/icons-react";
import { cn } from "@/components/shadcn/lib/utils";
import { useNotificationContext } from "./notification-context";
import { NotificationSheet } from "./notification-sheet";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationContext();

  return (
    <>
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen(true)}
        className={cn(
          "relative flex items-center justify-center size-7 rounded-md text-foreground hover:bg-accent transition-colors",
        )}
      >
        <IconBell size={20} />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <NotificationSheet
        open={open}
        onOpenChange={setOpen}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkAsRead={markAsRead}
        onMarkAllAsRead={markAllAsRead}
      />
    </>
  );
}
