/**
 * Seed `outreach_sender_accounts` with one row per admin mailbox.
 *
 * Pairs with the per-user routing in `selectSenderForUser` (lib/outreach/sending/sender.ts)
 * — when a logged-in admin replies or sends a cold first-touch, the route picks the
 * sender_account whose email matches `session.user.email`. So the rows here must
 * mirror your admin users' email addresses exactly.
 *
 * Idempotent. Safe to re-run — existing rows are skipped (no upsert overwrite).
 *
 * Usage:
 *   bun scripts/seed-sender-accounts.ts
 */
import "../lib/env-worker";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { outreachSenderAccounts } from "../lib/db/schema";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL must be set in .env.local");
  process.exit(1);
}

interface SenderSeed {
  email: string;
  name: string;
  /** Daily send cap per mailbox. 50/day is the standard cold-outreach safe limit. */
  dailyLimit: number;
}

const SENDERS: SenderSeed[] = [
  { email: "isaac@wearedouro.com", name: "Isaac Morgado", dailyLimit: 50 },
  { email: "josh@wearedouro.com", name: "Josh", dailyLimit: 50 },
];

async function main(): Promise<void> {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);

  let created = 0;
  let skipped = 0;
  for (const seed of SENDERS) {
    const existing = await db
      .select({ id: outreachSenderAccounts.id })
      .from(outreachSenderAccounts)
      .where(eq(outreachSenderAccounts.email, seed.email))
      .limit(1);

    if (existing.length > 0) {
      console.log(`  ⏭  ${seed.email}: already exists (id=${existing[0].id}), skipping`);
      skipped++;
      continue;
    }

    const domain = seed.email.split("@")[1];
    const now = new Date().toISOString();
    const [row] = await db
      .insert(outreachSenderAccounts)
      .values({
        email: seed.email,
        name: seed.name,
        domain,
        dailyLimit: seed.dailyLimit,
        emailsSentToday: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: outreachSenderAccounts.id });

    console.log(`  ✅ ${seed.email}: created (id=${row.id}, daily_limit=${seed.dailyLimit})`);
    created++;
  }

  console.log(`\nSeed complete — ${created} created, ${skipped} skipped.`);
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
