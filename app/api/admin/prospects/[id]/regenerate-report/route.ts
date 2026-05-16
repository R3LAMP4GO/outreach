/**
 * POST /api/admin/prospects/[id]/regenerate-report
 *
 * Re-enqueue the SEO report job for a prospect. Flips status to `pending`
 * (the worker only runs jobs whose status is `pending`, see
 * `lib/prospects/jobs/generate-seo-report.ts`), clears any prior error,
 * then `boss.send`s a fresh job. Idempotent against rapid double-clicks
 * because the worker no-ops anything that isn't `pending` at runtime.
 *
 * Auth: NextAuth session required.
 * CSRF: enforced by the global middleware via Origin / Referer check.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { prospects } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { enqueueGenerateSeoReport } from "@/lib/queue";

type RouteParams = { id: string };

export async function POST(
  _request: NextRequest,
  context: { params: Promise<RouteParams> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const [prospect] = await db
    .select({ id: prospects.id, businessName: prospects.businessName })
    .from(prospects)
    .where(eq(prospects.id, id))
    .limit(1);

  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  try {
    await db
      .update(prospects)
      .set({
        seoReportStatus: "pending",
        seoReportError: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(prospects.id, id));

    const jobId = await enqueueGenerateSeoReport({ prospectId: id });

    return NextResponse.json({ success: true, jobId });
  } catch (err) {
    logger.error("[prospects/regenerate-report] failed", {
      prospectId: id,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to enqueue report regeneration" }, { status: 500 });
  }
}
