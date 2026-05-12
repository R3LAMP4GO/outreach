"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { Button } from "@/components/shadcn/ui/button";
import { Separator } from "@/components/shadcn/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/ui/card";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/ui/avatar";
import {
  IconDeviceFloppy,
  IconDownload,
  IconLoader2,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

export default function ProfileSettingsPage() {
  const { data: session } = useSession();
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    email: "",
    jobTitle: "",
    avatarUrl: "" as string | null,
  });

  const [preferences, setPreferences] = useState({
    language: "en-AU",
    timezone: "Australia/Perth",
  });

  useEffect(() => {
    if (session?.user) {
      const nameParts = (session.user.name || "").split(" ");
      setProfile((prev) => ({
        ...prev,
        firstName: nameParts[0] || "",
        lastName: nameParts.slice(1).join(" ") || "",
        email: session.user?.email || "",
      }));
    }
  }, [session]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/admin/settings");
        const data = await res.json();
        if (res.ok) {
          if (data.profile) {
            setProfile({
              firstName: data.profile.firstName || "",
              lastName: data.profile.lastName || "",
              email: session?.user?.email || "",
              jobTitle: data.profile.jobTitle || "",
              avatarUrl: data.profile.avatarUrl || null,
            });
          }
          if (data.preferences) {
            setPreferences({
              language: data.preferences.language || "en-AU",
              timezone: data.preferences.timezone || "Australia/Perth",
            });
          }
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    };
    if (session?.user) load();
  }, [session?.user]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2MB");
      e.target.value = "";
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/upload/avatar", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to upload avatar");
        return;
      }

      setProfile((prev) => ({ ...prev, avatarUrl: data.url }));
      toast.success("Avatar uploaded");
    } catch {
      toast.error("Failed to upload avatar");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    setIsUploading(true);
    try {
      const res = await fetch("/api/admin/upload/avatar", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to remove avatar");
        return;
      }
      setProfile((prev) => ({ ...prev, avatarUrl: null }));
      toast.success("Avatar removed");
    } catch {
      toast.error("Failed to remove avatar");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileSettings: {
            firstName: profile.firstName,
            lastName: profile.lastName,
            jobTitle: profile.jobTitle,
          },
          preferences: { theme: "system", ...preferences },
          notifications: { newContact: true, newSubscriber: true, notificationEmail: "" },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save");
        return;
      }
      toast.success("Profile saved");
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  };

  const initials = `${profile.firstName?.[0] ?? ""}${profile.lastName?.[0] ?? ""}`.toUpperCase();

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your personal information and preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar upload */}
          <div className="flex items-center gap-5">
            <Avatar className="h-20 w-20 shrink-0">
              <AvatarImage src={profile.avatarUrl || undefined} alt={profile.firstName} />
              <AvatarFallback className="text-lg font-semibold">{initials || "?"}</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <IconLoader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <IconUpload className="w-4 h-4 mr-2" />
                  )}
                  Upload photo
                </Button>
                {profile.avatarUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveAvatar}
                    disabled={isUploading}
                  >
                    <IconX className="w-4 h-4 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPG or WebP. Max 2MB.</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          <Separator />

          {/* Name */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={profile.firstName}
                onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={profile.lastName}
                onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
              />
            </div>
          </div>

          {/* Email + Job Title */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={profile.email}
                disabled
                className="opacity-60"
              />
              <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jobTitle">Job Title</Label>
              <Input
                id="jobTitle"
                placeholder="e.g., Senior Developer"
                value={profile.jobTitle}
                onChange={(e) => setProfile({ ...profile, jobTitle: e.target.value })}
              />
            </div>
          </div>

          <Separator />

          {/* Language + Timezone */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="language">Language</Label>
              <Select
                value={preferences.language}
                onValueChange={(v) => setPreferences({ ...preferences, language: v })}
              >
                <SelectTrigger id="language">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en-AU">English (Australian)</SelectItem>
                  <SelectItem value="en-US">English (US)</SelectItem>
                  <SelectItem value="en-GB">English (UK)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="timezone">Time Zone</Label>
              <Select
                value={preferences.timezone}
                onValueChange={(v) => setPreferences({ ...preferences, timezone: v })}
              >
                <SelectTrigger id="timezone">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  <SelectItem value="Australia/Perth">Perth (UTC+8)</SelectItem>
                  <SelectItem value="Australia/Darwin">Darwin (UTC+9:30)</SelectItem>
                  <SelectItem value="Australia/Adelaide">Adelaide (UTC+9:30)</SelectItem>
                  <SelectItem value="Australia/Brisbane">Brisbane (UTC+10)</SelectItem>
                  <SelectItem value="Australia/Sydney">Sydney (UTC+10)</SelectItem>
                  <SelectItem value="Australia/Melbourne">Melbourne (UTC+10)</SelectItem>
                  <SelectItem value="Australia/Hobart">Hobart (UTC+10)</SelectItem>
                  <SelectItem value="Pacific/Auckland">Auckland (UTC+12)</SelectItem>
                  <SelectItem value="Asia/Tokyo">Tokyo (UTC+9)</SelectItem>
                  <SelectItem value="Asia/Singapore">Singapore (UTC+8)</SelectItem>
                  <SelectItem value="Asia/Dubai">Dubai (UTC+4)</SelectItem>
                  <SelectItem value="Europe/London">London (UTC+0)</SelectItem>
                  <SelectItem value="Europe/Paris">Paris (UTC+1)</SelectItem>
                  <SelectItem value="Europe/Berlin">Berlin (UTC+1)</SelectItem>
                  <SelectItem value="America/New_York">New York (UTC-5)</SelectItem>
                  <SelectItem value="America/Chicago">Chicago (UTC-6)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Los Angeles (UTC-8)</SelectItem>
                  <SelectItem value="UTC">UTC (UTC+0)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={handleSave} disabled={isSaving} className="shadow-sm">
            {isSaving ? (
              <IconLoader2 className="w-4 h-4 animate-spin" />
            ) : (
              <IconDeviceFloppy className="w-4 h-4" />
            )}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Account / danger zone */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Manage your account data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Export Data</p>
              <p className="text-sm text-muted-foreground">Download all your data as a JSON file</p>
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
  );
}
