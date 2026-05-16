"use client";

/**
 * Cap video card on the prospect cockpit.
 *
 * Two-part UI:
 *   1. URL input \u2014 paste a Cap share/embed URL. We try
 *      `extractCapVideoId()` on every change so the embed appears the moment
 *      a valid URL is typed. "Save" PATCHes the prospect with both
 *      `capVideoUrl` (verbatim) and the derived id.
 *   2. Embed \u2014 `<iframe src="https://cap.so/embed/<id>">` (the documented
 *      embed pattern; see CapSoftware/Cap docs/api/rest-api.mdx \u2192 the create
 *      endpoint returns `embedUrl: https://cap.so/embed/<id>?sdk=1` and the
 *      share docs show the same `/embed/<id>` route for non-SDK clips).
 *
 * Below the embed: engagement strip \u2014 total views, average watch %, last
 * viewed at, completion count. Numbers come straight from the server-side
 * aggregation in `getProspectDetail` (`videoEngagementEvents`).
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconExternalLink,
  IconEye,
  IconVideo,
  IconClock,
  IconPlayerPlay,
  IconPercentage,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/shadcn/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shadcn/ui/card";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { extractCapVideoId } from "@/lib/cap/parse-url";
import type { ProspectEngagementStats } from "@/lib/prospects/queries";

interface CapVideoCardProps {
  prospectId: string;
  capVideoId: string | null;
  capVideoUrl: string | null;
  engagement: ProspectEngagementStats;
}

function buildEmbedUrl(videoId: string): string {
  return `https://cap.so/embed/${encodeURIComponent(videoId)}`;
}

function buildShareUrl(videoId: string): string {
  return `https://cap.so/s/${encodeURIComponent(videoId)}`;
}

export function CapVideoCard({
  prospectId,
  capVideoId,
  capVideoUrl,
  engagement,
}: CapVideoCardProps) {
  const router = useRouter();
  // Keyed on the server `capVideoUrl` so a `router.refresh()` (e.g. after
  // Save) replaces the input with the canonical value without an effect.
  const initialDraft = capVideoUrl ?? "";
  const [draft, setDraft] = useState(initialDraft);
  const [draftKey, setDraftKey] = useState(initialDraft);
  if (draftKey !== initialDraft) {
    setDraftKey(initialDraft);
    setDraft(initialDraft);
  }
  const [saving, setSaving] = useState(false);

  // Pure derivation: id is whatever the current draft parses to (or the
  // server-side id when the draft hasn't been touched).
  const derivedId = useMemo(() => {
    const trimmed = draft.trim();
    if (!trimmed) return null;
    return extractCapVideoId(trimmed);
  }, [draft]);
  const embedVideoId = draft.trim() === initialDraft.trim() ? capVideoId : derivedId;

  const isDirty = draft.trim() !== initialDraft.trim();
  const canSave = isDirty && (draft.trim() === "" || derivedId !== null);

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/admin/prospects/${prospectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capVideoUrl: draft.trim() === "" ? null : draft.trim(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? "Failed to save video URL");
        return;
      }
      toast.success("Video URL saved");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save video URL");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <IconVideo className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Cap video</CardTitle>
        </div>
        {capVideoId && (
          <Button variant="outline" size="sm" asChild>
            <a href={buildShareUrl(capVideoId)} target="_blank" rel="noopener noreferrer">
              <IconExternalLink className="h-4 w-4 mr-1" />
              Open
            </a>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cap-video-url">Share URL</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="cap-video-url"
              placeholder="https://cap.so/s/\u2026"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving ? "Saving\u2026" : "Save"}
            </Button>
          </div>
          {draft.trim() !== "" && derivedId === null && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Not a recognised Cap URL (expected https://cap.so/s/&lt;id&gt;).
            </p>
          )}
          {derivedId && (
            <p className="text-xs text-muted-foreground">
              Detected video id: <span className="font-mono">{derivedId}</span>
            </p>
          )}
        </div>

        {embedVideoId && (
          <div className="border border-border rounded-lg overflow-hidden bg-muted/30 aspect-video">
            <iframe
              src={buildEmbedUrl(embedVideoId)}
              title="Cap video"
              className="w-full h-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <EngagementStat
            icon={IconEye}
            label="Total views"
            value={engagement.totalViews.toString()}
          />
          <EngagementStat
            icon={IconPercentage}
            label="Avg watch %"
            value={
              engagement.averageWatchPercent != null
                ? `${engagement.averageWatchPercent}%`
                : "\u2014"
            }
          />
          <EngagementStat
            icon={IconPlayerPlay}
            label="Completed"
            value={engagement.completionCount.toString()}
          />
          <EngagementStat
            icon={IconClock}
            label="Last viewed"
            value={
              engagement.lastViewedAt
                ? formatDistanceToNow(new Date(engagement.lastViewedAt), {
                    addSuffix: true,
                  })
                : "\u2014"
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

interface EngagementStatProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}

function EngagementStat({ icon: Icon, label, value }: EngagementStatProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className="text-base font-semibold text-foreground truncate">{value}</p>
    </div>
  );
}
