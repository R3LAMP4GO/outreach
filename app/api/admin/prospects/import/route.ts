import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { prospects } from "@/lib/db/schema";
import { parseProspectCsv, type ImportError } from "@/lib/prospects/csv-parser";
import { enqueueGenerateSeoReport } from "@/lib/queue";
import { writeTimelineEvent } from "@/lib/crm/timeline";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/prospects/import
 *
 * Bulk-import prospects from a pasted CSV. Bound to the admin dashboard form
 * at /admin/prospecting/import.
 *
 * Auth: NextAuth session (middleware also enforces; this is the second gate).
 * CSRF: handled by middleware via Origin/Referer match.
 *
 * Request: JSON `{ csv: string }` — mirrors the in-browser-only call site.
 * Response: `{ imported: number; errors: ImportError[] }`
 *   - 4xx for validation problems (bad JSON, missing field, no usable rows).
 *   - 5xx for unexpected DB / queue failures.
 *
 * Per prospect we (a) insert the row, (b) enqueue a `generate-seo-report`
 * pg-boss job, and (c) write a `prospect_imported` timeline event. Enqueue
 * + timeline failures are logged but don't fail the whole import — the row
 * itself is the source of truth and the job can be re-fired later.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { csv?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.csv !== "string" || body.csv.trim().length === 0) {
    return NextResponse.json({ error: "Missing or empty 'csv' field" }, { status: 400 });
  }

  const { rows, errors } = parseProspectCsv(body.csv);

  if (rows.length === 0) {
    return NextResponse.json({ imported: 0, errors }, { status: errors.length > 0 ? 400 : 200 });
  }

  // Bulk insert returns the new IDs in the same order as the input rows so
  // we can pair each id with its source row for the side-effects below.
  let inserted: { id: string }[];
  try {
    inserted = await db
      .insert(prospects)
      .values(
        rows.map((r) => ({
          businessName: r.businessName,
          website: r.website,
          phone: r.phone,
          address: r.address,
          city: r.city,
          state: r.state,
          country: r.country,
          industry: r.industry,
          googlePlaceId: r.googlePlaceId,
          notes: r.notes,
        })),
      )
      .returning({ id: prospects.id });
  } catch (err) {
    logger.error("Failed to insert prospects:", err);
    return NextResponse.json(
      {
        error: "Failed to insert prospects",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }

  // Fan out enqueue + timeline in parallel. Each is wrapped in a settled
  // promise so a single failure doesn't abort the rest.
  const sideEffectErrors: ImportError[] = [];
  await Promise.all(
    inserted.map(async ({ id }, i) => {
      const source = rows[i];

      try {
        await enqueueGenerateSeoReport({ prospectId: id });
      } catch (err) {
        logger.error("Failed to enqueue generate-seo-report:", {
          prospectId: id,
          error: err instanceof Error ? err.message : String(err),
        });
        sideEffectErrors.push({
          // Add 2 to step past the header row (line 1).
          line: i + 2,
          message: `Inserted but failed to enqueue SEO report job: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        });
      }

      // writeTimelineEvent is non-throwing by contract; safe to await directly.
      await writeTimelineEvent({
        prospectId: id,
        eventType: "prospect_imported",
        title: `Prospect imported: ${source.businessName}`,
        metadata: {
          source: "csv_import",
          importedBy: session.user.id,
          businessName: source.businessName,
        },
      });
    }),
  );

  return NextResponse.json({
    imported: inserted.length,
    errors: [...errors, ...sideEffectErrors],
  });
}
