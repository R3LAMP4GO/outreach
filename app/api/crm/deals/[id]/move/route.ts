import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { moveDealSchema } from "@/lib/validations";
import { moveDeal } from "@/lib/crm/deals";
import { CrmError } from "@/lib/crm/types";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

    const { id } = await context.params;
    const body = await request.json();

    // 3. Validate input
    const validationResult = moveDealSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues.map((e) => e.message).join(", ") },
        { status: 400 },
      );
    }

    const result = await moveDeal({
      dealId: id,
      stageId: validationResult.data.stage_id,
      userId: session.user.id,
    });
    revalidateTag("crm-metrics", { expire: 0 });
    revalidateTag("admin-dashboard", { expire: 0 });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CrmError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error moving deal:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
