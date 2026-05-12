import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { getPipelineDeals } from "@/lib/crm/deals";
import { CrmError } from "@/lib/crm/types";

export async function GET(request: NextRequest) {
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

    const searchParams = request.nextUrl.searchParams;
    const pipelineSlug = searchParams.get("pipeline") || "sales-pipeline";

    const result = await getPipelineDeals(pipelineSlug);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CrmError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("Error fetching pipeline deals:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
