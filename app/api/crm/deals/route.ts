import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { dealCreateSchema, paginationSchema } from "@/lib/validations";
import { createDeal, getDeals } from "@/lib/crm/deals";
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

/**
 * POST /api/crm/deals
 *
 * Create a new deal from the admin UI (AddDealDialog). Auth + admin role
 * required. Validates body via `dealCreateSchema`. Returns `{ id }` on success.
 *
 * Side effects (handled in `createDeal`):
 *   - inserts a row in `deals`
 *   - writes a `deal_created` row in `contact_timeline`
 *
 * Cache: invalidates the CRM list/kanban tags so the new deal shows up
 * immediately on refetch.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!session.user.role || !["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = dealCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ") },
        { status: 400 },
      );
    }

    const { id, stageId } = await createDeal({
      name: parsed.data.name,
      contactId: parsed.data.contact_id,
      stageSlug: parsed.data.stage_slug,
      pipelineSlug: parsed.data.pipeline_slug,
      amount: parsed.data.amount,
      probability: parsed.data.probability,
      source: parsed.data.source,
      notes: parsed.data.notes,
      expectedCloseDate: parsed.data.expected_close_date,
    });

    revalidateTag("crm-metrics", { expire: 0 });
    revalidateTag("admin-dashboard", { expire: 0 });

    return NextResponse.json({ id, stage_id: stageId }, { status: 201 });
  } catch (error) {
    if (error instanceof CrmError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("Error creating deal:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
