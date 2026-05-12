import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { bulkUpdateContacts } from "@/lib/crm/contacts";
import { CrmError } from "@/lib/crm/types";

const bulkUpdateContactsSchema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1).max(100),
  updates: z
    .object({
      contact_status: z.enum(["subscriber", "lead", "qualified", "customer"]).optional(),
      tags: z.array(z.string().max(100)).max(50).optional(),
      add_tags: z.array(z.string().max(100)).max(20).optional(),
    })
    .refine((data) => !(data.tags && data.add_tags), {
      message: "Cannot set both tags and add_tags in the same request",
    }),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!session.user.role || !["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const validationResult = bulkUpdateContactsSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues.map((e) => e.message).join(", ") },
        { status: 400 },
      );
    }

    const result = await bulkUpdateContacts(validationResult.data);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CrmError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error in bulk update contacts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
