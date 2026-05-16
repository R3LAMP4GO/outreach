/**
 * Shared event type → icon/color mapping for timeline events.
 * Used by both the CRM dashboard and ContactDetailSheet.
 */

import {
  IconAlertTriangle,
  IconBriefcase,
  IconCalendarEvent,
  IconCalendarTime,
  IconCheck,
  IconCircleCheck,
  IconClipboard,
  IconEye,
  IconMail,
  IconMessage,
  IconMessageCircle,
  IconMicrophone,
  IconNews,
  IconNote,
  IconPhoneIncoming,
  IconPhoneOutgoing,
  IconRefresh,
  IconReport,
  IconRocket,
  IconStatusChange,
  IconTag,
  IconUpload,
  IconUserPlus,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

interface EventStyle {
  icon: ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}

export function getEventStyle(eventType: string): EventStyle {
  switch (eventType) {
    case "form_submitted":
      return {
        icon: IconClipboard,
        color: "text-blue-600 dark:text-blue-400",
        bg: "bg-blue-100 dark:bg-blue-900/50",
      };
    case "contact_created":
      return {
        icon: IconUserPlus,
        color: "text-emerald-600 dark:text-emerald-400",
        bg: "bg-emerald-100 dark:bg-emerald-900/50",
      };
    case "booking_created":
    case "booking_rescheduled":
    case "booking_cancelled":
      return {
        icon: IconCalendarEvent,
        color: "text-green-600 dark:text-green-400",
        bg: "bg-green-100 dark:bg-green-900/50",
      };
    case "deal_created":
    case "stage_changed":
    case "deal_won":
    case "deal_lost":
      return {
        icon: IconBriefcase,
        color: "text-orange-600 dark:text-orange-400",
        bg: "bg-orange-100 dark:bg-orange-900/50",
      };
    case "newsletter_subscribed":
    case "newsletter_unsubscribed":
      return {
        icon: IconNews,
        color: "text-violet-600 dark:text-violet-400",
        bg: "bg-violet-100 dark:bg-violet-900/50",
      };
    case "email_sent":
    case "email_received":
    case "outreach_reply":
    case "outreach_sent":
      return {
        icon: IconMail,
        color: "text-purple-600 dark:text-purple-400",
        bg: "bg-purple-100 dark:bg-purple-900/50",
      };
    case "note_added":
      return {
        icon: IconNote,
        color: "text-gray-600 dark:text-gray-400",
        bg: "bg-gray-100 dark:bg-gray-900/50",
      };
    case "tags_updated":
      return {
        icon: IconTag,
        color: "text-teal-600 dark:text-teal-400",
        bg: "bg-teal-100 dark:bg-teal-900/50",
      };
    case "status_changed":
      return {
        icon: IconStatusChange,
        color: "text-amber-600 dark:text-amber-400",
        bg: "bg-amber-100 dark:bg-amber-900/50",
      };
    case "call_made":
      return {
        icon: IconPhoneOutgoing,
        color: "text-blue-600 dark:text-blue-400",
        bg: "bg-blue-100 dark:bg-blue-900/50",
      };
    case "call_received":
      return {
        icon: IconPhoneIncoming,
        color: "text-green-600 dark:text-green-400",
        bg: "bg-green-100 dark:bg-green-900/50",
      };
    case "voicemail_left":
      // @tabler/icons-react has no IconVoicemail; IconMicrophone is the closest
      // semantic match (a recorded voice message).
      return {
        icon: IconMicrophone,
        color: "text-amber-600 dark:text-amber-400",
        bg: "bg-amber-100 dark:bg-amber-900/50",
      };
    case "sms_sent":
      return {
        icon: IconMessageCircle,
        color: "text-blue-600 dark:text-blue-400",
        bg: "bg-blue-100 dark:bg-blue-900/50",
      };
    case "sms_received":
      return {
        icon: IconMessage,
        color: "text-green-600 dark:text-green-400",
        bg: "bg-green-100 dark:bg-green-900/50",
      };
    case "video_viewed":
      return {
        icon: IconEye,
        color: "text-indigo-600 dark:text-indigo-400",
        bg: "bg-indigo-100 dark:bg-indigo-900/50",
      };
    case "video_completed":
      // Hot lead — ring + brighter bg so it stands out in the timeline.
      return {
        icon: IconCircleCheck,
        color: "text-emerald-700 dark:text-emerald-300",
        bg: "bg-emerald-200 ring-2 ring-emerald-400/60 dark:bg-emerald-900/70 dark:ring-emerald-500/50",
      };
    case "video_rewatched":
      return {
        icon: IconRefresh,
        color: "text-emerald-600 dark:text-emerald-400",
        bg: "bg-emerald-100 dark:bg-emerald-900/50",
      };
    case "seo_report_generated":
      return {
        icon: IconReport,
        color: "text-gray-600 dark:text-gray-400",
        bg: "bg-gray-100 dark:bg-gray-900/50",
      };
    case "seo_report_failed":
      return {
        icon: IconAlertTriangle,
        color: "text-red-600 dark:text-red-400",
        bg: "bg-red-100 dark:bg-red-900/50",
      };
    case "prospect_imported":
      return {
        icon: IconUpload,
        color: "text-gray-600 dark:text-gray-400",
        bg: "bg-gray-100 dark:bg-gray-900/50",
      };
    case "prospect_promoted":
      return {
        icon: IconRocket,
        color: "text-purple-600 dark:text-purple-400",
        bg: "bg-purple-100 dark:bg-purple-900/50",
      };
    case "follow_up_scheduled":
      return {
        icon: IconCalendarTime,
        color: "text-slate-600 dark:text-slate-400",
        bg: "bg-slate-100 dark:bg-slate-900/50",
      };
    case "follow_up_completed":
      return {
        icon: IconCheck,
        color: "text-emerald-600 dark:text-emerald-400",
        bg: "bg-emerald-100 dark:bg-emerald-900/50",
      };
    default:
      return {
        icon: IconBriefcase,
        color: "text-blue-600 dark:text-blue-400",
        bg: "bg-blue-100 dark:bg-blue-900/50",
      };
  }
}

/**
 * Format a timestamp as a relative time string.
 */
export function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
