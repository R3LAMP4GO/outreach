import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { bulkDeleteContacts } from "@/lib/crm/contacts";
import { CrmError } from "@/lib/crm/types";

const bulkDeleteContactsSchema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1).max(100),
});

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!session.user.role || !["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const validationResult = bulkDeleteContactsSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues.map((e) => e.message).join(", ") },
        { status: 400 },
      );
    }

    const result = await bulkDeleteContacts(validationResult.data.contact_ids);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CrmError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error in bulk delete contacts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
