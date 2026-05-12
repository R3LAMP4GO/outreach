"use client";

import { useState, useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";
import { IconChevronDown, IconArrowBackUp, IconArrowForwardUp } from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/ui/tooltip";

export interface ThreadMessage {
  id: string;
  sender: {
    name: string;
    email: string;
    avatar?: string;
    type: "contact" | "self";
  };
  subject: string;
  body: string;
  sentAt: string;
  sequenceNumber?: number;
}

interface EmailThreadProps {
  messages: ThreadMessage[];
  /**
   * Display name for outbound (self) messages — defaults to "You".
   * Pass the admin's real name to match Notion-style display.
   */
  selfName?: string;
  /**
   * Recipient email shown under outbound messages as "To: …".
   * If omitted, shows just the email when present, otherwise nothing.
   */
  recipientEmail?: string;
  /** Click handler for the reply icon next to each expanded message's timestamp. */
  onReply?: (message: ThreadMessage) => void;
  /** Click handler for the forward icon next to each expanded message's timestamp. */
  onForward?: (message: ThreadMessage) => void;
}

function formatDate(date: string) {
  return new Date(date).toLocaleString("en-AU", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(date: string) {
  return new Date(date).toLocaleString("en-AU", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function plainPreview(html: string, len = 90) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, len);
}

interface MessageRowProps {
  message: ThreadMessage;
  isExpanded: boolean;
  isLatest: boolean;
  onToggle: () => void;
  selfName: string;
  recipientEmail?: string;
  onReply?: (message: ThreadMessage) => void;
  onForward?: (message: ThreadMessage) => void;
}

function MessageRow({
  message,
  isExpanded,
  isLatest,
  onToggle,
  selfName,
  recipientEmail,
  onReply,
  onForward,
}: MessageRowProps) {
  const sanitizedBody = useMemo(() => {
    return DOMPurify.sanitize(message.body, {
      ALLOWED_TAGS: [
        "p",
        "br",
        "strong",
        "em",
        "u",
        "a",
        "ul",
        "ol",
        "li",
        "h1",
        "h2",
        "h3",
        "h4",
        "blockquote",
        "code",
        "pre",
        "div",
        "span",
      ],
      ALLOWED_ATTR: ["href", "target", "rel", "class"],
      ALLOWED_URI_REGEXP:
        /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      KEEP_CONTENT: true,
      RETURN_TRUSTED_TYPE: false,
    });
  }, [message.body]);

  // For self messages: show admin name + "To: contact_email" subline.
  // For inbound: show sender name (full name or email) + sender email subline if it differs.
  const isSelf = message.sender.type === "self";
  const displayName = isSelf ? selfName : message.sender.name || message.sender.email;
  const subline = isSelf
    ? `To ${recipientEmail || message.sender.email || ""}`.trim()
    : message.sender.email && message.sender.email !== message.sender.name
      ? message.sender.email
      : "";

  if (!isExpanded) {
    // Collapsed — each message stays in its own bordered card (Notion-style)
    return (
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-background hover:bg-muted/40 text-left transition-colors"
      >
        <span className="text-sm font-medium text-foreground flex-shrink-0 max-w-[10rem] truncate">
          {displayName}
        </span>
        <span className="text-sm text-muted-foreground truncate flex-1">
          {plainPreview(message.body)}
        </span>
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {formatDateShort(message.sentAt)}
        </span>
        <IconChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </button>
    );
  }

  // Expanded — clean card, no avatar, no internal divider
  return (
    <div className="rounded-lg overflow-hidden bg-background border border-border">
      <div
        onClick={isLatest ? undefined : onToggle}
        className={`flex items-start justify-between gap-3 px-4 pt-3 pb-2 ${
          !isLatest ? "cursor-pointer hover:bg-muted/30 transition-colors" : ""
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{displayName}</p>
          {subline && <p className="text-xs text-muted-foreground mt-0.5">{subline}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
          {onReply && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReply(message);
                  }}
                  aria-label="Reply"
                  className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <IconArrowBackUp className="w-[18px] h-[18px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Reply</TooltipContent>
            </Tooltip>
          )}
          {onForward && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onForward(message);
                  }}
                  aria-label="Forward"
                  className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <IconArrowForwardUp className="w-[18px] h-[18px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Forward</TooltipContent>
            </Tooltip>
          )}
          <span className="text-xs text-muted-foreground ml-1">{formatDate(message.sentAt)}</span>
        </div>
      </div>

      {/* Body — no divider above; padding handles the visual gap.
          The email-thread-body class scopes blockquote styling so quoted
          replies show the classic vertical "thread line" on the left.
          Nested blockquotes naturally inherit, producing the
          smaller-and-smaller indented lines as you go deeper. */}
      <div
        className="email-thread-body px-4 pb-4 pt-2 text-sm text-foreground prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitizedBody }}
      />

      {/* Bottom action row — larger Reply / Forward buttons (Notion-style) */}
      {(onReply || onForward) && (
        <div className="flex items-center gap-2 px-4 pb-4 pt-1">
          {onReply && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReply(message);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm text-foreground hover:bg-muted transition-colors"
            >
              <IconArrowBackUp className="w-4 h-4" />
              Reply
            </button>
          )}
          {onForward && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onForward(message);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm text-foreground hover:bg-muted transition-colors"
            >
              <IconArrowForwardUp className="w-4 h-4" />
              Forward
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function EmailThread({
  messages,
  selfName = "You",
  recipientEmail,
  onReply,
  onForward,
}: EmailThreadProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set([messages[messages.length - 1]?.id].filter(Boolean)),
  );

  const toggle = (id: string) => {
    const latestId = messages[messages.length - 1]?.id;
    if (id === latestId) return;

    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-1.5">
      {messages.map((message, index) => (
        <MessageRow
          key={message.id}
          message={message}
          isExpanded={expandedIds.has(message.id)}
          isLatest={index === messages.length - 1}
          onToggle={() => toggle(message.id)}
          selfName={selfName}
          recipientEmail={recipientEmail}
          onReply={onReply}
          onForward={onForward}
        />
      ))}
    </div>
  );
}
