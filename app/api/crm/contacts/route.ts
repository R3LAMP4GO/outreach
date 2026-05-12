import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { paginationSchema } from "@/lib/validations";
import { getContacts } from "@/lib/crm/contacts";
import { CrmError } from "@/lib/crm/types";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!session.user.role || !["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status");

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

    const result = await getContacts({
      search,
      status: status || undefined,
      page,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CrmError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("Error in contacts API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
