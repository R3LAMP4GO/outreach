"use client";

/**
 * Sticky action row on the prospect cockpit.
 *
 * Buttons:
 *   - Call           \u2014 native `tel:` (Quo desktop/mobile picks it up if
 *                      installed; OS dialer is the universal fallback).
 *   - SMS            \u2014 opens a compose dialog, POSTs to
 *                      `/api/admin/prospects/[id]/sms` which calls Quo
 *                      `sendSms()`.
 *   - Email          \u2014 opens a compose dialog. Disabled when the prospect
 *                      has no primary contact with an email. We hand off to
 *                      the native mail client via `mailto:` (same handoff
 *                      pattern as Call) instead of duplicating the campaign
 *                      sender from `/api/outreach/send-email`, which expects
 *                      a sequenced campaign contact, not an ad-hoc prospect.
 *   - Mark called    \u2014 PATCHes the prospect to `outreachStage = 'called'`
 *                      and bumps `lastTouchedAt`.
 *   - Promote        \u2014 POSTs to `/api/admin/prospects/[id]/promote`; only
 *                      enabled when an email-captured contact exists.
 *
 * Card / button spacing copies the prospect filter row + leads "bulk actions"
 * strip so it reads as the same idiom.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconMail, IconMessage, IconPhone, IconPhoneCheck, IconRocket } from "@tabler/icons-react";
import { toast } from "sonner";

import { Button } from "@/components/shadcn/ui/button";
import { Card, CardContent } from "@/components/shadcn/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/ui/dialog";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { Textarea } from "@/components/shadcn/ui/textarea";

interface ActionsRowProps {
  prospectId: string;
  businessName: string;
  phone: string | null;
  primaryContactEmail: string | null;
  hasEmailContact: boolean;
}

export function ActionsRow({
  prospectId,
  businessName,
  phone,
  primaryContactEmail,
  hasEmailContact,
}: ActionsRowProps) {
  const router = useRouter();
  const [smsOpen, setSmsOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const telHref = phone ? `tel:${phone.replace(/\s+/g, "")}` : undefined;

  const handleMarkCalled = async () => {
    try {
      setMarking(true);
      const response = await fetch(`/api/admin/prospects/${prospectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markCalled: true }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(data.error ?? "Failed to mark as called");
        return;
      }
      toast.success("Marked as called");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to mark as called");
    } finally {
      setMarking(false);
    }
  };

  const handlePromote = async () => {
    try {
      setPromoting(true);
      const response = await fetch(`/api/admin/prospects/${prospectId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        dealId?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? "Failed to promote prospect");
        return;
      }
      toast.success("Promoted to CRM");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to promote prospect");
    } finally {
      setPromoting(false);
    }
  };

  return (
    <>
      <Card className="sticky top-0 z-20">
        <CardContent className="flex flex-wrap gap-2 pt-6">
          <Button variant="outline" size="sm" asChild={Boolean(telHref)} disabled={!telHref}>
            {telHref ? (
              <a href={telHref}>
                <IconPhone className="h-4 w-4 mr-2" />
                Call
              </a>
            ) : (
              <span>
                <IconPhone className="h-4 w-4 mr-2" />
                Call
              </span>
            )}
          </Button>

          <Button variant="outline" size="sm" disabled={!phone} onClick={() => setSmsOpen(true)}>
            <IconMessage className="h-4 w-4 mr-2" />
            SMS
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={!hasEmailContact}
            onClick={() => setEmailOpen(true)}
          >
            <IconMail className="h-4 w-4 mr-2" />
            Email
          </Button>

          <Button variant="outline" size="sm" onClick={handleMarkCalled} disabled={marking}>
            <IconPhoneCheck className="h-4 w-4 mr-2" />
            {marking ? "Marking\u2026" : "Mark called"}
          </Button>

          <Button
            size="sm"
            onClick={handlePromote}
            disabled={!hasEmailContact || promoting}
            title={hasEmailContact ? undefined : "Add a person with an email to enable"}
          >
            <IconRocket className="h-4 w-4 mr-2" />
            {promoting ? "Promoting\u2026" : "Promote to CRM"}
          </Button>
        </CardContent>
      </Card>

      <SmsDialog
        open={smsOpen}
        onOpenChange={setSmsOpen}
        prospectId={prospectId}
        businessName={businessName}
        phone={phone}
        onSent={() => router.refresh()}
      />
      <EmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        businessName={businessName}
        toEmail={primaryContactEmail}
      />
    </>
  );
}

interface SmsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospectId: string;
  businessName: string;
  phone: string | null;
  onSent: () => void;
}

function SmsDialog({
  open,
  onOpenChange,
  prospectId,
  businessName,
  phone,
  onSent,
}: SmsDialogProps) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!content.trim()) {
      toast.error("Type a message first");
      return;
    }
    try {
      setSending(true);
      const response = await fetch(`/api/admin/prospects/${prospectId}/sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? "Failed to send SMS");
        return;
      }
      toast.success("SMS sent");
      setContent("");
      onOpenChange(false);
      onSent();
    } catch (err) {
      console.error(err);
      toast.error("Failed to send SMS");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send SMS to {businessName}</DialogTitle>
          <DialogDescription>Goes to {phone ?? "\u2014"} via Quo.</DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-2">
          <Label htmlFor="sms-content">Message</Label>
          <Textarea
            id="sms-content"
            rows={5}
            placeholder="Hey, quick follow-up\u2026"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={1600}
          />
          <p className="text-xs text-muted-foreground text-right">{content.length}/1600</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || !content.trim() || !phone}>
            {sending ? "Sending\u2026" : "Send SMS"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessName: string;
  toEmail: string | null;
}

function EmailDialog({ open, onOpenChange, businessName, toEmail }: EmailDialogProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const handleOpen = () => {
    if (!toEmail) return;
    const params = new URLSearchParams();
    if (subject.trim()) params.set("subject", subject.trim());
    if (body.trim()) params.set("body", body.trim());
    const qs = params.toString();
    const mailto = `mailto:${toEmail}${qs ? `?${qs}` : ""}`;
    // Hand off to the OS mail client \u2014 same pattern as Call/Tel hands off
    // to the native dialer.
    window.location.href = mailto;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Email {businessName}</DialogTitle>
          <DialogDescription>
            {toEmail
              ? `Opens your mail client addressed to ${toEmail}.`
              : "No email captured yet \u2014 add a person with an email first."}
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Quick question about your SEO report"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-body">Body</Label>
            <Textarea
              id="email-body"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi,\n\nWe put together a quick report on your site\u2026"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleOpen} disabled={!toEmail}>
            Open mail client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
