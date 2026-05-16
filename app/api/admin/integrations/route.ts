import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getIntegrationStatuses } from "@/lib/integrations/registry";

/**
 * GET /api/admin/integrations
 *
 * Returns the configured/missing status of every integration defined in
 * `lib/integrations/registry.ts`. NEVER returns env var values — only
 * booleans for whether each one is set.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ integrations: getIntegrationStatuses() });
}
