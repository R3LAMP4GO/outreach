"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { Button } from "@/components/shadcn/ui/button";
import { Badge } from "@/components/shadcn/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/ui/dialog";
import {
  IconCheck,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconLoader2,
  IconLock,
} from "@tabler/icons-react";
import { toast } from "sonner";

export default function SecuritySettingsPage() {
  const { data: session } = useSession();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [totpSecret, setTotpSecret] = useState("");
  const [totpOtpauth, setTotpOtpauth] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [isSettingUp2FA, setIsSettingUp2FA] = useState(false);
  const [setup2FADialogOpen, setSetup2FADialogOpen] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword !== confirmNewPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setIsChangingPassword(true);
    try {
      const res = await fetch("/api/admin/security/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error);
        return;
      }
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch {
      toast.error("Failed to change password");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSetup2FA = async () => {
    try {
      const res = await fetch("/api/admin/security/totp");
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error);
        return;
      }
      const otpauthUrl = new URL(data.otpauth);
      setTotpSecret(otpauthUrl.searchParams.get("secret") || "");
      setTotpOtpauth(data.otpauth);
      setSetup2FADialogOpen(true);
    } catch {
      toast.error("Failed to generate 2FA secret");
    }
  };

  const handleEnable2FA = async () => {
    setIsSettingUp2FA(true);
    try {
      const res = await fetch("/api/admin/security/totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: totpSecret, token: totpToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error);
        return;
      }
      toast.success("2FA enabled successfully");
      setSetup2FADialogOpen(false);
      setTotpToken("");
    } catch {
      toast.error("Failed to enable 2FA");
    } finally {
      setIsSettingUp2FA(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your password to keep your account secure</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Current Password</Label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showPasswords ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPasswords(!showPasswords)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPasswords ? (
                  <IconEyeOff className="w-4 h-4" />
                ) : (
                  <IconEye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type={showPasswords ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Must be 12+ characters with uppercase, lowercase, number, and special character.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmNewPassword">Confirm New Password</Label>
            <Input
              id="confirmNewPassword"
              type={showPasswords ? "text" : "password"}
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
            />
          </div>
          <Button
            onClick={handleChangePassword}
            disabled={isChangingPassword || !currentPassword || !newPassword || !confirmNewPassword}
            className="shadow-sm"
          >
            {isChangingPassword ? (
              <IconLoader2 className="w-4 h-4 animate-spin" />
            ) : (
              <IconLock className="w-4 h-4" />
            )}
            Change Password
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>
            Protect your account with a time-based one-time password (TOTP)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Authenticator App</p>
              <p className="text-sm text-muted-foreground">
                {session?.user?.totpEnabled
                  ? "Two-factor authentication is enabled"
                  : "Add an extra layer of security to your account"}
              </p>
            </div>
            {session?.user?.totpEnabled ? (
              <Badge variant="default" className="gap-1">
                <IconCheck className="w-3 h-3" />
                Enabled
              </Badge>
            ) : (
              <Button variant="outline" size="sm" onClick={handleSetup2FA} className="shadow-sm">
                Setup 2FA
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={setup2FADialogOpen} onOpenChange={setSetup2FADialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setup Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Scan the QR code with your authenticator app and enter the verification code.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-center p-4 bg-white rounded">
              {totpOtpauth && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpOtpauth)}`}
                  alt="2FA QR Code"
                  className="w-48 h-48"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Or enter this code manually:</Label>
              <div className="flex gap-2">
                <Input value={totpSecret} readOnly className="font-mono text-sm bg-muted" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(totpSecret);
                    toast.success("Secret copied");
                  }}
                >
                  <IconCopy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="totpToken">Verification Code</Label>
              <Input
                id="totpToken"
                value={totpToken}
                onChange={(e) => setTotpToken(e.target.value)}
                placeholder="Enter 6-digit code"
                maxLength={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetup2FADialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEnable2FA} disabled={isSettingUp2FA || totpToken.length !== 6}>
              {isSettingUp2FA ? <IconLoader2 className="w-4 h-4 animate-spin" /> : null}
              Enable 2FA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
