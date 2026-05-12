"use client";

import Image from "next/image";
import { IconBellOff, IconChecks } from "@tabler/icons-react";
import { Button } from "@/components/shadcn/ui/button";
import { useSiteSettings } from "@/lib/site-settings-context";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/ui/sheet";
import { type Notification } from "@/hooks/use-notifications";
import { NotificationItem } from "./notification-item";

interface NotificationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: Notification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => Promise<void>;
  onMarkAllAsRead: () => Promise<void>;
}

function groupByDate(notifications: Notification[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: { label: string; items: Notification[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Older", items: [] },
  ];

  for (const n of notifications) {
    const date = new Date(n.createdAt);
    date.setHours(0, 0, 0, 0);
    if (date >= today) groups[0].items.push(n);
    else if (date >= yesterday) groups[1].items.push(n);
    else groups[2].items.push(n);
  }

  return groups.filter((g) => g.items.length > 0);
}

const DEFAULT_LOGO = "/logos/logo.svg";
const DEFAULT_NAME = "__YOUR_BRAND__";

export function NotificationSheet({
  open,
  onOpenChange,
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
}: NotificationSheetProps) {
  const groups = groupByDate(notifications);
  const { settings } = useSiteSettings();
  const logoSrc = settings.logoUrl || DEFAULT_LOGO;
  const businessName = settings.businessName || DEFAULT_NAME;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <Image
              src={logoSrc}
              alt={businessName}
              width={56}
              height={56}
              className="h-14 w-14 shrink-0 rounded-xl object-contain"
            />
            <div className="flex-1">
              <SheetTitle>
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({unreadCount} unread)
                  </span>
                )}
              </SheetTitle>
              <SheetDescription>Your recent alerts and updates.</SheetDescription>
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onMarkAllAsRead}
                className="shrink-0 gap-1.5 text-xs"
              >
                <IconChecks className="h-3.5 w-3.5" />
                Mark all read
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto pb-4 pt-1">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <IconBellOff className="h-10 w-10 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">No notifications yet</p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  You&apos;ll see alerts and updates here.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <div key={group.label}>
                  <h3 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {group.label}
                  </h3>
                  <div className="space-y-2">
                    {group.items.map((n) => (
                      <NotificationItem
                        key={n.id}
                        priority={n.priority}
                        title={n.title}
                        isRead={n.isRead}
                        createdAt={n.createdAt}
                        onClick={() => {
                          if (!n.isRead) onMarkAsRead(n.id);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
