/**
 * Database client for non-Next.js contexts (workers, scripts)
 *
 * Same as lib/db/index.ts but without the "server-only" import,
 * which throws in standalone Node.js/Bun processes.
 *
 * Lazy-initialised so the module can be imported without DATABASE_URL set
 * (e.g. during Next.js build-time page-data collection).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  workerDb?: Database;
};

function createDb(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Missing DATABASE_URL environment variable.\n\n" +
        "Troubleshooting:\n" +
        "1. Add DATABASE_URL to .env.local\n" +
        "2. Format: postgresql://postgres:[password]@[host]:[port]/[database]\n" +
        "3. Get connection string from Railway → Postgres service → Variables (DATABASE_URL)\n" +
        "4. Restart dev server after adding environment variables",
    );
  }
  const client = postgres(connectionString, { prepare: false });
  return drizzle({ client, schema });
}

/**
 * Lazy proxy: connection is created on first use, not at module import.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const realDb = (globalForDb.workerDb ??= createDb());
    const value = realDb[prop as keyof Database];
    return typeof value === "function" ? value.bind(realDb) : value;
  },
});

export type DB = typeof db;
