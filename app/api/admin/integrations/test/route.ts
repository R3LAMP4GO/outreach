import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getIntegrationById } from "@/lib/integrations/registry";
import { runIntegrationTest } from "@/lib/integrations/test";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  provider: z.string().min(1).max(64),
});

/**
 * POST /api/admin/integrations/test
 *
 * Body: { provider: "openai" | "resend" | "quo" | "database" | "storage" | "encryption" }
 *
 * Runs a single round-trip against the named integration and returns
 * `{ ok, message, durationMs }`. The message NEVER contains the credential
 * value — only the upstream's status code or error string.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const def = getIntegrationById(parsed.data.provider);
  if (!def) {
    return NextResponse.json({ error: "Unknown integration" }, { status: 404 });
  }
  if (!def.testable) {
    return NextResponse.json(
      { error: `Integration "${def.id}" does not support test calls.` },
      { status: 400 },
    );
  }

  try {
    const result = await runIntegrationTest(def.id);
    if (!result) {
      return NextResponse.json(
        { error: `No test runner registered for "${def.id}".` },
        { status: 500 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    logger.error(`Integration test failed for ${def.id}:`, err);
    return NextResponse.json(
      { ok: false, message: "Test runner threw an exception.", durationMs: 0 },
      { status: 200 },
    );
  }
}
