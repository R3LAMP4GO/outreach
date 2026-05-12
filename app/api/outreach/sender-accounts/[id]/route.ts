import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachSenderAccounts } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/outreach/sender-accounts/[id]
 *
 * Update an existing sender account. Currently supports updating the per-sender
 * signature fields (signature_html, signature_plain_text). Signatures are
 * stored raw \u2014 the send-time renderer (lib/outreach/sending/template.ts)
 * sanitises signature_html via DOMPurify before injecting it into emails.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invalid sender id" }, { status: 400 });
    }

    const body = await request.json();
    const { signature_html, signature_plain_text } = body;

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

    const updates: { signatureHtml?: string | null; signaturePlainText?: string | null } = {};
    if (signature_html !== undefined) updates.signatureHtml = signature_html ?? null;
    if (signature_plain_text !== undefined)
      updates.signaturePlainText = signature_plain_text ?? null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    const [account] = await db
      .update(outreachSenderAccounts)
      .set(updates)
      .where(eq(outreachSenderAccounts.id, id))
      .returning();

    if (!account) {
      return NextResponse.json({ error: "Sender account not found" }, { status: 404 });
    }

    return NextResponse.json({ account });
  } catch (error) {
    logger.error("Unexpected error updating sender account:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
