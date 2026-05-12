import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { dealUpdateSchema } from "@/lib/validations";
import { getDeal, updateDeal, deleteDeal } from "@/lib/crm/deals";
import { CrmError } from "@/lib/crm/types";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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
    const result = await getDeal(id);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CrmError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error fetching deal:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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
    const validationResult = dealUpdateSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues.map((e) => e.message).join(", ") },
        { status: 400 },
      );
    }

    const result = await updateDeal(id, validationResult.data, session.user.id);
    revalidateTag("crm-metrics", { expire: 0 });
    revalidateTag("admin-dashboard", { expire: 0 });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CrmError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error updating deal:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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
    const result = await deleteDeal(id);
    revalidateTag("crm-metrics", { expire: 0 });
    revalidateTag("admin-dashboard", { expire: 0 });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CrmError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error deleting deal:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
