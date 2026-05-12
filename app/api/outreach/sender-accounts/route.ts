import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachSenderAccounts } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { OUTREACH_SENDER_DAILY_LIMIT } from "@/lib/constants";

/**
 * GET /api/outreach/sender-accounts
 *
 * Fetch all sender accounts
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = await db
      .select({
        id: outreachSenderAccounts.id,
        email: outreachSenderAccounts.email,
        name: outreachSenderAccounts.name,
        domain: outreachSenderAccounts.domain,
        isActive: outreachSenderAccounts.isActive,
        dailyLimit: outreachSenderAccounts.dailyLimit,
        signatureHtml: outreachSenderAccounts.signatureHtml,
        signaturePlainText: outreachSenderAccounts.signaturePlainText,
      })
      .from(outreachSenderAccounts)
      .where(eq(outreachSenderAccounts.isActive, true))
      .orderBy(asc(outreachSenderAccounts.email));

    return NextResponse.json({
      accounts: data || [],
      count: data?.length || 0,
    });
  } catch (error) {
    logger.error("Unexpected error fetching sender accounts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/outreach/sender-accounts
 *
 * Create a new sender account with custom email prefix
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { emailPrefix, name, signature_html, signature_plain_text } = body;

    if (!emailPrefix || !name) {
      return NextResponse.json(
        { error: "Email prefix and sender name are required" },
        { status: 400 },
      );
    }

    // Validate email prefix format and length
    if (
      typeof emailPrefix !== "string" ||
      emailPrefix.length > 64 ||
      !/^[a-z0-9._-]+$/.test(emailPrefix)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid email prefix. Use lowercase letters, numbers, dots, hyphens, or underscores (max 64 chars)",
        },
        { status: 400 },
      );
    }

    // Validate optional signature fields. Stored raw — the send-time renderer
    // (lib/outreach/sending/template.ts) sanitises signature_html via DOMPurify.
    if (
      signature_html !== undefined &&
      signature_html !== null &&
      typeof signature_html !== "string"
    ) {
      return NextResponse.json({ error: "signature_html must be a string" }, { status: 400 });
    }
    if (
      signature_plain_text !== undefined &&
      signature_plain_text !== null &&
      typeof signature_plain_text !== "string"
    ) {
      return NextResponse.json({ error: "signature_plain_text must be a string" }, { status: 400 });
    }

    // Construct full email from prefix + domain
    const domain = "email.__YOUR_DOMAIN__";
    const email = `${emailPrefix}@${domain}`;

    const [account] = await db
      .insert(outreachSenderAccounts)
      .values({
        email,
        name,
        domain,
        isActive: true,
        dailyLimit: OUTREACH_SENDER_DAILY_LIMIT,
        emailsSentToday: 0,
        signatureHtml: signature_html ?? null,
        signaturePlainText: signature_plain_text ?? null,
      })
      .returning();

    return NextResponse.json(
      {
        account,
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error("Unexpected error creating sender account:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
