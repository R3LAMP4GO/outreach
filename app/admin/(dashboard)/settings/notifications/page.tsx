"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { Button } from "@/components/shadcn/ui/button";
import { Switch } from "@/components/shadcn/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/ui/card";
import { Separator } from "@/components/shadcn/ui/separator";
import { IconLoader2, IconDeviceFloppy } from "@tabler/icons-react";
import { toast } from "sonner";

export default function NotificationsSettingsPage() {
  const { data: session } = useSession();
  const [isSaving, setIsSaving] = useState(false);

  const [notifications, setNotifications] = useState({
    newContact: true,
    newSubscriber: true,
    notificationEmail: process.env.NEXT_PUBLIC_DEFAULT_ADMIN_EMAIL || "admin@example.com",
  });

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/admin/settings");
        const data = await response.json();
        if (response.ok && data.notifications) {
          setNotifications(data.notifications);
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    };
    if (session?.user) loadSettings();
  }, [session?.user]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileSettings: { firstName: "", lastName: "", email: "", jobTitle: "" },
          preferences: { theme: "system", language: "en-AU", timezone: "Australia/Perth" },
          notifications,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || "Failed to save");
        return;
      }
      toast.success("Notification preferences saved");
    } catch {
      toast.error("Failed to save preferences");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Configure how and when you receive notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">New Contact Submissions</p>
              <p className="text-xs text-muted-foreground">
                Get notified when someone submits the contact form
              </p>
            </div>
            <Switch
              checked={notifications.newContact}
              onCheckedChange={(checked: boolean) =>
                setNotifications({ ...notifications, newContact: checked })
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">New Newsletter Subscribers</p>
              <p className="text-xs text-muted-foreground">
                Get notified when someone subscribes to the newsletter
              </p>
            </div>
            <Switch
              checked={notifications.newSubscriber}
              onCheckedChange={(checked: boolean) =>
                setNotifications({ ...notifications, newSubscriber: checked })
              }
            />
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label htmlFor="notificationEmail">Notification Email</Label>
            <Input
              id="notificationEmail"
              type="email"
              value={notifications.notificationEmail}
              onChange={(e) =>
                setNotifications({ ...notifications, notificationEmail: e.target.value })
              }
              placeholder="admin@example.com"
            />
            <p className="text-xs text-muted-foreground">
              All notifications will be sent to this email address
            </p>
          </div>

          <Button onClick={handleSave} disabled={isSaving} className="shadow-sm">
            {isSaving ? (
              <IconLoader2 className="w-4 h-4 animate-spin" />
            ) : (
              <IconDeviceFloppy className="w-4 h-4" />
            )}
            Save Preferences
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
