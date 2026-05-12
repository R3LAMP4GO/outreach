import { NextRequest, NextResponse } from "next/server";
import { markContactUnsubscribed } from "@/lib/outreach/contacts";
import { verifyUnsubscribeToken } from "@/lib/outreach/lib/utils";

/**
 * RFC 8058 One-Click Unsubscribe handler
 *
 * Email clients (Gmail, Outlook) POST to the List-Unsubscribe URL with
 * body `List-Unsubscribe=One-Click` when users click the unsubscribe button.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    const { contactId } = await params;
    const token = request.nextUrl.searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    if (!verifyUnsubscribeToken(contactId, token)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }

    const result = await markContactUnsubscribed(contactId);

    if (!result) {
      return NextResponse.json({ error: "Failed to unsubscribe contact" }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("One-click unsubscribe error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
