"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface Notification {
  id: string;
  type: string;
  priority: string;
  title: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  relatedId: string | null;
  relatedType: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

const POLL_INTERVAL = 30_000;

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data: NotificationsResponse = await res.json();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // silently fail on poll errors
    } finally {
      setIsLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      if (!res.ok) return;
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silently fail
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/mark-all-read", { method: "POST" });
      if (!res.ok) return;
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt ?? new Date().toISOString() })),
      );
      setUnreadCount(0);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  };
}
