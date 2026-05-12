"use client";

import { useState, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { Button } from "@/components/shadcn/ui/button";
import { Separator } from "@/components/shadcn/ui/separator";
import { Card, CardContent } from "@/components/shadcn/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/shadcn/ui/alert-dialog";
import { IconCheck, IconLoader2, IconDownload, IconTrash } from "@tabler/icons-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/ui/avatar";
import { useAutosave } from "@/hooks/useAutosave";
import { toast } from "sonner";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function GeneralSettingsPage() {
  const { data: session } = useSession();
  const { setTheme } = useTheme();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const [profileSettings, setProfileSettings] = useState({
    firstName: "",
    lastName: "",
    email: "",
    jobTitle: "",
  });

  const [preferences, setPreferences] = useState({
    theme: "system",
    language: "en-AU",
    timezone: "Australia/Perth",
  });

  useEffect(() => {
    if (session?.user) {
      const nameParts = (session.user.name || "").split(" ");
      setProfileSettings((prev) => ({
        ...prev,
        firstName: nameParts[0] || "",
        lastName: nameParts.slice(1).join(" ") || "",
        email: session.user?.email || "",
      }));
    }
  }, [session]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/admin/settings");
        const data = await response.json();

        if (response.ok) {
          if (data.profile) {
            setProfileSettings({
              firstName: data.profile.firstName || "",
              lastName: data.profile.lastName || "",
              email: session?.user?.email || "",
              jobTitle: data.profile.jobTitle || "",
            });
          }
          if (data.preferences) {
            setPreferences(data.preferences);
          }
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    };

    if (session?.user) {
      loadSettings();
    }
  }, [session?.user]);

  const handleAutosave = useCallback(async () => {
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileSettings, preferences }),
      });

      const data = await response.json();

      if (!response.ok) {
        setSaveStatus("error");
        toast.error(data.error || "Failed to save settings");
        return;
      }

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      console.error("Autosave error:", error);
      setSaveStatus("error");
      toast.error("Failed to save settings");
    }
  }, [profileSettings, preferences]);

  useAutosave({ profileSettings, preferences }, handleAutosave, 800);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Save status */}
      <div className="flex items-center justify-end h-5 text-sm">
        {saveStatus === "saving" && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <IconLoader2 className="w-3 h-3 animate-spin" />
            Saving...
          </span>
        )}
        {saveStatus === "saved" && (
          <span className="flex items-center gap-1 text-green-600">
            <IconCheck className="w-3 h-3" />
            Saved
          </span>
        )}
      </div>

      {/* Profile Information */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-foreground">Profile Information</h3>
        <Card>
          <CardContent className="pt-4 space-y-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src="/android-chrome-192x192.png" alt="Profile" />
                <AvatarFallback>
                  {profileSettings.firstName?.[0]}
                  {profileSettings.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-foreground">Profile Picture</p>
                <p className="text-sm text-muted-foreground">Upload a profile picture</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-foreground">
                  First Name
                </Label>
                <Input
                  id="firstName"
                  value={profileSettings.firstName}
                  onChange={(e) =>
                    setProfileSettings({ ...profileSettings, firstName: e.target.value })
                  }
                  className="border border-gray-300 dark:border-gray-700"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-foreground">
                  Last Name
                </Label>
                <Input
                  id="lastName"
                  value={profileSettings.lastName}
                  onChange={(e) =>
                    setProfileSettings({ ...profileSettings, lastName: e.target.value })
                  }
                  className="border border-gray-300 dark:border-gray-700"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-foreground">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={profileSettings.email}
                  disabled
                  className="border border-gray-300 dark:border-gray-700 bg-muted"
                />
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="jobTitle" className="text-foreground">
                  Job Title
                </Label>
                <Input
                  id="jobTitle"
                  placeholder="e.g., Senior Developer"
                  value={profileSettings.jobTitle}
                  onChange={(e) =>
                    setProfileSettings({ ...profileSettings, jobTitle: e.target.value })
                  }
                  className="border border-gray-300 dark:border-gray-700"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preferences */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-foreground">Preferences</h3>
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="theme" className="text-sm font-medium text-foreground">
                  Theme
                </Label>
                <p className="text-xs text-muted-foreground">Choose your preferred color scheme</p>
              </div>
              <Select
                value={preferences.theme}
                onValueChange={(value) => {
                  setPreferences({ ...preferences, theme: value });
                  setTheme(value);
                }}
              >
                <SelectTrigger
                  id="theme"
                  className="w-[200px] border border-gray-300 dark:border-gray-700"
                >
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="language" className="text-sm font-medium text-foreground">
                  Language
                </Label>
                <p className="text-xs text-muted-foreground">Select your preferred language</p>
              </div>
              <Select
                value={preferences.language}
                onValueChange={(value) => setPreferences({ ...preferences, language: value })}
              >
                <SelectTrigger
                  id="language"
                  className="w-[200px] border border-gray-300 dark:border-gray-700"
                >
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en-AU">English (Australian)</SelectItem>
                  <SelectItem value="en-US">English (US)</SelectItem>
                  <SelectItem value="en-GB">English (UK)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="timezone" className="text-sm font-medium text-foreground">
                  Time Zone
                </Label>
                <p className="text-xs text-muted-foreground">Set your local time zone</p>
              </div>
              <Select
                value={preferences.timezone}
                onValueChange={(value) => setPreferences({ ...preferences, timezone: value })}
              >
                <SelectTrigger
                  id="timezone"
                  className="w-[200px] border border-gray-300 dark:border-gray-700"
                >
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="Australia/Perth">Perth (UTC+8)</SelectItem>
                  <SelectItem value="Australia/Darwin">Darwin (UTC+9:30)</SelectItem>
                  <SelectItem value="Australia/Adelaide">Adelaide (UTC+9:30)</SelectItem>
                  <SelectItem value="Australia/Brisbane">Brisbane (UTC+10)</SelectItem>
                  <SelectItem value="Australia/Sydney">Sydney (UTC+10)</SelectItem>
                  <SelectItem value="Australia/Melbourne">Melbourne (UTC+10)</SelectItem>
                  <SelectItem value="Australia/Hobart">Hobart (UTC+10)</SelectItem>
                  <SelectItem value="Pacific/Auckland">Auckland (UTC+12)</SelectItem>
                  <SelectItem value="Pacific/Fiji">Fiji (UTC+12)</SelectItem>
                  <SelectItem value="Asia/Tokyo">Tokyo (UTC+9)</SelectItem>
                  <SelectItem value="Asia/Seoul">Seoul (UTC+9)</SelectItem>
                  <SelectItem value="Asia/Shanghai">Shanghai (UTC+8)</SelectItem>
                  <SelectItem value="Asia/Hong_Kong">Hong Kong (UTC+8)</SelectItem>
                  <SelectItem value="Asia/Singapore">Singapore (UTC+8)</SelectItem>
                  <SelectItem value="Asia/Kuala_Lumpur">Kuala Lumpur (UTC+8)</SelectItem>
                  <SelectItem value="Asia/Jakarta">Jakarta (UTC+7)</SelectItem>
                  <SelectItem value="Asia/Bangkok">Bangkok (UTC+7)</SelectItem>
                  <SelectItem value="Asia/Kolkata">Mumbai (UTC+5:30)</SelectItem>
                  <SelectItem value="Asia/Dubai">Dubai (UTC+4)</SelectItem>
                  <SelectItem value="Europe/London">London (UTC+0)</SelectItem>
                  <SelectItem value="Europe/Paris">Paris (UTC+1)</SelectItem>
                  <SelectItem value="Europe/Berlin">Berlin (UTC+1)</SelectItem>
                  <SelectItem value="Europe/Amsterdam">Amsterdam (UTC+1)</SelectItem>
                  <SelectItem value="Europe/Rome">Rome (UTC+1)</SelectItem>
                  <SelectItem value="Europe/Madrid">Madrid (UTC+1)</SelectItem>
                  <SelectItem value="Europe/Moscow">Moscow (UTC+3)</SelectItem>
                  <SelectItem value="America/New_York">New York (UTC-5)</SelectItem>
                  <SelectItem value="America/Chicago">Chicago (UTC-6)</SelectItem>
                  <SelectItem value="America/Denver">Denver (UTC-7)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Los Angeles (UTC-8)</SelectItem>
                  <SelectItem value="America/Vancouver">Vancouver (UTC-8)</SelectItem>
                  <SelectItem value="America/Toronto">Toronto (UTC-5)</SelectItem>
                  <SelectItem value="America/Sao_Paulo">São Paulo (UTC-3)</SelectItem>
                  <SelectItem value="America/Buenos_Aires">Buenos Aires (UTC-3)</SelectItem>
                  <SelectItem value="UTC">UTC (UTC+0)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Account Management */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-foreground">Account Management</h3>
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Export Data</p>
                <p className="text-sm text-muted-foreground">
                  Download all your data as a JSON file
                </p>
              </div>
              <Button variant="outline" size="sm">
                <IconDownload className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-destructive">Delete Account</p>
                <p className="text-sm text-muted-foreground">
                  Permanently delete your account and all data
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <IconTrash className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Account</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete your account and all associated data. This action
                      cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete Account
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
