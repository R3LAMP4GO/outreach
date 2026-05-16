"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/shadcn/ui/button";
import { Skeleton } from "@/components/shadcn/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/shadcn/ui/avatar";
import { Input } from "@/components/shadcn/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn/ui/tabs";
import { Sheet, SheetContent, SheetTitle } from "@/components/shadcn/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/shadcn/ui/context-menu";
import {
  IconMail,
  IconArchive,
  IconDots,
  IconSearch,
  IconMailOpened,
  IconInbox,
  IconLoader2,
  IconChevronsRight,
  IconChevronUp,
  IconChevronDown,
  IconTag,
  IconTrash,
  IconMessage,
  IconMessageCircle,
  IconSend,
  IconLayoutGrid,
} from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/ui/tooltip";
import { formatDateTime } from "@/lib/utils";
import { EmailThread } from "@/components/admin/EmailThread";
import type { ThreadMessage } from "@/components/admin/EmailThread";
import { ReplyComposer } from "@/components/admin/ReplyComposer";
import { stripQuotedHtml, stripQuotedText } from "@/lib/email/strip-quoted-history";

type Intent =
  | "schedule_call"
  | "wants_info"
  | "objection"
  | "future_followup"
  | "not_interested"
  | "unsubscribe"
  | "other";

interface Reply {
  id: string;
  contact_id: string;
  campaign_id: string;
  from_email: string;
  subject: string | null;
  body_text: string | null;
  /** Never render body_html directly — sanitize with DOMPurify first */
  body_html: string | null;
  received_at: string;
  inbound_message_id: string | null;
  intent: Intent | null;
  reply_sent_at: string | null;
  reply_body: string | null;
  reply_sender_email: string | null;
  sentiment: "positive" | "negative" | "neutral" | null;
  ai_summary: string | null;
  ai_suggested_reply: string | null;
  crm_contact_id: string | null;
  crm_deal_id: string | null;
  pushed_to_crm_at: string | null;
  is_read: boolean;
  is_archived: boolean;
  message_count: number;
  unread_count: number;
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    company: string | null;
  } | null;
  campaign: { id: string; name: string } | null;
}

interface SiblingReply {
  id: string;
  from_email: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  received_at: string;
  inbound_message_id: string | null;
  reply_sent_at: string | null;
  reply_body: string | null;
  reply_sender_email: string | null;
  sentiment: "positive" | "negative" | "neutral" | null;
  intent: Intent | null;
  ai_summary: string | null;
  ai_suggested_reply: string | null;
}

interface ReplyDetail extends Reply {
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    company: string | null;
    email_1_body: string | null;
    email_1_subject: string | null;
    email_1_sent_at: string | null;
    email_2_body: string | null;
    email_2_subject: string | null;
    email_2_sent_at: string | null;
    email_3_body: string | null;
    email_3_subject: string | null;
    email_3_sent_at: string | null;
  } | null;
  siblingReplies: SiblingReply[];
}

type EmailFilter = "all" | "unread" | "archive";
type Channel = "email" | "sms" | "all";

interface SmsThread {
  prospect_id: string;
  prospect_name: string;
  contact_name: string | null;
  phone: string | null;
  last_message_at: string;
  last_message_preview: string;
  last_message_direction: "in" | "out";
  unread_count: number;
  message_count: number;
}

interface SmsMessage {
  id: string;
  direction: "in" | "out";
  body: string;
  created_at: string | null;
  is_read: boolean;
}

interface SmsThreadDetail {
  thread: { prospect_id: string; prospect_name: string; phone: string | null };
  messages: SmsMessage[];
}

const getSmsInitials = (thread: SmsThread): string => {
  const name = thread.contact_name || thread.prospect_name;
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

const getSmsDisplayName = (thread: SmsThread): string =>
  thread.contact_name || thread.prospect_name;

const stripEmailPrefixes = (subject: string): string => {
  const stripped = subject.replace(/^(?:(?:re|fwd?):\s*)*/i, "").trim();
  return stripped || subject;
};

const getReplyName = (reply: Reply) => {
  const c = reply.contact;
  if (c?.first_name || c?.last_name) return `${c.first_name || ""} ${c.last_name || ""}`.trim();
  return reply.from_email;
};

const getInitials = (reply: Reply) => {
  const c = reply.contact;
  if (c?.first_name && c?.last_name) return (c.first_name[0] + c.last_name[0]).toUpperCase();
  if (c?.first_name) return c.first_name.substring(0, 2).toUpperCase();
  if (c?.last_name) return c.last_name.substring(0, 2).toUpperCase();
  return reply.from_email.split("@")[0].substring(0, 2).toUpperCase();
};

const getSentimentDot = (sentiment: Reply["sentiment"]) => {
  if (sentiment === "positive") return "bg-green-500";
  if (sentiment === "negative") return "bg-red-500";
  return "bg-gray-300";
};

const getIntentBadge = (intent: Intent | null) => {
  if (!intent) return null;
  const map: Record<Intent, { label: string; className: string }> = {
    schedule_call: { label: "Schedule call", className: "bg-green-100 text-green-700" },
    wants_info: { label: "Wants info", className: "bg-amber-100 text-amber-700" },
    objection: { label: "Objection", className: "bg-orange-100 text-orange-700" },
    future_followup: { label: "Follow up later", className: "bg-blue-100 text-blue-700" },
    not_interested: { label: "Not interested", className: "bg-red-100 text-red-700" },
    unsubscribe: { label: "Unsubscribe", className: "bg-red-100 text-red-700" },
    other: { label: "Other", className: "bg-gray-100 text-gray-600" },
  };
  return map[intent] ?? null;
};

/**
 * Notion-style status tag for the inbox list:
 *  - Waiting (amber) — they replied to us, no outbound reply sent yet.
 *  - Replied (green) — we've already sent a response back.
 */
const getStatusTag = (replySentAt: string | null) =>
  replySentAt
    ? { label: "Replied", className: "bg-green-100 text-green-700" }
    : { label: "Waiting", className: "bg-amber-100 text-amber-800" };

function escapeBodyText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

function buildThreadMessages(detail: ReplyDetail): ThreadMessage[] {
  const messages: ThreadMessage[] = [];
  const contact = detail.contact;
  if (!contact) return messages;

  const contactName =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") || detail.from_email;

  // Add outbound campaign emails (email_1, email_2, email_3)
  if (contact.email_1_body && contact.email_1_sent_at) {
    messages.push({
      id: `${detail.id}-out1`,
      sender: { name: "You", email: "", type: "self" },
      subject: contact.email_1_subject || "",
      body: contact.email_1_body,
      sentAt: contact.email_1_sent_at,
      sequenceNumber: 1,
    });
  }

  if (contact.email_2_body && contact.email_2_sent_at) {
    messages.push({
      id: `${detail.id}-out2`,
      sender: { name: "You", email: "", type: "self" },
      subject: contact.email_2_subject || `Re: ${contact.email_1_subject || ""}`,
      body: contact.email_2_body,
      sentAt: contact.email_2_sent_at,
      sequenceNumber: 2,
    });
  }

  if (contact.email_3_body && contact.email_3_sent_at) {
    messages.push({
      id: `${detail.id}-out3`,
      sender: { name: "You", email: "", type: "self" },
      subject: contact.email_3_subject || `Re: ${contact.email_1_subject || ""}`,
      body: contact.email_3_body,
      sentAt: contact.email_3_sent_at,
      sequenceNumber: 3,
    });
  }

  // Add all inbound replies and their admin responses from sibling replies
  const siblings = detail.siblingReplies || [];
  const seenIds = new Set<string>();

  for (const sibling of siblings) {
    if (seenIds.has(sibling.id)) continue;
    seenIds.add(sibling.id);

    // Inbound message from contact — strip the inline quoted history first so
    // each bubble shows only that turn's new content. The earlier turns are
    // already rendered as their own bubbles above.
    const trimmedHtml = sibling.body_html ? stripQuotedHtml(sibling.body_html) : "";
    const trimmedText = sibling.body_text ? stripQuotedText(sibling.body_text) : "";
    messages.push({
      id: sibling.id,
      sender: {
        name: contactName,
        email: sibling.from_email,
        type: "contact",
      },
      subject: sibling.subject || "(no subject)",
      // body_html is sanitized by DOMPurify.sanitize() inside EmailThread before dangerouslySetInnerHTML.
      body: trimmedHtml || (trimmedText ? escapeBodyText(trimmedText) : "(no content)"),
      sentAt: sibling.received_at,
    });

    // Admin reply to this inbound message
    if (sibling.reply_sent_at && sibling.reply_body) {
      const replySubject = sibling.subject
        ? /^re:/i.test(sibling.subject)
          ? sibling.subject
          : `Re: ${sibling.subject}`
        : "Re: (no subject)";
      messages.push({
        id: `${sibling.id}-reply`,
        sender: { name: "You", email: sibling.reply_sender_email || "", type: "self" },
        subject: replySubject,
        body: escapeBodyText(sibling.reply_body),
        sentAt: sibling.reply_sent_at,
      });
    }
  }

  // Fallback: if no siblings returned, use the detail's own data (shouldn't happen but safe)
  if (siblings.length === 0) {
    const trimmedHtml = detail.body_html ? stripQuotedHtml(detail.body_html) : "";
    const trimmedText = detail.body_text ? stripQuotedText(detail.body_text) : "";
    messages.push({
      id: detail.id,
      sender: {
        name: contactName,
        email: detail.from_email,
        type: "contact",
      },
      subject: detail.subject || "(no subject)",
      body: trimmedHtml || (trimmedText ? escapeBodyText(trimmedText) : "(no content)"),
      sentAt: detail.received_at,
    });

    if (detail.reply_sent_at && detail.reply_body) {
      const replySubject = detail.subject
        ? /^re:/i.test(detail.subject)
          ? detail.subject
          : `Re: ${detail.subject}`
        : "Re: (no subject)";
      messages.push({
        id: `${detail.id}-reply`,
        sender: { name: "You", email: detail.reply_sender_email || "", type: "self" },
        subject: replySubject,
        body: escapeBodyText(detail.reply_body),
        sentAt: detail.reply_sent_at,
      });
    }
  }

  return messages.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
}

export default function OutreachInboxPage() {
  const [replies, setReplies] = useState<Reply[]>([]);
  const [selectedReply, setSelectedReply] = useState<Reply | null>(null);
  const [selectedReplyFull, setSelectedReplyFull] = useState<ReplyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<EmailFilter>("all");
  // Channel selector: Email keeps the current behaviour, SMS shows Quo SMS
  // threads grouped by prospect, All interleaves both by last activity time.
  const [channel, setChannel] = useState<Channel>("email");
  const [smsThreads, setSmsThreads] = useState<SmsThread[]>([]);
  const [smsLoading, setSmsLoading] = useState(false);
  const [selectedSmsThread, setSelectedSmsThread] = useState<SmsThread | null>(null);
  const [selectedSmsDetail, setSelectedSmsDetail] = useState<SmsThreadDetail | null>(null);
  const [smsDetailLoading, setSmsDetailLoading] = useState(false);
  const [smsComposerValue, setSmsComposerValue] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  // Composer is hidden by default — pops up only when Reply is clicked.
  // Resets whenever the user opens a different thread.
  const [composerOpen, setComposerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  // Bumped on every SSE `reply:new` event; the data-loading effect depends on
  // it so the list refetches with current filters when a new reply lands.
  const [realtimeVersion, setRealtimeVersion] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // Fetch SMS threads when the SMS or All channel is active, and refetch on
  // realtime version bumps so newly-arrived inbound SMS appear without a
  // manual reload.
  useEffect(() => {
    if (channel === "email") return;
    let cancelled = false;
    const load = async () => {
      setSmsLoading(true);
      try {
        const res = await fetch("/api/admin/inbox/sms");
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        if (!cancelled) setSmsThreads(data.threads ?? []);
      } catch {
        if (!cancelled) toast.error("Failed to load SMS threads");
      } finally {
        if (!cancelled) setSmsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [channel, realtimeVersion]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (filter === "archive") {
      params.set("is_archived", "true");
    } else {
      params.set("is_archived", "false");
      if (filter === "unread") params.set("is_read", "false");
    }
    params.set("limit", "100");
    if (debouncedSearchQuery) params.set("search", debouncedSearchQuery);

    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/outreach/replies?${params}`);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();
        if (!cancelled) {
          setReplies(data.replies || []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          toast.error("Failed to load inbox");
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [filter, debouncedSearchQuery, realtimeVersion]);

  // Open a single SSE connection on mount; bump realtimeVersion on each
  // `reply:new` event so the list refetches with current filters.
  //
  // Also bump on every *re*-connect (NOT the initial open): pg_notify is
  // fire-and-forget, so any reply inserted while the EventSource was dropped
  // (laptop sleep, proxy idle kill, server redeploy) would otherwise be lost.
  // Refetching with current filters on reconnect closes that gap.
  useEffect(() => {
    const es = new EventSource("/api/outreach/replies/stream");
    let connectCount = 0;
    es.addEventListener("connected", () => {
      connectCount += 1;
      if (connectCount > 1) {
        setRealtimeVersion((v) => v + 1);
      }
    });
    es.addEventListener("reply:new", () => {
      setRealtimeVersion((v) => v + 1);
      if (typeof document !== "undefined" && document.hidden) {
        toast.info("New reply");
      }
    });
    es.onerror = () => {
      // EventSource auto-reconnects with backoff; nothing to do.
    };
    return () => es.close();
  }, []);

  // Document-title badge: prepend `(•) ` while the tab is hidden and a new
  // reply arrived; restore on focus.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (realtimeVersion === 0) return;
    const BADGE = "(•) ";
    const original = document.title.startsWith(BADGE)
      ? document.title.slice(BADGE.length)
      : document.title;
    if (document.hidden) {
      document.title = BADGE + original;
    }
    const onVisible = () => {
      if (!document.hidden && document.title.startsWith(BADGE)) {
        document.title = document.title.slice(BADGE.length);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [realtimeVersion]);

  const closeDetail = useCallback(() => {
    setSelectedReply(null);
    setSelectedReplyFull(null);
    setComposerOpen(false);
  }, []);

  const openComposer = useCallback(() => {
    setComposerOpen(true);
    // Focus the textarea once it's mounted; rAF lets React render first.
    requestAnimationFrame(() => {
      const ta = document.querySelector<HTMLTextAreaElement>("[data-reply-composer] textarea");
      ta?.scrollIntoView({ behavior: "smooth", block: "center" });
      ta?.focus();
    });
  }, []);

  const selectReply = useCallback(async (reply: Reply) => {
    setSelectedReply(reply);
    setSelectedReplyFull(null);
    setComposerOpen(false);
    setDetailLoading(true);

    try {
      const res = await fetch(`/api/outreach/replies/${reply.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.reply) {
          const detail: ReplyDetail = {
            ...data.reply,
            siblingReplies: data.siblingReplies || [],
          };
          setSelectedReplyFull(detail);
          setReplies((prev) => prev.map((r) => (r.id === reply.id ? { ...r, ...data.reply } : r)));
        }
      }
    } catch {
      // non-critical
    } finally {
      setDetailLoading(false);
    }

    if (!reply.is_read || (reply.unread_count ?? 0) > 0) {
      setReplies((prev) =>
        prev.map((r) =>
          r.contact_id === reply.contact_id ? { ...r, is_read: true, unread_count: 0 } : r,
        ),
      );
      const res = await fetch(`/api/outreach/threads/${reply.contact_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_read: true }),
      });
      if (!res.ok) {
        setReplies((prev) =>
          prev.map((r) =>
            r.contact_id === reply.contact_id
              ? { ...r, is_read: reply.is_read, unread_count: reply.unread_count ?? 0 }
              : r,
          ),
        );
      }
    }
  }, []);

  const archiveReply = useCallback(
    async (contactId: string) => {
      const prevReplies = replies;
      setReplies((prev) => prev.filter((r) => r.contact_id !== contactId));
      if (selectedReply?.contact_id === contactId) closeDetail();

      const res = await fetch(`/api/outreach/threads/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_archived: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setReplies(prevReplies);
        toast.error(data?.error || "Failed to archive");
      } else {
        toast.success("Archived");
      }
    },
    [replies, selectedReply, closeDetail],
  );

  const pushToCrm = useCallback(async (replyId: string) => {
    const res = await fetch(`/api/outreach/replies/${replyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "push_to_crm" }),
    });
    const data = await res.json();
    if (res.ok) {
      setReplies((prev) => prev.map((r) => (r.id === replyId ? { ...r, ...data.reply } : r)));
      setSelectedReply((prev) => (prev?.id === replyId ? { ...prev, ...data.reply } : prev));
      setSelectedReplyFull((prev) => (prev?.id === replyId ? { ...prev, ...data.reply } : prev));
      toast.success("Pushed to CRM");
    } else {
      toast.error(data.error || "Failed to push to CRM");
    }
  }, []);

  const markAsRead = useCallback(async (contactId: string, isRead: boolean) => {
    let prevSnapshot: { id: string; is_read: boolean; unread_count: number }[] = [];
    setReplies((prev) => {
      prevSnapshot = prev
        .filter((r) => r.contact_id === contactId)
        .map((r) => ({ id: r.id, is_read: r.is_read, unread_count: r.unread_count }));
      return prev.map((r) =>
        r.contact_id === contactId
          ? { ...r, is_read: isRead, unread_count: isRead ? 0 : Math.max(r.message_count, 1) }
          : r,
      );
    });
    const res = await fetch(`/api/outreach/threads/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_read: isRead }),
    });
    if (!res.ok) {
      setReplies((prev) =>
        prev.map((r) => {
          const snap = prevSnapshot.find((s) => s.id === r.id);
          return snap ? { ...r, is_read: snap.is_read, unread_count: snap.unread_count } : r;
        }),
      );
      toast.error("Failed to update read status");
    }
  }, []);

  const filteredReplies = useMemo(() => {
    if (!debouncedSearchQuery) return replies;
    const q = debouncedSearchQuery.toLowerCase();
    return replies.filter((r) => {
      const name = getReplyName(r).toLowerCase();
      const email = r.from_email.toLowerCase();
      const subject = (r.subject || "").toLowerCase();
      return name.includes(q) || email.includes(q) || subject.includes(q);
    });
  }, [replies, debouncedSearchQuery]);

  const filteredSmsThreads = useMemo(() => {
    if (!debouncedSearchQuery) return smsThreads;
    const q = debouncedSearchQuery.toLowerCase();
    return smsThreads.filter((t) => {
      const name = getSmsDisplayName(t).toLowerCase();
      const phone = (t.phone || "").toLowerCase();
      const preview = t.last_message_preview.toLowerCase();
      return name.includes(q) || phone.includes(q) || preview.includes(q);
    });
  }, [smsThreads, debouncedSearchQuery]);

  const closeSmsDetail = useCallback(() => {
    setSelectedSmsThread(null);
    setSelectedSmsDetail(null);
    setSmsComposerValue("");
  }, []);

  const selectSmsThread = useCallback(async (thread: SmsThread) => {
    setSelectedSmsThread(thread);
    setSelectedSmsDetail(null);
    setSmsComposerValue("");
    setSmsDetailLoading(true);

    try {
      const res = await fetch(`/api/admin/inbox/sms/${thread.prospect_id}`);
      if (res.ok) {
        const data: SmsThreadDetail = await res.json();
        setSelectedSmsDetail(data);
      }
    } catch {
      toast.error("Failed to load SMS thread");
    } finally {
      setSmsDetailLoading(false);
    }

    // Mark inbound messages as read in the background. Optimistic local clear
    // of the unread badge so the UI updates immediately.
    if (thread.unread_count > 0) {
      setSmsThreads((prev) =>
        prev.map((t) => (t.prospect_id === thread.prospect_id ? { ...t, unread_count: 0 } : t)),
      );
      const res = await fetch(`/api/admin/inbox/sms/${thread.prospect_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_read: true }),
      });
      if (!res.ok) {
        // Rollback the optimistic clear on failure.
        setSmsThreads((prev) =>
          prev.map((t) =>
            t.prospect_id === thread.prospect_id ? { ...t, unread_count: thread.unread_count } : t,
          ),
        );
      }
    }
  }, []);

  const sendSms = useCallback(async () => {
    if (!selectedSmsThread) return;
    const content = smsComposerValue.trim();
    if (!content) return;
    setSmsSending(true);
    try {
      const res = await fetch(`/api/admin/prospects/${selectedSmsThread.prospect_id}/sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Failed to send SMS");
        return;
      }
      setSmsComposerValue("");
      toast.success("SMS sent");
      // Refetch the thread to show the new message; cheap enough at this scale.
      const refetch = await fetch(`/api/admin/inbox/sms/${selectedSmsThread.prospect_id}`);
      if (refetch.ok) {
        const fresh: SmsThreadDetail = await refetch.json();
        setSelectedSmsDetail(fresh);
      }
      // Bump the list-level last_message_at so the thread moves to the top.
      setSmsThreads((prev) => {
        const now = new Date().toISOString();
        const next = prev.map((t) =>
          t.prospect_id === selectedSmsThread.prospect_id
            ? {
                ...t,
                last_message_at: now,
                last_message_preview: content,
                last_message_direction: "out" as const,
                message_count: t.message_count + 1,
              }
            : t,
        );
        return next.sort(
          (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
        );
      });
    } finally {
      setSmsSending(false);
    }
  }, [selectedSmsThread, smsComposerValue]);

  const handleReplySent = useCallback(
    (replyId: string, sentAt: string, body: string, senderEmail: string) => {
      const patch = { reply_sent_at: sentAt, reply_body: body, reply_sender_email: senderEmail };
      setSelectedReplyFull((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...patch,
          siblingReplies: prev.siblingReplies.map((s) =>
            s.id === replyId ? { ...s, ...patch } : s,
          ),
        };
      });
      setSelectedReply((prev) => (prev ? { ...prev, ...patch } : prev));
      setReplies((prev) =>
        prev.map((r) => (r.id === replyId || r.id === selectedReply?.id ? { ...r, ...patch } : r)),
      );

      // Auto-advance to the next unhandled reply in the current filtered view.
      // If none remain, close the detail sheet so the user lands back on the list.
      const currentId = selectedReply?.id;
      if (!currentId) return;
      const idx = filteredReplies.findIndex((r) => r.id === currentId);
      if (idx === -1) return;
      const next = filteredReplies.slice(idx + 1).find((r) => !r.reply_sent_at && r.id !== replyId);
      if (next) {
        void selectReply(next);
      } else {
        closeDetail();
      }
    },
    [selectedReply?.id, filteredReplies, selectReply, closeDetail],
  );

  const threadMessages = useMemo<ThreadMessage[]>(() => {
    if (!selectedReplyFull) return [];
    return buildThreadMessages(selectedReplyFull);
  }, [selectedReplyFull]);

  const activeReply = selectedReplyFull ?? selectedReply;

  // Sheet header is thread-scoped: prefer the latest sibling reply (which carries
  // the most recent AI analysis + reply_sent_at) over the clicked row, so a stale
  // "Not interested" classification doesn't shadow a softened later turn.
  // The detail API returns siblings asc by received_at, so the last entry is latest.
  const latestSibling = useMemo(() => {
    const siblings = selectedReplyFull?.siblingReplies ?? [];
    return siblings.length > 0 ? siblings[siblings.length - 1] : null;
  }, [selectedReplyFull]);
  const threadReply = latestSibling ?? activeReply;

  const intentBadge = threadReply
    ? getIntentBadge((threadReply as { intent?: Intent | null }).intent ?? null)
    : null;

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-10 w-80" />
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b">
        <div className="flex items-center gap-3">
          {/* Channel selector — Email is the default to preserve the current
              behaviour; SMS and All are additive views. */}
          <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
            <TabsList>
              <TabsTrigger value="email" className="gap-1.5">
                <IconMail className="w-4 h-4" />
                Email
              </TabsTrigger>
              <TabsTrigger value="sms" className="gap-1.5">
                <IconMessageCircle className="w-4 h-4" />
                SMS
              </TabsTrigger>
              <TabsTrigger value="all" className="gap-1.5">
                <IconLayoutGrid className="w-4 h-4" />
                All
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative flex-1 max-w-sm">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={
                channel === "sms"
                  ? "Search SMS..."
                  : channel === "all"
                    ? "Search inbox..."
                    : "Search emails..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Button variant="ghost" size="sm" className="h-9 w-9 p-0 ml-auto">
            <IconDots className="w-5 h-5" />
          </Button>
        </div>

        {/* Email-only filters: All Mail / Unread / Archive only make sense in the
            email channel; SMS doesn't have an archive concept yet. */}
        {channel === "email" && (
          <Tabs value={filter} onValueChange={(v) => setFilter(v as EmailFilter)}>
            <TabsList>
              <TabsTrigger value="all" className="gap-1.5">
                <IconInbox className="w-4 h-4" />
                All Mail
              </TabsTrigger>
              <TabsTrigger value="unread" className="gap-1.5">
                <IconMailOpened className="w-4 h-4" />
                Unread
              </TabsTrigger>
              <TabsTrigger value="archive" className="gap-1.5">
                <IconArchive className="w-4 h-4" />
                Archive
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {/* Channel-aware list */}
      <div className="flex-1 overflow-y-auto">
        {channel !== "email" && smsLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : channel === "sms" ? (
          filteredSmsThreads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-24">
              <IconMessageCircle className="w-12 h-12 text-muted-foreground mb-3 opacity-40" />
              <p className="text-sm text-muted-foreground">No SMS threads yet</p>
            </div>
          ) : (
            <SmsThreadList
              threads={filteredSmsThreads}
              selectedId={selectedSmsThread?.prospect_id ?? null}
              onSelect={selectSmsThread}
            />
          )
        ) : channel === "all" ? (
          <UnifiedInboxList
            replies={filteredReplies}
            threads={filteredSmsThreads}
            selectedEmailId={selectedReply?.id ?? null}
            selectedSmsId={selectedSmsThread?.prospect_id ?? null}
            onSelectEmail={selectReply}
            onSelectSms={selectSmsThread}
          />
        ) : filteredReplies.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-24">
            <IconMail className="w-12 h-12 text-muted-foreground mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">No emails found</p>
          </div>
        ) : (
          <div>
            {filteredReplies.map((reply, index) => (
              <div key={reply.id}>
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div
                      onClick={() => selectReply(reply)}
                      className={`flex items-center gap-4 px-4 py-2 cursor-pointer hover:bg-muted/40 transition-colors ${
                        selectedReply?.id === reply.id ? "bg-muted/50" : ""
                      }`}
                    >
                      {/* Unread dot — thread-level: lit if ANY message in the thread is unread */}
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${reply.unread_count > 0 ? "bg-blue-500" : "opacity-0"}`}
                      />

                      {/* Sentiment dot (left side, near unread indicator) */}
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${reply.sentiment ? getSentimentDot(reply.sentiment) : "opacity-0"}`}
                        title={reply.sentiment ?? undefined}
                      />

                      {/* Avatar */}
                      <Avatar className="w-8 h-8 flex-shrink-0">
                        <AvatarFallback className="text-xs">{getInitials(reply)}</AvatarFallback>
                      </Avatar>

                      {/* Name + thread count */}
                      <span
                        className={`text-sm flex-shrink-0 w-36 truncate ${reply.unread_count > 0 ? "font-semibold text-foreground" : "font-normal text-foreground"}`}
                      >
                        {getReplyName(reply)}
                        {reply.message_count > 1 && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({reply.message_count})
                          </span>
                        )}
                      </span>

                      {/* Subject + preview (continues inline, truncates with …) */}
                      <div className="flex-1 min-w-0 truncate">
                        <span
                          className={`text-sm text-foreground ${reply.unread_count > 0 ? "font-medium" : "font-normal"}`}
                        >
                          {reply.subject ? stripEmailPrefixes(reply.subject) : "(no subject)"}
                        </span>
                        {reply.body_text && (
                          <span className="text-sm text-muted-foreground ml-2">
                            {reply.body_text.replace(/\s+/g, " ").trim()}
                          </span>
                        )}
                      </div>

                      {/* Badges + date */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* CRM indicator */}
                        {reply.crm_contact_id && (
                          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                            CRM
                          </span>
                        )}
                        {/* Status tag (Waiting / Replied) */}
                        {(() => {
                          const tag = getStatusTag(reply.reply_sent_at);
                          return (
                            <span
                              className={`text-[11px] px-2 py-0.5 rounded font-medium ${tag.className}`}
                            >
                              {tag.label}
                            </span>
                          );
                        })()}
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(reply.received_at)}
                        </span>
                      </div>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48">
                    <ContextMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsRead(reply.contact_id, true);
                      }}
                    >
                      <IconMailOpened className="w-4 h-4 mr-2" />
                      Mark as read
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsRead(reply.contact_id, false);
                      }}
                    >
                      <IconMail className="w-4 h-4 mr-2" />
                      Mark as unread
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        archiveReply(reply.contact_id);
                      }}
                    >
                      <IconArchive className="w-4 h-4 mr-2" />
                      Archive
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Sheet — slides in from right */}
      <Sheet
        open={!!selectedReply}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      >
        <SheetContent
          hideClose
          side="right"
          className="w-full sm:w-[680px] sm:max-w-none p-0 flex flex-col gap-0"
        >
          <VisuallyHidden>
            <SheetTitle>Email Detail</SheetTitle>
          </VisuallyHidden>
          {selectedReply &&
            (() => {
              // Navigation: find prev/next reply within the current filtered list.
              const idx = filteredReplies.findIndex((r) => r.id === selectedReply.id);
              const prevReply = idx > 0 ? filteredReplies[idx - 1] : null;
              const nextReply =
                idx >= 0 && idx < filteredReplies.length - 1 ? filteredReplies[idx + 1] : null;

              const toolbarBtn =
                "flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors";

              return (
                <>
                  {/* Top toolbar — navigation on the left, actions on the right (Notion-style) */}
                  <div className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={closeDetail}
                            aria-label="Close thread"
                            className={toolbarBtn}
                          >
                            <IconChevronsRight className="w-[18px] h-[18px]" stroke={2.25} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Close</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            disabled={!prevReply}
                            onClick={() => prevReply && void selectReply(prevReply)}
                            aria-label="Previous email"
                            className={toolbarBtn}
                          >
                            <IconChevronUp className="w-[18px] h-[18px]" stroke={2.25} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Previous</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            disabled={!nextReply}
                            onClick={() => nextReply && void selectReply(nextReply)}
                            aria-label="Next email"
                            className={toolbarBtn}
                          >
                            <IconChevronDown className="w-[18px] h-[18px]" stroke={2.25} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Next</TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => toast.info("Labels are coming soon.")}
                            aria-label="Add label"
                            className={toolbarBtn}
                          >
                            <IconTag className="w-[18px] h-[18px]" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Add label</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => archiveReply(selectedReply.contact_id)}
                            aria-label="Archive"
                            className={toolbarBtn}
                          >
                            <IconArchive className="w-[18px] h-[18px]" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Archive</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            // No hard-delete endpoint yet — trash currently maps to archive
                            // so the icon is functional. Wire to a real DELETE later.
                            onClick={() => archiveReply(selectedReply.contact_id)}
                            aria-label="Delete"
                            className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          >
                            <IconTrash className="w-[18px] h-[18px]" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Delete</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  {/* Sheet header — left edge aligns with the thread message cards below.
                  Tight padding on mobile so the summary + badges get full width;
                  desktop keeps the px-14 indent to align with the toolbar icons. */}
                  <div className="px-4 pt-2 pb-4 sm:px-14">
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: subject → summary → badges */}
                      <div className="flex-1 min-w-0 space-y-1">
                        {/* Subject — prominent */}
                        <h2 className="text-lg font-semibold leading-snug">
                          {selectedReply.subject
                            ? stripEmailPrefixes(selectedReply.subject)
                            : "(no subject)"}
                        </h2>
                        {/* AI summary — reflects the latest turn so the header description
                        evolves as the thread progresses. */}
                        {threadReply?.ai_summary && (
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {threadReply.ai_summary}
                          </p>
                        )}
                        {/* Badges row — thread-scoped: status, intent, sentiment all read
                        from the latest turn. */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          {threadReply &&
                            (() => {
                              const tag = getStatusTag(threadReply.reply_sent_at);
                              return (
                                <span
                                  className={`text-xs px-2 py-0.5 rounded font-medium ${tag.className}`}
                                >
                                  {tag.label}
                                </span>
                              );
                            })()}
                          {intentBadge && (
                            <span
                              className={`text-xs px-2 py-0.5 rounded ${intentBadge.className}`}
                            >
                              {intentBadge.label}
                            </span>
                          )}
                          {activeReply?.crm_contact_id && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                              In CRM
                            </span>
                          )}
                          {threadReply?.sentiment && (
                            <span
                              className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${
                                threadReply.sentiment === "positive"
                                  ? "bg-green-100 text-green-700"
                                  : threadReply.sentiment === "negative"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${getSentimentDot(threadReply.sentiment)}`}
                              />
                              {threadReply.sentiment.charAt(0).toUpperCase() +
                                threadReply.sentiment.slice(1)}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Right: contextual actions (archive lives top-right next to X) */}
                      {activeReply?.sentiment === "positive" &&
                        !activeReply?.crm_contact_id &&
                        !activeReply?.pushed_to_crm_at && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => pushToCrm(selectedReply.id)}
                            >
                              Push to CRM
                            </Button>
                          </div>
                        )}
                    </div>
                  </div>

                  {/* Thread + compose */}
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 sm:px-14">
                    {detailLoading ? (
                      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                        <IconLoader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">Loading…</span>
                      </div>
                    ) : threadMessages.length > 0 ? (
                      <EmailThread
                        messages={threadMessages}
                        selfName="Jake Schepis"
                        recipientEmail={
                          selectedReplyFull?.contact?.email ?? selectedReply.from_email
                        }
                        onReply={openComposer}
                        onForward={() => {
                          toast.info("Forwarding isn’t wired up yet — coming soon.");
                        }}
                      />
                    ) : (
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {selectedReply.body_text || "(no content)"}
                      </p>
                    )}

                    {composerOpen &&
                      selectedReplyFull &&
                      (() => {
                        // Always render the composer when the user explicitly opened it —
                        // even on threads we've already replied to. Target the latest
                        // unreplied sibling if there is one, else the most recent reply.
                        const siblings = selectedReplyFull.siblingReplies || [];
                        const latestUnreplied = [...siblings]
                          .reverse()
                          .find((s) => !s.reply_sent_at);
                        const composerReplyId =
                          latestUnreplied?.id ||
                          siblings[siblings.length - 1]?.id ||
                          selectedReply.id;
                        return (
                          <ReplyComposer
                            replyId={composerReplyId}
                            recipientName={getReplyName(selectedReply)}
                            recipientEmail={selectedReply.from_email}
                            // Start with a blank composer. The AI suggestion is
                            // surfaced behind the Ask AI button instead of pre-filled.
                            // NOTE: aiSuggestion below is the cached value generated
                            // at webhook time, signed by the campaign sender. Phase 2
                            // will add a /api/outreach/replies/[id]/regenerate route
                            // that re-runs analyzeReply() with the logged-in admin's
                            // first name as senderFirstName, overriding the cache.
                            initialMessage=""
                            aiSuggestion={
                              latestUnreplied?.ai_suggested_reply ||
                              selectedReplyFull.ai_suggested_reply ||
                              undefined
                            }
                            onSent={handleReplySent}
                            onDiscard={() => setComposerOpen(false)}
                          />
                        );
                      })()}
                  </div>
                </>
              );
            })()}
        </SheetContent>
      </Sheet>

      {/* SMS thread detail — mirrors the email Sheet, with a Quo-backed composer
          at the bottom that POSTs to /api/admin/prospects/[id]/sms. */}
      <Sheet
        open={!!selectedSmsThread}
        onOpenChange={(open) => {
          if (!open) closeSmsDetail();
        }}
      >
        <SheetContent
          hideClose
          side="right"
          className="w-full sm:w-[680px] sm:max-w-none p-0 flex flex-col gap-0"
        >
          <VisuallyHidden>
            <SheetTitle>SMS Thread</SheetTitle>
          </VisuallyHidden>
          {selectedSmsThread && (
            <>
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={closeSmsDetail}
                    aria-label="Close thread"
                    className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <IconChevronsRight className="w-[18px] h-[18px]" stroke={2.25} />
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {getSmsDisplayName(selectedSmsThread)}
                    </p>
                    {selectedSmsThread.phone && (
                      <p className="text-xs text-muted-foreground truncate">
                        {selectedSmsThread.phone}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-8 space-y-2">
                {smsDetailLoading ? (
                  <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                    <IconLoader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading…</span>
                  </div>
                ) : !selectedSmsDetail || selectedSmsDetail.messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
                    <IconMessage className="w-10 h-10 text-muted-foreground opacity-40" />
                    <p className="text-sm text-muted-foreground">
                      No messages yet — send one to start the conversation.
                    </p>
                  </div>
                ) : (
                  selectedSmsDetail.messages.map((msg) => <SmsBubble key={msg.id} message={msg} />)
                )}
              </div>

              <div data-sms-composer className="border-t bg-background px-4 py-3 sm:px-8">
                <div className="flex items-end gap-2">
                  <textarea
                    rows={2}
                    value={smsComposerValue}
                    onChange={(e) => setSmsComposerValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void sendSms();
                      }
                    }}
                    placeholder={
                      selectedSmsThread.phone
                        ? "Type a message… (⌘/Ctrl+Enter to send)"
                        : "Prospect has no phone on file"
                    }
                    disabled={!selectedSmsThread.phone || smsSending}
                    className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                  <Button
                    type="button"
                    onClick={() => void sendSms()}
                    disabled={
                      !selectedSmsThread.phone || smsSending || smsComposerValue.trim().length === 0
                    }
                    className="gap-1.5"
                  >
                    {smsSending ? (
                      <IconLoader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <IconSend className="w-4 h-4" />
                    )}
                    Send
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components (kept in-file to mirror the existing inbox layout idiom).
// ---------------------------------------------------------------------------

function SmsThreadList({
  threads,
  selectedId,
  onSelect,
}: {
  threads: SmsThread[];
  selectedId: string | null;
  onSelect: (thread: SmsThread) => void;
}) {
  return (
    <div>
      {threads.map((thread) => (
        <div
          key={thread.prospect_id}
          onClick={() => onSelect(thread)}
          className={`flex items-center gap-4 px-4 py-2 cursor-pointer hover:bg-muted/40 transition-colors ${
            selectedId === thread.prospect_id ? "bg-muted/50" : ""
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full flex-shrink-0 ${thread.unread_count > 0 ? "bg-blue-500" : "opacity-0"}`}
          />
          <div className="w-2 h-2 rounded-full flex-shrink-0 opacity-0" />
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarFallback className="text-xs">{getSmsInitials(thread)}</AvatarFallback>
          </Avatar>
          <span
            className={`text-sm flex-shrink-0 w-36 truncate ${thread.unread_count > 0 ? "font-semibold text-foreground" : "font-normal text-foreground"}`}
          >
            {getSmsDisplayName(thread)}
            {thread.message_count > 1 && (
              <span className="ml-1 text-xs text-muted-foreground">({thread.message_count})</span>
            )}
          </span>
          <div className="flex-1 min-w-0 truncate">
            <span
              className={`text-sm text-foreground ${thread.unread_count > 0 ? "font-medium" : "font-normal"}`}
            >
              {thread.last_message_direction === "out" && (
                <span className="text-muted-foreground mr-1">You:</span>
              )}
              {thread.last_message_preview || "(empty message)"}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {thread.unread_count > 0 && (
              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                {thread.unread_count} new
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {formatDateTime(thread.last_message_at)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SmsBubble({ message }: { message: SmsMessage }) {
  const outbound = message.direction === "out";
  return (
    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
          outbound ? "bg-blue-500 text-white" : "bg-muted text-foreground"
        }`}
      >
        <p>{message.body || "(empty message)"}</p>
        <p className={`text-[10px] mt-1 ${outbound ? "text-blue-100" : "text-muted-foreground"}`}>
          {message.created_at ? formatDateTime(message.created_at) : ""}
        </p>
      </div>
    </div>
  );
}

interface UnifiedRow {
  kind: "email" | "sms";
  id: string;
  at: string;
  email?: Reply;
  sms?: SmsThread;
}

function UnifiedInboxList({
  replies,
  threads,
  selectedEmailId,
  selectedSmsId,
  onSelectEmail,
  onSelectSms,
}: {
  replies: Reply[];
  threads: SmsThread[];
  selectedEmailId: string | null;
  selectedSmsId: string | null;
  onSelectEmail: (reply: Reply) => void;
  onSelectSms: (thread: SmsThread) => void;
}) {
  const rows: UnifiedRow[] = [
    ...replies.map<UnifiedRow>((r) => ({
      kind: "email",
      id: `email-${r.id}`,
      at: r.received_at,
      email: r,
    })),
    ...threads.map<UnifiedRow>((t) => ({
      kind: "sms",
      id: `sms-${t.prospect_id}`,
      at: t.last_message_at,
      sms: t,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-24">
        <IconInbox className="w-12 h-12 text-muted-foreground mb-3 opacity-40" />
        <p className="text-sm text-muted-foreground">No messages yet</p>
      </div>
    );
  }

  return (
    <div>
      {rows.map((row) => {
        if (row.kind === "email" && row.email) {
          const reply = row.email;
          const isSelected = selectedEmailId === reply.id;
          return (
            <div
              key={row.id}
              onClick={() => onSelectEmail(reply)}
              className={`flex items-center gap-4 px-4 py-2 cursor-pointer hover:bg-muted/40 transition-colors ${
                isSelected ? "bg-muted/50" : ""
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${reply.unread_count > 0 ? "bg-blue-500" : "opacity-0"}`}
              />
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground"
                title="Email"
              >
                <IconMail className="w-3.5 h-3.5" />
              </span>
              <Avatar className="w-8 h-8 flex-shrink-0">
                <AvatarFallback className="text-xs">{getInitials(reply)}</AvatarFallback>
              </Avatar>
              <span
                className={`text-sm flex-shrink-0 w-36 truncate ${reply.unread_count > 0 ? "font-semibold text-foreground" : "font-normal text-foreground"}`}
              >
                {getReplyName(reply)}
              </span>
              <div className="flex-1 min-w-0 truncate">
                <span
                  className={`text-sm text-foreground ${reply.unread_count > 0 ? "font-medium" : "font-normal"}`}
                >
                  {reply.subject || "(no subject)"}
                </span>
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {formatDateTime(reply.received_at)}
              </span>
            </div>
          );
        }
        if (row.kind === "sms" && row.sms) {
          const thread = row.sms;
          const isSelected = selectedSmsId === thread.prospect_id;
          return (
            <div
              key={row.id}
              onClick={() => onSelectSms(thread)}
              className={`flex items-center gap-4 px-4 py-2 cursor-pointer hover:bg-muted/40 transition-colors ${
                isSelected ? "bg-muted/50" : ""
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${thread.unread_count > 0 ? "bg-blue-500" : "opacity-0"}`}
              />
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground"
                title="SMS"
              >
                <IconMessageCircle className="w-3.5 h-3.5" />
              </span>
              <Avatar className="w-8 h-8 flex-shrink-0">
                <AvatarFallback className="text-xs">{getSmsInitials(thread)}</AvatarFallback>
              </Avatar>
              <span
                className={`text-sm flex-shrink-0 w-36 truncate ${thread.unread_count > 0 ? "font-semibold text-foreground" : "font-normal text-foreground"}`}
              >
                {getSmsDisplayName(thread)}
              </span>
              <div className="flex-1 min-w-0 truncate">
                <span
                  className={`text-sm text-foreground ${thread.unread_count > 0 ? "font-medium" : "font-normal"}`}
                >
                  {thread.last_message_direction === "out" && (
                    <span className="text-muted-foreground mr-1">You:</span>
                  )}
                  {thread.last_message_preview || "(empty message)"}
                </span>
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {formatDateTime(thread.last_message_at)}
              </span>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
