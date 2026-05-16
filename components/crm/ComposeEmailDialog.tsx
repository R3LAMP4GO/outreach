"use client";

/**
 * ComposeEmailDialog
 *
 * Cold first-touch email composer. Opens from the CRM contact detail sheet.
 * Subject + body, submits to POST /api/crm/contacts/[id]/send-email.
 *
 * The from-address is set server-side based on the logged-in admin's email
 * (see selectSenderForUser in lib/outreach/sending/sender.ts), so Isaac's
 * sends come from isaac@wearedouro.com and Josh's from josh@wearedouro.com.
 * No UI control needed for that here.
 */

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/ui/dialog";
import { Button } from "@/components/shadcn/ui/button";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { Textarea } from "@/components/shadcn/ui/textarea";
import { IconLoader2, IconSend } from "@tabler/icons-react";

interface ComposeEmailDialogProps {
  contactId: string;
  contactEmail: string;
  contactName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}

export function ComposeEmailDialog({
  contactId,
  contactEmail,
  contactName,
  open,
  onOpenChange,
  onSent,
}: ComposeEmailDialogProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and body are required");
      return;
    }
    setSending(true);
    try {
      const response = await fetch(`/api/crm/contacts/${contactId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? `Send failed (HTTP ${response.status})`);
        return;
      }
      toast.success(`Email sent from ${data.sender} to ${contactEmail}`);
      setSubject("");
      setBody("");
      onOpenChange(false);
      onSent?.();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Send email</DialogTitle>
          <DialogDescription>
            From your mailbox to <span className="font-medium">{contactName ?? contactEmail}</span>{" "}
            ({contactEmail}). Reply-To is your address, so replies come back to you directly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="compose-subject">Subject</Label>
            <Input
              id="compose-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Quick follow-up from our call"
              maxLength={200}
              disabled={sending}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="compose-body">Message</Label>
            <Textarea
              id="compose-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`Hi ${contactName?.split(" ")[0] ?? "there"},\n\nThanks for picking up earlier...`}
              rows={10}
              maxLength={10000}
              disabled={sending}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Plain text. Blank lines become paragraphs. {body.length}/10000 characters.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || !subject.trim() || !body.trim()}>
            {sending ? (
              <>
                <IconLoader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <IconSend className="w-4 h-4 mr-2" />
                Send
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
