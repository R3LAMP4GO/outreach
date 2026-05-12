#!/usr/bin/env node
/**
 * Apply migration to PostgreSQL database
 * Usage: node scripts/apply-migration.mjs <migration-file-path>
 *
 * Uses postgres.js directly to execute raw SQL migrations.
 * For schema changes managed by Drizzle, prefer `bunx drizzle-kit push` instead.
 */

import postgres from "postgres";
import { readFileSync } from "fs";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ Missing required environment variable: DATABASE_URL");
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error("❌ Usage: node scripts/apply-migration.mjs <migration-file-path>");
  process.exit(1);
}

console.log(`📄 Reading migration file: ${migrationFile}`);
const sqlContent = readFileSync(migrationFile, "utf-8");

console.log(`🔗 Connecting to database...`);
const sql = postgres(databaseUrl, { prepare: false });

console.log("🚀 Executing migration SQL...\n");

try {
  await sql.unsafe(sqlContent);
  console.log("\n✅ Migration completed successfully!");
} catch (error) {
  console.error("❌ Error executing migration:", error.message);
  process.exit(1);
} finally {
  await sql.end();
}
