import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { bulkUpdateDealsSchema } from "@/lib/validations";
import { bulkUpdateDeals } from "@/lib/crm/deals";
import { CrmError } from "@/lib/crm/types";

export async function POST(request: NextRequest) {
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
    const validationResult = bulkUpdateDealsSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues.map((e) => e.message).join(", ") },
        { status: 400 },
      );
    }

    const result = await bulkUpdateDeals({
      ...validationResult.data,
      userId: session.user.id,
    });
    revalidateTag("crm-metrics", { expire: 0 });
    revalidateTag("admin-dashboard", { expire: 0 });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CrmError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error in bulk update:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
