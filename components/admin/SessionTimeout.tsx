"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/ui/dialog";
import { Button } from "@/components/shadcn/ui/button";
import { IconClock, IconLoader2 } from "@tabler/icons-react";

/**
 * Session Timeout Warning Component
 *
 * Features:
 * - Tracks user activity (mouse, keyboard, touch)
 * - Shows warning 5 minutes before session expires
 * - Allows session extension via activity
 * - Auto-logout on expiration
 *
 * Session duration: 8 hours (configured in lib/auth.ts)
 */

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
const WARNING_BEFORE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const ACTIVITY_CHECK_INTERVAL_MS = 60 * 1000; // Check every minute
const MIN_EXTENSION_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes between extensions

export function SessionTimeout() {
  const { status, update } = useSession();
  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [extending, setExtending] = useState(false);
  // Refs are initialized to 0 (a pure value); the real start timestamps are
  // assigned on mount inside the activity-listener effect below. Calling
  // Date.now() directly in the useRef initializer is an impure render call
  // (react-hooks/purity).
  const lastActivityRef = useRef<number>(0);
  const sessionStartRef = useRef<number>(0);
  const lastExtensionRef = useRef<number>(0);

  // Track user activity
  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
  }, []);

  // Handle session extension
  const extendSession = useCallback(async () => {
    setExtending(true);
    try {
      // Trigger session refresh
      await update();
      sessionStartRef.current = Date.now();
      lastActivityRef.current = Date.now();
      lastExtensionRef.current = Date.now();
      setShowWarning(false);
    } catch (error) {
      console.error("Failed to extend session:", error);
    } finally {
      setExtending(false);
    }
  }, [update]);

  // Handle logout
  const handleLogout = useCallback(async () => {
    // NextAuth v5 beta workaround: force full page reload
    // redirect: false has known issues in v5 beta
    await signOut({ redirect: false });
    window.location.replace("/admin/login");
  }, []);

  // Setup activity listeners
  useEffect(() => {
    if (status !== "authenticated") return;

    // Lazy-initialize the timestamp refs on first authenticated mount.
    const now = Date.now();
    if (sessionStartRef.current === 0) sessionStartRef.current = now;
    if (lastActivityRef.current === 0) lastActivityRef.current = now;

    const events = ["mousedown", "keydown", "scroll", "touchstart"];

    events.forEach((event) => {
      window.addEventListener(event, updateActivity, { passive: true });
    });

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, updateActivity);
      });
    };
  }, [status, updateActivity]);

  // Check session expiration periodically
  useEffect(() => {
    if (status !== "authenticated") return;

    const interval = setInterval(() => {
      const now = Date.now();
      const sessionAge = now - sessionStartRef.current;
      const timeSinceActivity = now - lastActivityRef.current;
      const remainingTime = SESSION_DURATION_MS - sessionAge;

      // Update time remaining display
      setTimeRemaining(Math.max(0, remainingTime));

      // Show warning if approaching expiration
      if (remainingTime <= WARNING_BEFORE_EXPIRY_MS && remainingTime > 0) {
        setShowWarning(true);
      }

      // Auto-logout if session expired
      if (remainingTime <= 0) {
        handleLogout();
      }

      // Auto-extend session if user has been active recently
      // Only extend once every 30 minutes to avoid excessive API calls
      const timeSinceLastExtension = now - lastExtensionRef.current;
      if (
        timeSinceActivity < ACTIVITY_CHECK_INTERVAL_MS &&
        remainingTime < SESSION_DURATION_MS / 2 &&
        timeSinceLastExtension > MIN_EXTENSION_INTERVAL_MS
      ) {
        extendSession();
      }
    }, ACTIVITY_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [status, extendSession, handleLogout]);

  // Format time remaining
  const formatTimeRemaining = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  if (status !== "authenticated") return null;

  return (
    <Dialog open={showWarning} onOpenChange={setShowWarning}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconClock className="w-5 h-5 text-yellow-600" />
            Session Expiring Soon
          </DialogTitle>
          <DialogDescription>
            Your session will expire in {formatTimeRemaining(timeRemaining)}. Click &quot;Stay
            Logged In&quot; to extend your session, or you&apos;ll be automatically logged out.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={handleLogout} disabled={extending}>
            Log Out Now
          </Button>
          <Button onClick={extendSession} disabled={extending}>
            {extending && <IconLoader2 className="w-4 h-4 mr-2 animate-spin" />}
            Stay Logged In
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
