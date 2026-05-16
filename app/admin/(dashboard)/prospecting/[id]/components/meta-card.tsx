/**
 * Meta card on the prospect cockpit (server component).
 *
 * Shows the housekeeping facts: created at, assigned user (with avatar),
 * Google Place id. We render Google Maps as a link off the place id using
 * the documented `?q=place_id:<id>` query \u2014
 *   https://developers.google.com/maps/documentation/urls/get-started#search-action
 *
 * Source is rendered as "Imported" when we have nothing more specific to
 * show \u2014 the schema has no per-row import source today.
 */

import { IconCalendarPlus, IconExternalLink, IconMapPin, IconUser } from "@tabler/icons-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shadcn/ui/card";
import { formatDateTime } from "@/lib/utils";
import type { ProspectDetailRow } from "@/lib/prospects/queries";

interface MetaCardProps {
  prospect: ProspectDetailRow;
}

function initials(name: string | null, email: string | null): string {
  const source = (name?.trim() || email?.trim() || "").trim();
  if (!source) return "\u00b7";
  const parts = source.split(/\s+/);
  const letters =
    parts.length >= 2 ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}` : (source[0] ?? "");
  return letters.toUpperCase();
}

export function MetaCard({ prospect }: MetaCardProps) {
  const assignedLabel = prospect.assignedUserName || prospect.assignedUserEmail || null;
  const mapsHref = prospect.googlePlaceId
    ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(prospect.googlePlaceId)}`
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <MetaRow icon={IconCalendarPlus} label="Created">
          <span className="text-sm text-foreground">{formatDateTime(prospect.createdAt)}</span>
        </MetaRow>

        <MetaRow icon={IconCalendarPlus} label="Last touched">
          <span className="text-sm text-foreground">
            {prospect.lastTouchedAt ? formatDateTime(prospect.lastTouchedAt) : "\u2014"}
          </span>
        </MetaRow>

        <MetaRow icon={IconUser} label="Source">
          <span className="text-sm text-foreground">Imported</span>
        </MetaRow>

        <MetaRow icon={IconUser} label="Assigned">
          {assignedLabel ? (
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="size-6">
                {prospect.assignedUserAvatarUrl && (
                  <AvatarImage src={prospect.assignedUserAvatarUrl} alt={assignedLabel} />
                )}
                <AvatarFallback className="text-[10px]">
                  {initials(prospect.assignedUserName, prospect.assignedUserEmail)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-foreground truncate">{assignedLabel}</span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Unassigned</span>
          )}
        </MetaRow>

        {prospect.googlePlaceId && mapsHref && (
          <MetaRow icon={IconMapPin} label="Google Place">
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-foreground hover:text-primary hover:underline underline-offset-4 inline-flex items-center gap-1 truncate"
            >
              <span className="font-mono text-xs truncate">{prospect.googlePlaceId}</span>
              <IconExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
          </MetaRow>
        )}
      </CardContent>
    </Card>
  );
}

interface MetaRowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}

function MetaRow({ icon: Icon, label, children }: MetaRowProps) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground w-28 shrink-0 pt-0.5">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
