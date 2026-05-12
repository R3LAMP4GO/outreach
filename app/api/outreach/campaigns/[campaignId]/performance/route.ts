import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";

const ALLOWED_RANGES: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

interface DayBucket {
  date: string; // YYYY-MM-DD (UTC)
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
}

/**
 * GET /api/outreach/campaigns/[campaignId]/performance?range=7d|30d|90d
 *
 * Returns per-day counts of {sent, opened, clicked, replied} for the campaign
 * over the requested window. Days are bucketed in UTC, matching the chart
 * x-axis on the client.
 *
 *   - sent: distinct contact + email-number sends (email_1/2/3_sent_at on
 *     outreach_contacts). Counted once per email actually sent on that day.
 *   - opened/clicked: outreach_email_events rows with event_type='opened' /
 *     'clicked', joined to outreach_contacts for the campaign filter.
 *   - replied: outreach_replies.received_at for the campaign.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!session.user.role || !["admin", "super_admin"].includes(session.user.role)) {
      return Response.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    const { campaignId } = await params;
    if (!campaignId) {
      return Response.json({ error: "Campaign ID is required" }, { status: 400 });
    }

    const rangeParam = request.nextUrl.searchParams.get("range") ?? "90d";
    const days = ALLOWED_RANGES[rangeParam];
    if (!days) {
      return Response.json({ error: "Invalid range. Use 7d, 30d, or 90d." }, { status: 400 });
    }

    // Build daily buckets via generate_series, then LEFT JOIN per-event tallies.
    // All dates are bucketed in UTC. Window is the last `days` days inclusive
    // of today, matching the client's `Array.from({length: days})` loop.
    const result = await db.execute<{
      date: string;
      sent: number;
      opened: number;
      clicked: number;
      replied: number;
    }>(sql`
      WITH day_series AS (
        SELECT (CURRENT_DATE - (n || ' days')::interval)::date AS day
        FROM generate_series(0, ${days - 1}) AS n
      ),
      sent_counts AS (
        SELECT (sent_at AT TIME ZONE 'UTC')::date AS day, COUNT(*)::int AS c
        FROM (
          SELECT email_1_sent_at AS sent_at FROM outreach_contacts
            WHERE campaign_id = ${campaignId} AND email_1_sent_at IS NOT NULL
          UNION ALL
          SELECT email_2_sent_at FROM outreach_contacts
            WHERE campaign_id = ${campaignId} AND email_2_sent_at IS NOT NULL
          UNION ALL
          SELECT email_3_sent_at FROM outreach_contacts
            WHERE campaign_id = ${campaignId} AND email_3_sent_at IS NOT NULL
        ) s
        GROUP BY 1
      ),
      opened_counts AS (
        SELECT (e.created_at AT TIME ZONE 'UTC')::date AS day, COUNT(*)::int AS c
        FROM outreach_email_events e
        JOIN outreach_contacts c ON c.id = e.contact_id
        WHERE c.campaign_id = ${campaignId}
          AND e.event_type = 'opened'
          AND e.created_at IS NOT NULL
        GROUP BY 1
      ),
      clicked_counts AS (
        SELECT (e.created_at AT TIME ZONE 'UTC')::date AS day, COUNT(*)::int AS c
        FROM outreach_email_events e
        JOIN outreach_contacts c ON c.id = e.contact_id
        WHERE c.campaign_id = ${campaignId}
          AND e.event_type = 'clicked'
          AND e.created_at IS NOT NULL
        GROUP BY 1
      ),
      replied_counts AS (
        SELECT (received_at AT TIME ZONE 'UTC')::date AS day, COUNT(*)::int AS c
        FROM outreach_replies
        WHERE campaign_id = ${campaignId}
        GROUP BY 1
      )
      SELECT
        to_char(ds.day, 'YYYY-MM-DD') AS date,
        COALESCE(s.c, 0)::int AS sent,
        COALESCE(o.c, 0)::int AS opened,
        COALESCE(cl.c, 0)::int AS clicked,
        COALESCE(r.c, 0)::int AS replied
      FROM day_series ds
      LEFT JOIN sent_counts    s  ON s.day  = ds.day
      LEFT JOIN opened_counts  o  ON o.day  = ds.day
      LEFT JOIN clicked_counts cl ON cl.day = ds.day
      LEFT JOIN replied_counts r  ON r.day  = ds.day
      ORDER BY ds.day ASC
    `);

    // drizzle's postgres-js .execute returns either an array of rows or a
    // result object with a `rows` property depending on driver — handle both.
    const rows = Array.isArray(result)
      ? (result as DayBucket[])
      : ((result as { rows?: DayBucket[] }).rows ?? []);

    return Response.json({ range: rangeParam, data: rows }, { status: 200 });
  } catch (error) {
    logger.error("Error fetching campaign performance:", error);
    return Response.json(
      {
        error: "Failed to load campaign performance",
        message: error instanceof Error ? error.message : "Unknown database error",
      },
      { status: 500 },
    );
  }
}
