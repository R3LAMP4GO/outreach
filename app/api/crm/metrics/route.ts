import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCrmMetrics } from "@/lib/crm/metrics";
import { CrmError } from "@/lib/crm/types";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!session.user.role || !["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    const result = await getCrmMetrics();

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    });
  } catch (error) {
    if (error instanceof CrmError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error fetching CRM metrics:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
