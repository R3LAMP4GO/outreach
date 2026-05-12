import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { paginationSchema } from "@/lib/validations";
import { getDeals } from "@/lib/crm/deals";
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

    // 2. Validate input
    const searchParams = request.nextUrl.searchParams;
    const pipelineSlug = searchParams.get("pipeline") || "sales-pipeline";
    const search = searchParams.get("search") || "";
    const stageSlug = searchParams.get("stage");

    const paginationResult = paginationSchema.safeParse({
      page: searchParams.get("page"),
      limit: searchParams.get("limit"),
    });

    if (!paginationResult.success) {
      return NextResponse.json(
        { error: paginationResult.error.issues.map((e) => e.message).join(", ") },
        { status: 400 },
      );
    }

    const { page, limit } = paginationResult.data;

    const result = await getDeals({
      pipelineSlug,
      search,
      stageSlug: stageSlug || undefined,
      page,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CrmError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("Error in deals API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
