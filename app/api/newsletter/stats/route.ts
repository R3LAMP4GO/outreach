/**
 * Newsletter Stats API
 *
 * Provides aggregated statistics for the newsletter dashboard including:
 * - Total subscribers (verified and not unsubscribed)
 * - Active campaigns
 * - Average open and click rates
 * - Total emails sent
 * - Recent activity feed
 *
 * GET /api/newsletter/stats - Get newsletter statistics
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { newsletterSubscribers, newsletterCampaigns, newsletterEditions } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { compareApiKeys } from "@/lib/auth/compare-api-keys";

/**
 * Newsletter statistics response type
 */
interface NewsletterStats {
  totalSubscribers: number;
  activeCampaigns: number;
  avgOpenRate: number;
  avgClickRate: number;
  totalSent: number;
  recentActivity: Array<{
    id: string;
    type: "campaign_sent" | "subscriber_added" | "curation_run";
    description: string;
    timestamp: string;
  }>;
}

/**
 * GET /api/newsletter/stats
 *
 * Returns aggregated newsletter statistics for the admin dashboard
 */
export async function GET(request: NextRequest) {
  try {
    // Check session auth OR API key
    const session = await auth();

    // Verify API key using constant-time comparison
    const apiKey = request.headers.get("x-api-key");
    const validKey = process.env.NEWSLETTER_API_KEY;

    if (!validKey) {
      logger.warn("NEWSLETTER_API_KEY not configured");
    }

    const hasValidApiKey = apiKey && validKey && compareApiKeys(apiKey, validKey);

    if (!session?.user && !hasValidApiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify admin role if using session auth
    if (session?.user && session.user.role !== "admin" && session.user.role !== "super_admin") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Rate limiting
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const rateLimitResult = await import("@/lib/rate-limit").then((m) =>
      m.checkRateLimit(`api-key:${ip}`, m.rateLimiters.api, "api"),
    );

    if (!rateLimitResult.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // Fetch all statistics in parallel for better performance
    const [subscribersResult, campaignsResult, editions, recentEditions, recentSubscribers] =
      await Promise.all([
        // Total verified, active subscribers
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(newsletterSubscribers)
          .where(
            and(
              eq(newsletterSubscribers.verified, true),
              eq(newsletterSubscribers.unsubscribed, false),
            ),
          ),

        // Active campaigns
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(newsletterCampaigns)
          .where(eq(newsletterCampaigns.status, "active")),

        // Newsletter editions stats for sent editions
        db
          .select({ stats: newsletterEditions.stats })
          .from(newsletterEditions)
          .where(eq(newsletterEditions.status, "sent")),

        // Recent sent editions for activity feed
        db
          .select({
            id: newsletterEditions.id,
            subject: newsletterEditions.subject,
            sentAt: newsletterEditions.sentAt,
            stats: newsletterEditions.stats,
          })
          .from(newsletterEditions)
          .where(eq(newsletterEditions.status, "sent"))
          .orderBy(desc(newsletterEditions.sentAt))
          .limit(5),

        // Recent subscriber signups for activity feed
        db
          .select({
            id: newsletterSubscribers.id,
            email: newsletterSubscribers.email,
            createdAt: newsletterSubscribers.createdAt,
          })
          .from(newsletterSubscribers)
          .where(eq(newsletterSubscribers.verified, true))
          .orderBy(desc(newsletterSubscribers.createdAt))
          .limit(5),
      ]);

    // Calculate statistics
    const totalSubscribers = subscribersResult[0]?.count || 0;
    const activeCampaigns = campaignsResult[0]?.count || 0;

    // Calculate average open and click rates from sent editions
    let avgOpenRate = 0;
    let avgClickRate = 0;
    let totalSent = 0;

    if (editions.length > 0) {
      let totalOpenRate = 0;
      let totalClickRate = 0;
      let editionsWithStats = 0;

      editions.forEach((edition) => {
        const stats = edition.stats as Record<string, number> | null;
        const delivered = stats?.totalDelivered || stats?.totalSent || 0;
        const opens = stats?.totalOpens || 0;
        const clicks = stats?.totalClicks || 0;

        totalSent += delivered;

        // Only calculate rates for editions that have been delivered
        if (delivered > 0) {
          totalOpenRate += opens / delivered;
          totalClickRate += clicks / delivered;
          editionsWithStats++;
        }
      });

      // Calculate averages
      if (editionsWithStats > 0) {
        avgOpenRate = totalOpenRate / editionsWithStats;
        avgClickRate = totalClickRate / editionsWithStats;
      }
    }

    // Build recent activity feed
    const recentActivity: NewsletterStats["recentActivity"] = [];

    // Add sent editions to activity
    recentEditions.forEach((edition) => {
      const stats = edition.stats as Record<string, number> | null;
      const recipients = stats?.totalRecipients || stats?.totalSent || 0;

      recentActivity.push({
        id: edition.id,
        type: "campaign_sent",
        description: `Newsletter sent: "${edition.subject}" to ${recipients} subscribers`,
        timestamp: edition.sentAt || new Date().toISOString(),
      });
    });

    // Add recent subscribers to activity
    recentSubscribers.forEach((subscriber) => {
      recentActivity.push({
        id: subscriber.id,
        type: "subscriber_added",
        description: `New subscriber: ${subscriber.email}`,
        timestamp: subscriber.createdAt,
      });
    });

    // Sort activity by timestamp (most recent first) and limit to 10
    recentActivity.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    const limitedActivity = recentActivity.slice(0, 10);

    // Construct response
    const stats: NewsletterStats = {
      totalSubscribers,
      activeCampaigns,
      avgOpenRate: Math.round(avgOpenRate * 1000) / 10, // fraction (0–1) → percentage (0–100), 1 decimal
      avgClickRate: Math.round(avgClickRate * 1000) / 10,
      totalSent,
      recentActivity: limitedActivity,
    };

    return NextResponse.json(stats);
  } catch (error) {
    logger.error("Error fetching newsletter stats:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch newsletter statistics",
        ...(process.env.NODE_ENV === "development" && {
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      },
      { status: 500 },
    );
  }
}
