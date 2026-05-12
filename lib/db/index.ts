import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

/**
 * Cache the postgres connection pool in development.
 * Avoids creating a new connection pool on every HMR update,
 * which would exhaust the database connection limit.
 */
const globalForDb = globalThis as unknown as {
  conn?: postgres.Sql;
  db?: Database;
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

  const conn =
    globalForDb.conn ??
    postgres(connectionString, {
      prepare: false,
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      max_lifetime: 60 * 30,
      connection: {
        statement_timeout: 15000,
      },
    });
  if (process.env.NODE_ENV !== "production") globalForDb.conn = conn;

  return drizzle({ client: conn, schema });
}

/**
 * Lazy proxy: the connection is created on first property access, not at module
 * import time. This lets Next.js's build-time page data collection load the
 * module without DATABASE_URL being available, while still throwing a clear
 * error if the DB is actually used at runtime without the env var set.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const realDb = (globalForDb.db ??= createDb());
    const value = realDb[prop as keyof Database];
    return typeof value === "function" ? value.bind(realDb) : value;
  },
});

export type DB = typeof db;
