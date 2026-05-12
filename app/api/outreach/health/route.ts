import { db } from "@/lib/db";
import { outreachCampaigns } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";

/**
 * GET /api/outreach/health
 *
 * Health check endpoint to verify API and dependencies are working.
 * Useful for monitoring, uptime checks, and deployment verification.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["admin", "super_admin"].includes(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const startTime = Date.now();

  try {
    // Check environment variables
    // NOTE: API keys now managed via Settings → Integrations (not process.env)
    const envCheck = {
      databaseUrl: !!process.env.DATABASE_URL,
      integrationEncryptionKey: !!process.env.INTEGRATION_ENCRYPTION_KEY,
      apiKey: !!process.env.OUTREACH_API_KEY,
      cronSecret: !!process.env.OUTREACH_CRON_SECRET,
      siteUrl: !!process.env.NEXT_PUBLIC_SITE_URL,
    };

    const missingEnvVars = Object.entries(envCheck)
      .filter(([, exists]) => !exists)
      .map(([key]) => key);

    if (missingEnvVars.length > 0) {
      return Response.json(
        {
          status: "unhealthy",
          error: "Missing environment variables",
          missing: missingEnvVars,
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    }

    // Test database connection
    let dbHealthy = false;
    try {
      // Simple query to test connection
      await db.select({ id: outreachCampaigns.id }).from(outreachCampaigns).limit(1);

      dbHealthy = true;
    } catch (error) {
      logger.error("Database health check failed:", error);
    }

    const responseTime = Date.now() - startTime;

    // Determine overall health
    const isHealthy = dbHealthy;

    return Response.json(
      {
        status: isHealthy ? "healthy" : "degraded",
        checks: {
          environment: "ok",
          database: dbHealthy ? "ok" : "failed",
        },
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || "unknown",
      },
      { status: isHealthy ? 200 : 503 },
    );
  } catch (error) {
    const responseTime = Date.now() - startTime;

    logger.error("Health check failed:", error);

    return Response.json(
      {
        status: "unhealthy",
        error: "Health check failed",
        message: error instanceof Error ? error.message : "Unknown error",
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
