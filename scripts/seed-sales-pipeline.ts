/**
 * One-off: seed the canonical sales pipeline + its 6 stages so the CRM
 * (DealsTable, PipelineKanban, /api/crm/deals) has something to query.
 *
 * Idempotent: re-runs are a no-op once the rows exist.
 *
 * Stages match CLAUDE.md → "CRM Pipeline":
 *   Lead → Contacted → Meeting Booked → Proposal Sent → Won → Lost
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { pipelines, stages } from "../lib/db/schema";

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle({ client });

const PIPELINE_SLUG = "sales-pipeline";

const STAGES = [
  {
    slug: "lead",
    name: "Lead",
    displayOrder: 1,
    color: "#6b7280",
    isPositive: null,
    isTerminal: false,
  },
  {
    slug: "contacted",
    name: "Contacted",
    displayOrder: 2,
    color: "#3b82f6",
    isPositive: null,
    isTerminal: false,
  },
  {
    slug: "meeting-booked",
    name: "Meeting Booked",
    displayOrder: 3,
    color: "#8b5cf6",
    isPositive: true,
    isTerminal: false,
  },
  {
    slug: "proposal-sent",
    name: "Proposal Sent",
    displayOrder: 4,
    color: "#f59e0b",
    isPositive: true,
    isTerminal: false,
  },
  {
    slug: "won",
    name: "Won",
    displayOrder: 5,
    color: "#10b981",
    isPositive: true,
    isTerminal: true,
  },
  {
    slug: "lost",
    name: "Lost",
    displayOrder: 6,
    color: "#ef4444",
    isPositive: false,
    isTerminal: true,
  },
];

const [existing] = await db
  .select({ id: pipelines.id })
  .from(pipelines)
  .where(eq(pipelines.slug, PIPELINE_SLUG))
  .limit(1);

let pipelineId: string;
if (existing) {
  pipelineId = existing.id;
  console.log(`pipeline "${PIPELINE_SLUG}" already exists (${pipelineId})`);
} else {
  const [created] = await db
    .insert(pipelines)
    .values({
      slug: PIPELINE_SLUG,
      name: "Sales Pipeline",
      description: "Default lead → contacted → meeting → proposal → won/lost funnel",
      color: "#3b82f6",
      displayOrder: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .returning({ id: pipelines.id });
  pipelineId = created.id;
  console.log(`created pipeline "${PIPELINE_SLUG}" (${pipelineId})`);
}

let inserted = 0;
let skipped = 0;
for (const s of STAGES) {
  const [exists] = await db
    .select({ id: stages.id })
    .from(stages)
    .where(eq(stages.slug, s.slug))
    .limit(1);
  if (exists) {
    skipped++;
    continue;
  }
  await db.insert(stages).values({
    pipelineId,
    slug: s.slug,
    name: s.name,
    displayOrder: s.displayOrder,
    color: s.color,
    isPositive: s.isPositive,
    isTerminal: s.isTerminal,
    createdAt: new Date().toISOString(),
  });
  inserted++;
}

console.log(`stages: ${inserted} inserted, ${skipped} skipped`);
await client.end();
