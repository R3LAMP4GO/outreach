import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { bulkDeleteDealsSchema } from "@/lib/validations";
import { bulkDeleteDeals } from "@/lib/crm/deals";
import { CrmError } from "@/lib/crm/types";

export async function DELETE(request: NextRequest) {
  try {
    // 1. Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Check admin permissions
    if (!session.user.role || !["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    const body = await request.json();

    // 3. Validate input
    const validationResult = bulkDeleteDealsSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues.map((e) => e.message).join(", ") },
        { status: 400 },
      );
    }

    const result = await bulkDeleteDeals(validationResult.data.deal_ids);
    revalidateTag("crm-metrics", { expire: 0 });
    revalidateTag("admin-dashboard", { expire: 0 });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CrmError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error in bulk delete:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
