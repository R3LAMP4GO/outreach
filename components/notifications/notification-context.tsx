"use client";

import { createContext, type ReactNode, useContext } from "react";
import { useNotifications, type Notification } from "@/hooks/use-notifications";

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refetch: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const value = useNotifications();
  return <NotificationContext value={value}>{children}</NotificationContext>;
}

export function useNotificationContext(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotificationContext must be used within NotificationProvider");
  return ctx;
}
