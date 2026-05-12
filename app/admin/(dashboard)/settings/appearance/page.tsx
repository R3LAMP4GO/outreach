"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/ui/card";
import { Button } from "@/components/shadcn/ui/button";
import { Separator } from "@/components/shadcn/ui/separator";
import {
  IconLoader2,
  IconDeviceFloppy,
  IconSun,
  IconMoon,
  IconDeviceDesktop,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SkinPicker } from "@/components/settings/skin-picker";

const THEMES = [
  { value: "light", label: "Light", icon: IconSun },
  { value: "dark", label: "Dark", icon: IconMoon },
  { value: "system", label: "System", icon: IconDeviceDesktop },
] as const;

const emptySubscribe = () => () => {};
function useIsMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export default function AppearanceSettingsPage() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const mounted = useIsMounted();
  const [isSaving, setIsSaving] = useState(false);
  const [currentSkinId, setCurrentSkinId] = useState("concrete");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/admin/settings");
        const data = await res.json();
        if (res.ok) {
          if (data.preferences?.theme) setTheme(data.preferences.theme);
          if (data.skinId) setCurrentSkinId(data.skinId);
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    };
    if (session?.user) load();
  }, [session?.user]);

  const handleSaveTheme = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileSettings: { firstName: "", lastName: "", email: "", jobTitle: "" },
          preferences: { theme: theme || "system", language: "en-AU", timezone: "Australia/Perth" },
          notifications: { newContact: true, newSubscriber: true, notificationEmail: "" },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save");
        return;
      }
      toast.success("Theme saved");
    } catch {
      toast.error("Failed to save theme");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customise the look and feel of the dashboard</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Theme picker */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">Theme</h3>
              <p className="text-xs text-muted-foreground">
                Choose light, dark, or follow your system
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {THEMES.map((t) => {
                const isActive = mounted && theme === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTheme(t.value)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
                      isActive
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <t.icon className="size-6" />
                    <span className="text-sm font-medium">{t.label}</span>
                  </button>
                );
              })}
            </div>
            <Button onClick={handleSaveTheme} disabled={isSaving} size="sm" className="shadow-sm">
              {isSaving ? (
                <IconLoader2 className="w-4 h-4 animate-spin" />
              ) : (
                <IconDeviceFloppy className="w-4 h-4" />
              )}
              Save theme
            </Button>
          </div>

          <Separator />

          {/* Colour scheme / skin picker */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">Colour Scheme</h3>
              <p className="text-xs text-muted-foreground">
                Choose a colour accent for the dashboard
              </p>
            </div>
            <SkinPicker currentSkinId={currentSkinId} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
