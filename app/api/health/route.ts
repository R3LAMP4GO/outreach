/**
 * Health Check API
 *
 * Public: returns basic status for uptime monitoring.
 * Authenticated (CRON_SECRET bearer token): returns detailed checks.
 *
 * GET /api/health - Get system health status
 */

import { NextRequest, NextResponse } from "next/server";
import { getQueueHealth } from "@/lib/newsletter/lib/queue";
import { db } from "@/lib/db";
import { newsletterCampaigns } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { logger } from "@/lib/logger";

function isAuthenticated(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authHeader) return false;
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * GET /api/health
 * Check system health
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const authenticated = isAuthenticated(request);

  // Basic health check for unauthenticated requests (uptime monitoring)
  if (!authenticated) {
    let dbHealthy = false;
    try {
      await db.select({ id: newsletterCampaigns.id }).from(newsletterCampaigns).limit(1);
      dbHealthy = true;
    } catch {
      dbHealthy = false;
    }

    const status = dbHealthy ? "ok" : "degraded";
    const statusCode = dbHealthy ? 200 : 503;

    return NextResponse.json(
      { status, timestamp: new Date().toISOString() },
      { status: statusCode },
    );
  }

  // Detailed health check for authenticated requests
  const health: Record<string, unknown> = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    checks: {} as Record<string, unknown>,
  };
  const checks = health.checks as Record<string, unknown>;

  try {
    // Check Database
    try {
      await db.execute(sql`SELECT 1`);

      checks.database = {
        status: "healthy",
      };
    } catch (error) {
      logger.error("Health check: database connection failed", error);
      checks.database = {
        status: "unhealthy",
        error: "connection failed",
      };
      health.status = "degraded";
    }

    // Check Newsletter Queue (QStash)
    try {
      const queueHealth = await getQueueHealth();

      checks.queue = {
        status: queueHealth.healthy ? "healthy" : "unhealthy",
        issues: queueHealth.issues.length > 0 ? queueHealth.issues : undefined,
      };

      if (!queueHealth.healthy) {
        health.status = "degraded";
      }
    } catch (error) {
      logger.error("Health check: queue connection failed", error);
      checks.queue = {
        status: "unhealthy",
        error: "connection failed",
      };
      health.status = "degraded";
    }

    // Check environment variables
    const requiredEnvVars = [
      "DATABASE_URL",
      "RESEND_API_KEY",
      "OPENAI_API_KEY",
      "NEWSLETTER_API_KEY",
    ];

    const missingCount = requiredEnvVars.filter((varName) => !process.env[varName]).length;

    checks.environment = {
      status: missingCount === 0 ? "healthy" : "unhealthy",
      configured: missingCount === 0,
    };

    if (missingCount > 0) {
      health.status = "unhealthy";
    }

    health.responseTime = Date.now() - startTime;

    const statusCode = health.status === "healthy" ? 200 : 503;
    return NextResponse.json(health, { status: statusCode });
  } catch (_error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "connection failed",
        responseTime: Date.now() - startTime,
      },
      { status: 503 },
    );
  }
}
