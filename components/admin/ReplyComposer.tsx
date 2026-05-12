"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/shadcn/ui/button";
import { Textarea } from "@/components/shadcn/ui/textarea";
import {
  IconSend,
  IconPaperclip,
  IconTrash,
  IconX,
  IconDots,
  IconArrowBackUp,
  IconRobot,
} from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/ui/tooltip";

interface ReplyComposerProps {
  replyId: string;
  recipientName: string;
  recipientEmail: string;
  /**
   * Pre-existing draft to load into the textarea (e.g. an unsent draft the
   * user started earlier). Leave empty to start with a blank composer.
   */
  initialMessage?: string;
  /**
   * AI-generated reply suggestion. NOT inserted automatically — surfaced
   * only when the user clicks the Ask AI button.
   */
  aiSuggestion?: string;
  isSent?: boolean;
  onSent?: (replyId: string, sentAt: string, body: string, senderEmail: string) => void;
  /** Optional handler for the Discard button. If omitted, the button is hidden. */
  onDiscard?: () => void;
}

export function ReplyComposer({
  replyId,
  recipientName,
  recipientEmail,
  initialMessage = "",
  aiSuggestion,
  isSent = false,
  onSent,
  onDiscard,
}: ReplyComposerProps) {
  const [message, setMessage] = useState(initialMessage);
  const [sending, setSending] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`/api/outreach/replies/${replyId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: message }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to send reply");
        return;
      }

      if (data.warning) {
        toast.warning("Reply sent — metadata sync failed");
      } else {
        toast.success("Reply sent");
      }
      onSent?.(
        replyId,
        data.reply.reply_sent_at,
        data.reply.reply_body ?? message,
        data.reply.reply_sender_email ?? "",
      );
    } catch {
      toast.error("Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  // When the reply has already been sent, render nothing here — the
  // "Replied" tag in the detail header conveys the same status without
  // taking up vertical space at the bottom of the thread.
  if (isSent) {
    return null;
  }

  const toolbarIconBtn =
    "flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors";
  const trashBtn =
    "flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:hover:bg-transparent transition-colors";

  return (
    <div
      data-reply-composer
      className="border border-border rounded-lg overflow-hidden bg-background"
    >
      {/* Recipient row — reply-arrow indicator, name chip with ×,
          Cc/Bcc toggle on the right, and a … more menu */}
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 text-sm">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Decorative back-arrow indicating "this is a reply to…" */}
          <IconArrowBackUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />

          {/* Recipient chip — name + X. Tooltip shows the email on hover. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 text-foreground min-w-0 max-w-full">
                <span className="font-medium truncate">{recipientName}</span>
                {onDiscard && (
                  <button
                    type="button"
                    onClick={onDiscard}
                    aria-label="Remove recipient and discard"
                    className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                  >
                    <IconX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">{recipientEmail}</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!showCcBcc && (
            <button
              type="button"
              onClick={() => setShowCcBcc(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5"
            >
              Cc/Bcc
            </button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => toast.info("More actions are coming soon.")}
                aria-label="More"
                className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <IconDots className="w-[18px] h-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">More</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Cc / Bcc rows — only shown when expanded */}
      {showCcBcc && (
        <div className="px-4 pb-2 text-sm space-y-1">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground w-8">Cc</span>
            <input
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="Add recipient"
              className="flex-1 bg-transparent border-0 outline-none placeholder:text-muted-foreground text-foreground"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground w-8">Bcc</span>
            <input
              type="text"
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              placeholder="Add recipient"
              className="flex-1 bg-transparent border-0 outline-none placeholder:text-muted-foreground text-foreground"
            />
          </div>
        </div>
      )}

      {/* Inset divider — sits below the recipient block, indented from each edge so it
          doesn't touch the rounded corners */}
      <div className="mx-6 border-t border-border" />

      {/* Compose area — no border, no shadow above or below the toolbar */}
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={`Write, or press "space" for AI, "/" for commands…`}
        className="min-h-[140px] resize-none rounded-none border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm px-4 py-3"
      />

      {/* Toolbar — compact Send pill on the left, icon actions on the right.
          No divider above; padding alone separates this from the textarea. */}
      <div className="flex items-center justify-between px-3 pb-2">
        <Button
          onClick={handleSend}
          size="sm"
          disabled={sending || !message.trim()}
          className="h-7 px-3 text-xs gap-1"
        >
          <IconSend className="w-3.5 h-3.5" />
          {sending ? "Sending…" : "Send"}
        </Button>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  if (!aiSuggestion) {
                    toast.info("No AI suggestion available for this reply yet.");
                    return;
                  }
                  setMessage(aiSuggestion);
                  toast.success("AI suggestion inserted — edit before sending.");
                }}
                aria-label="Ask AI"
                className={toolbarIconBtn}
              >
                <IconRobot className="w-[18px] h-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Ask AI</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={sending}
                onClick={() => toast.info("Attachments are coming soon.")}
                aria-label="Add attachment"
                className={toolbarIconBtn}
              >
                <IconPaperclip className="w-[18px] h-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Attach file</TooltipContent>
          </Tooltip>

          {onDiscard && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={sending}
                  onClick={onDiscard}
                  aria-label="Delete draft"
                  className={trashBtn}
                >
                  <IconTrash className="w-[18px] h-[18px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Delete draft</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}
