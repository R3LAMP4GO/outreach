import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { sanitizeSearchForOrFilter } from "@/lib/security/input-validation";

/**
 * GET /api/outreach/replies
 *
 * List outreach reply *threads* (one row per contact) with optional filtering and pagination.
 *
 * Each row represents the *latest* inbound reply for a contact, plus aggregate
 * counts (`message_count`, `unread_count`) so the inbox can show a Gmail-style
 * thread list rather than one row per message.
 *
 * @query sentiment - Filter by sentiment (matched on the latest message)
 * @query campaign_id - Filter by campaign ID
 * @query is_read - 'false' restricts to threads with at least one unread message
 * @query is_archived - 'true' returns archived threads, default is non-archived
 * @query search - Search by from_email or subject (ilike)
 * @query limit - Number of threads per page (default: 50, max: 200)
 * @query offset - Offset for pagination (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const sentiment = searchParams.get("sentiment");
    const campaignId = searchParams.get("campaign_id");
    const isReadParam = searchParams.get("is_read");
    const isArchivedParam = searchParams.get("is_archived");
    const searchRaw = searchParams.get("search");

    let limit = parseInt(searchParams.get("limit") || "50", 10);
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 200) limit = 200;

    let offset = parseInt(searchParams.get("offset") || "0", 10);
    if (isNaN(offset) || offset < 0) offset = 0;

    // Default to non-archived when not specified (mirrors Gmail's inbox vs archive scopes)
    const isArchived =
      isArchivedParam === "true" ? true : isArchivedParam === "false" ? false : false;

    const sanitizedSearch = searchRaw ? sanitizeSearchForOrFilter(searchRaw) : null;
    const searchPattern = sanitizedSearch ? `%${sanitizedSearch}%` : null;

    // Unread filter applies AFTER aggregation: a thread is "unread" if it has
    // at least one unread message, even though we still return the *latest*
    // message regardless of its individual read state.
    const unreadOnly = isReadParam === "false";

    // Single CTE-based query:
    //  base   = filtered rows
    //  agg    = per-contact aggregates (latest_received_at, message_count, unread_count)
    //  latest = the most recent row per contact (for display)
    const rows = (await db.execute(sql`
      WITH base AS (
        SELECT *
        FROM outreach_replies
        WHERE is_archived = ${isArchived}
          AND (${campaignId}::uuid IS NULL OR campaign_id = ${campaignId}::uuid)
          AND (${sentiment}::text IS NULL OR sentiment = ${sentiment}::text)
          AND (
            ${searchPattern}::text IS NULL
            OR from_email ILIKE ${searchPattern}::text
            OR subject ILIKE ${searchPattern}::text
          )
      ),
      agg AS (
        SELECT
          contact_id,
          MAX(received_at) AS last_received_at,
          COUNT(*)::int AS message_count,
          COUNT(*) FILTER (WHERE NOT is_read)::int AS unread_count
        FROM base
        GROUP BY contact_id
      ),
      latest AS (
        SELECT DISTINCT ON (contact_id) *
        FROM base
        ORDER BY contact_id, received_at DESC
      )
      SELECT
        l.id,
        l.contact_id,
        l.campaign_id,
        l.from_email,
        l.subject,
        l.body_text,
        l.body_html,
        l.sentiment,
        l.intent,
        l.ai_summary,
        l.ai_suggested_reply,
        l.is_read,
        l.is_archived,
        l.received_at,
        l.created_at,
        l.inbound_message_id,
        l.crm_contact_id,
        l.crm_deal_id,
        l.pushed_to_crm_at,
        l.reply_body,
        l.reply_sender_email,
        l.reply_sent_at,
        a.message_count,
        a.unread_count,
        a.last_received_at,
        c.id AS c_id,
        c.first_name AS c_first_name,
        c.last_name AS c_last_name,
        c.email AS c_email,
        c.company AS c_company,
        cmp.id AS cmp_id,
        cmp.name AS cmp_name
      FROM latest l
      JOIN agg a USING (contact_id)
      LEFT JOIN outreach_contacts c ON c.id = l.contact_id
      LEFT JOIN outreach_campaigns cmp ON cmp.id = l.campaign_id
      WHERE (${unreadOnly}::boolean = FALSE OR a.unread_count > 0)
      ORDER BY a.last_received_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `)) as unknown as Array<Record<string, unknown>>;

    const countRows = (await db.execute(sql`
      WITH base AS (
        SELECT *
        FROM outreach_replies
        WHERE is_archived = ${isArchived}
          AND (${campaignId}::uuid IS NULL OR campaign_id = ${campaignId}::uuid)
          AND (${sentiment}::text IS NULL OR sentiment = ${sentiment}::text)
          AND (
            ${searchPattern}::text IS NULL
            OR from_email ILIKE ${searchPattern}::text
            OR subject ILIKE ${searchPattern}::text
          )
      ),
      agg AS (
        SELECT
          contact_id,
          COUNT(*) FILTER (WHERE NOT is_read)::int AS unread_count
        FROM base
        GROUP BY contact_id
      )
      SELECT COUNT(*)::int AS count
      FROM agg
      WHERE (${unreadOnly}::boolean = FALSE OR unread_count > 0)
    `)) as unknown as Array<{ count: number }>;

    const count = countRows[0]?.count ?? 0;

    const data = rows.map((r) => ({
      id: r.id,
      contact_id: r.contact_id,
      campaign_id: r.campaign_id,
      from_email: r.from_email,
      subject: r.subject,
      body_text: r.body_text,
      body_html: r.body_html,
      sentiment: r.sentiment,
      intent: r.intent,
      ai_summary: r.ai_summary,
      ai_suggested_reply: r.ai_suggested_reply,
      is_read: r.is_read,
      is_archived: r.is_archived,
      received_at: r.received_at,
      created_at: r.created_at,
      inbound_message_id: r.inbound_message_id,
      crm_contact_id: r.crm_contact_id,
      crm_deal_id: r.crm_deal_id,
      pushed_to_crm_at: r.pushed_to_crm_at,
      reply_body: r.reply_body,
      reply_sender_email: r.reply_sender_email,
      reply_sent_at: r.reply_sent_at,
      message_count: Number(r.message_count ?? 1),
      unread_count: Number(r.unread_count ?? 0),
      contact: r.c_id
        ? {
            id: r.c_id,
            first_name: r.c_first_name,
            last_name: r.c_last_name,
            email: r.c_email,
            company: r.c_company,
          }
        : null,
      campaign: r.cmp_id
        ? {
            id: r.cmp_id,
            name: r.cmp_name,
          }
        : null,
    }));

    return Response.json(
      {
        replies: data,
        total: count,
        limit,
        offset,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error("Unexpected error in GET /api/outreach/replies:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
