/**
 * Activity timeline for the prospect cockpit.
 *
 * Server component \u2014 receives the already-fetched events from
 * `getProspectDetail` and renders them via the shared `getEventStyle`
 * mapping from `lib/crm/event-styles.ts`. The icon / colour treatment
 * mirrors `ContactDetailSheet`'s activity tab so the two views read as the
 * same idiom.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/shadcn/ui/card";
import { IconHistory } from "@tabler/icons-react";
import { formatRelativeTime, getEventStyle } from "@/lib/crm/event-styles";
import type { ProspectDetailTimelineEvent } from "@/lib/prospects/queries";

interface TimelineListProps {
  events: ProspectDetailTimelineEvent[];
}

export function TimelineList({ events }: TimelineListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <IconHistory className="h-5 w-5 text-muted-foreground" />
          Activity timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No activity recorded yet.
          </p>
        ) : (
          <div className="space-y-4">
            {events.map((event) => {
              const { icon: Icon, color, bg } = getEventStyle(event.eventType);
              return (
                <div key={event.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`rounded-full p-2 ${bg}`}>
                      <Icon className={`h-3 w-3 ${color}`} />
                    </div>
                  </div>
                  <div className="flex-1 pb-4 min-w-0">
                    <p className="text-sm font-medium text-foreground">{event.title}</p>
                    {event.description && (
                      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                        {event.description}
                      </p>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {event.createdAt ? formatRelativeTime(event.createdAt) : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
