import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachCampaignSenders, outreachSenderAccounts } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";

/**
 * GET /api/outreach/campaigns/[campaignId]/sender-accounts
 *
 * Get sender accounts linked to a campaign
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
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { campaignId } = await params;

    // Join campaign_senders with sender_accounts
    const rows = await db
      .select({
        account: outreachSenderAccounts,
      })
      .from(outreachCampaignSenders)
      .innerJoin(
        outreachSenderAccounts,
        eq(outreachCampaignSenders.senderId, outreachSenderAccounts.id),
      )
      .where(eq(outreachCampaignSenders.campaignId, campaignId));

    const accounts = rows.map((row) => row.account);

    return Response.json({ accounts }, { status: 200 });
  } catch (error) {
    logger.error("Error fetching campaign sender accounts:", error);
    return Response.json({ error: "Failed to fetch campaign sender accounts" }, { status: 500 });
  }
}

/**
 * PUT /api/outreach/campaigns/[campaignId]/sender-accounts
 *
 * Update sender accounts for a campaign
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { campaignId } = await params;

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { senderIds } = body;

    // Validate senderIds
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (senderIds !== undefined) {
      if (!Array.isArray(senderIds) || senderIds.length > 50) {
        return Response.json({ error: "senderIds must be an array (max 50)" }, { status: 400 });
      }
      if (senderIds.some((id: unknown) => typeof id !== "string" || !UUID_RE.test(id as string))) {
        return Response.json({ error: "Invalid sender ID format" }, { status: 400 });
      }
    }

    // Delete existing associations
    await db
      .delete(outreachCampaignSenders)
      .where(eq(outreachCampaignSenders.campaignId, campaignId));

    // Insert new associations
    if (senderIds && senderIds.length > 0) {
      await db.insert(outreachCampaignSenders).values(
        senderIds.map((senderId: string) => ({
          campaignId,
          senderId,
        })),
      );
    }

    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error("Error updating campaign sender accounts:", error);
    return Response.json({ error: "Failed to update campaign sender accounts" }, { status: 500 });
  }
}
