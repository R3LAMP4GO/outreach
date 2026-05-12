/**
 * pg-boss singleton client
 *
 * server-only — never import in Client Components or edge runtime.
 */

import "server-only";
import { PgBoss } from "pg-boss";

let _boss: PgBoss | null = null;
let _startPromise: Promise<PgBoss> | null = null;

/**
 * Returns the running pg-boss instance, starting it on first call.
 * Subsequent calls return the same instance (singleton).
 */
export async function getBoss(): Promise<PgBoss> {
  if (_boss) return _boss;

  if (_startPromise) return _startPromise;

  _startPromise = (async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    const boss = new PgBoss(databaseUrl);

    boss.on("error", (err) => {
      console.error("[pg-boss] error:", err);
    });

    await boss.start();
    _boss = boss;

    // Gracefully stop pg-boss on web process shutdown so the connection pool
    // is drained before Railway terminates the container.
    const stop = async () => {
      await boss.stop();
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);

    return boss;
  })();

  return _startPromise;
}
