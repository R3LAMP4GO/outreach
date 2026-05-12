import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/users
 * Get all active admin users (for assignment dropdowns, etc.)
 *
 * Only accessible by authenticated admin users.
 * Returns: Array of { id, name, email, role }
 */
export async function GET() {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized - login required" }, { status: 401 });
    }
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch all active admin users
    const users = await db
      .select({
        id: adminUsers.id,
        name: adminUsers.name,
        email: adminUsers.email,
        role: adminUsers.role,
      })
      .from(adminUsers)
      .where(eq(adminUsers.isActive, true))
      .orderBy(asc(adminUsers.name));

    return NextResponse.json({ users: users || [] });
  } catch (error) {
    logger.error("Error in GET /api/admin/users:", error);
    return NextResponse.json(
      {
        error: "Unexpected error loading admin users",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
