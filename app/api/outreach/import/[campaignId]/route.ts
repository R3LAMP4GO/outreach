import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachCampaigns } from "@/lib/db/schema";
import { importContacts } from "@/lib/outreach/contacts";
import { logger } from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { compareApiKeys } from "@/lib/auth/compare-api-keys";

/**
 * POST /api/outreach/import/[campaignId]
 *
 * Import contacts into a campaign. Called by n8n workflow.
 *
 * @headers x-api-key - API key for authentication
 * @body contacts - Array of contact objects with email, first_name, and email sequences
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await params;

    // 1. Rate limiting (10 requests per minute per IP)
    const clientIp = getClientIp(request);
    const rateLimitResult = await checkRateLimit(`n8n-import:${clientIp}`, {
      limit: 10,
      windowMs: 60 * 1000,
    });

    if (!rateLimitResult.success) {
      logger.warn(`Rate limit exceeded for N8N import from IP: ${clientIp}`);
      return Response.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": Math.ceil(Date.now() + rateLimitResult.resetIn).toString(),
          },
        },
      );
    }

    // 2. Validate API key from headers (constant-time comparison)
    const apiKey = request.headers.get("x-api-key");
    const expectedKey = process.env.OUTREACH_API_KEY;

    if (!expectedKey) {
      logger.warn("OUTREACH_API_KEY not configured");
    }

    if (!apiKey || !expectedKey || !compareApiKeys(apiKey, expectedKey)) {
      logger.error("Unauthorized import attempt - invalid API key", {
        ip: clientIp,
      });
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 3. Validate campaign ID format
    if (!campaignId) {
      return Response.json({ error: "Campaign ID is required" }, { status: 400 });
    }

    // 4. Validate campaign exists and is accessible
    const [campaign] = await db
      .select({ id: outreachCampaigns.id, status: outreachCampaigns.status })
      .from(outreachCampaigns)
      .where(eq(outreachCampaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      logger.error("Campaign validation failed", {
        campaignId,
        ip: clientIp,
      });
      return Response.json({ error: "Campaign not found or access denied" }, { status: 404 });
    }

    // Verify campaign is in a valid state for imports
    if (campaign.status === "archived" || campaign.status === "deleted") {
      logger.warn("Import attempt to inactive campaign", {
        campaignId,
        status: campaign.status,
        ip: clientIp,
      });
      return Response.json({ error: "Campaign is not active" }, { status: 403 });
    }

    // 5. Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    const { contacts } = body;

    if (!contacts || !Array.isArray(contacts)) {
      return Response.json({ error: "Contacts array is required" }, { status: 400 });
    }

    if (contacts.length === 0) {
      return Response.json({ error: "Contacts array cannot be empty" }, { status: 400 });
    }

    logger.debug(`Importing ${contacts.length} contacts to campaign ${campaignId}`);

    const result = await importContacts(campaignId, contacts);

    // 6. Log success and return result
    const skipped = result.duplicates + result.blocked;
    logger.debug(
      `Import completed: ${result.imported} imported, ${skipped} skipped (${result.duplicates} duplicates, ${result.blocked} blocked)`,
    );

    return Response.json(result, { status: 200 });
  } catch (error) {
    logger.error("Error importing contacts:", error);

    return Response.json(
      {
        error: "Failed to import contacts",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
