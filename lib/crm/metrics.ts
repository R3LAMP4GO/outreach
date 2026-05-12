/**
 * CRM Metrics domain functions
 *
 * Extracted from API route handler to centralize business logic.
 * Supports fallback to direct queries when RPC functions don't exist.
 */

import { eq, sql, isNotNull, gte, and } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cache } from "react";
import { db } from "@/lib/db";
import { deals, stages, dealStageHistory } from "@/lib/db/schema";
import type { MetricsRpcResult, DashboardRpcResult, CrmMetricsResult } from "./types";

// ---------------------------------------------------------------------------
// RPC helpers (primary path)
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

function withQueryTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("CRM fallback query timeout")), ms),
    ),
  ]);
}

async function fetchMetricsViaRpc(): Promise<MetricsRpcResult | null> {
  try {
    const result = await withTimeout(
      db.execute<{ data: MetricsRpcResult }>(sql`SELECT get_crm_metrics() as data`),
      5000,
    );
    if (!result) return null;
    return (result[0] as { data?: MetricsRpcResult })?.data ?? null;
  } catch {
    console.warn("[CRM] get_crm_metrics RPC failed, falling back to direct queries");
    return null;
  }
}

async function fetchDashboardViaRpc(): Promise<DashboardRpcResult | null> {
  try {
    const result = await withTimeout(
      db.execute<{ data: DashboardRpcResult }>(sql`SELECT get_crm_dashboard_data() as data`),
      5000,
    );
    if (!result) return null;
    return (result[0] as { data?: DashboardRpcResult })?.data ?? null;
  } catch {
    console.warn("[CRM] get_crm_dashboard_data RPC failed, falling back to direct queries");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fallback: build MetricsRpcResult from direct queries
// ---------------------------------------------------------------------------

async function fetchMetricsFallback(): Promise<MetricsRpcResult> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      openDealsRows,
      activeCountRows,
      newLeadsRows,
      wonCountRows,
      lostCountRows,
      wonDealsRows,
    ] = await Promise.all([
      withQueryTimeout(
        db.select({ amount: deals.amount }).from(deals).where(eq(deals.status, "open")),
      ).catch(() => [] as Array<{ amount: unknown }>),
      withQueryTimeout(
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(deals)
          .where(eq(deals.status, "open")),
      ).catch(() => [{ count: 0 }]),
      withQueryTimeout(
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(deals)
          .where(gte(deals.createdAt, thirtyDaysAgo)),
      ).catch(() => [{ count: 0 }]),
      withQueryTimeout(
        db.select({ count: sql<number>`count(*)::int` }).from(deals).where(eq(deals.status, "won")),
      ).catch(() => [{ count: 0 }]),
      withQueryTimeout(
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(deals)
          .where(eq(deals.status, "lost")),
      ).catch(() => [{ count: 0 }]),
      withQueryTimeout(
        db
          .select({ createdAt: deals.createdAt, wonAt: deals.wonAt })
          .from(deals)
          .where(and(eq(deals.status, "won"), isNotNull(deals.wonAt))),
      ).catch(() => []),
    ]);

    const pipelineValue = openDealsRows.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const activeDeals = activeCountRows[0]?.count ?? 0;
    const newLeads = newLeadsRows[0]?.count ?? 0;

    const wonCount = wonCountRows[0]?.count ?? 0;
    const lostCount = lostCountRows[0]?.count ?? 0;
    const totalClosed = wonCount + lostCount;
    const winRate = totalClosed > 0 ? Math.round((wonCount / totalClosed) * 100) : 0;

    let salesCycle = 0;
    if (wonDealsRows.length > 0) {
      const totalDays = wonDealsRows.reduce((sum, d) => {
        const created = new Date(d.createdAt as string).getTime();
        const won = new Date(d.wonAt as string).getTime();
        return sum + (won - created) / (1000 * 60 * 60 * 24);
      }, 0);
      salesCycle = Math.round(totalDays / wonDealsRows.length);
    }

    return { pipelineValue, activeDeals, newLeads, winRate, salesCycle };
  } catch (err) {
    console.warn("[CRM] fetchMetricsFallback failed:", err);
    return { pipelineValue: 0, activeDeals: 0, newLeads: 0, winRate: 0, salesCycle: 0 };
  }
}

// ---------------------------------------------------------------------------
// Fallback: build DashboardRpcResult from direct queries
// ---------------------------------------------------------------------------

async function fetchDashboardFallback(): Promise<DashboardRpcResult> {
  try {
    const fiftysixDaysAgo = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString();

    const fromStage = alias(stages, "from_stage");
    const toStage = alias(stages, "to_stage");

    // Batch 1: pipeline stages with deal counts in one JOIN (replaces 3 sequential round-trips)
    const [pipelineRows, [sourceRows, recentDealsRows, historyRows]] = await Promise.all([
      withQueryTimeout(
        db.execute<{
          stage_name: string;
          stage_slug: string;
          stage_color: string;
          display_order: number;
          deal_count: number;
          deal_value: string;
        }>(sql`
          SELECT
            s.name        AS stage_name,
            s.slug        AS stage_slug,
            s.color       AS stage_color,
            s.display_order,
            count(d.id)::int                    AS deal_count,
            coalesce(sum(d.amount), 0)::numeric AS deal_value
          FROM pipelines p
          JOIN stages s ON s.pipeline_id = p.id
          LEFT JOIN deals d ON d.stage_id = s.id
          WHERE p.slug = 'sales-pipeline'
          GROUP BY s.id, s.name, s.slug, s.color, s.display_order
          ORDER BY s.display_order
        `),
      ).catch(
        () =>
          [] as Array<{
            stage_name: string;
            stage_slug: string;
            stage_color: string;
            display_order: number;
            deal_count: number;
            deal_value: string;
          }>,
      ),

      // Batch 2: remaining 3 queries run in parallel
      Promise.all([
        withQueryTimeout(
          db.execute<{ source: string; deal_count: number }>(sql`
            SELECT source, count(*)::int AS deal_count
            FROM deals
            WHERE status = 'open'
            GROUP BY source
          `),
        ).catch(() => [] as Array<{ source: string; deal_count: number }>),
        withQueryTimeout(
          db
            .select({ createdAt: deals.createdAt })
            .from(deals)
            .where(gte(deals.createdAt, fiftysixDaysAgo)),
        ).catch(() => []),
        withQueryTimeout(
          db
            .select({
              id: dealStageHistory.id,
              changedAt: dealStageHistory.changedAt,
              dealName: deals.name,
              fromStageName: fromStage.name,
              fromStageColor: fromStage.color,
              toStageName: toStage.name,
              toStageColor: toStage.color,
            })
            .from(dealStageHistory)
            .innerJoin(deals, eq(dealStageHistory.dealId, deals.id))
            .leftJoin(fromStage, eq(dealStageHistory.fromStageId, fromStage.id))
            .leftJoin(toStage, eq(dealStageHistory.toStageId, toStage.id))
            .orderBy(sql`${dealStageHistory.changedAt} DESC`)
            .limit(10),
        ).catch(() => []),
      ]),
    ]);

    const pipeline: DashboardRpcResult["pipeline"] = pipelineRows.map((r) => ({
      stage: r.stage_name,
      slug: r.stage_slug,
      color: r.stage_color,
      count: Number(r.deal_count),
      value: Number(r.deal_value),
    }));

    const sources: DashboardRpcResult["sources"] = sourceRows.map((r) => ({
      source: (r.source as string) || "unknown",
      count: Number(r.deal_count),
    }));

    const dayCounts = new Map<string, number>();
    for (const d of recentDealsRows) {
      const day = (d.createdAt as string).slice(0, 10); // YYYY-MM-DD
      dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
    }
    const leadsOverTime: DashboardRpcResult["leadsOverTime"] = Array.from(dayCounts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    const recentActivity: DashboardRpcResult["recentActivity"] = historyRows.map((row) => ({
      id: row.id,
      changed_at: (row.changedAt as string | null) ?? new Date().toISOString(),
      deal_name: row.dealName || "Unknown Deal",
      from_stage: row.fromStageName || null,
      from_stage_color: row.fromStageColor || null,
      to_stage: row.toStageName || "Unknown",
      to_stage_color: row.toStageColor || null,
    }));

    return { pipeline, sources, leadsOverTime, recentActivity };
  } catch (err) {
    console.warn("[CRM] fetchDashboardFallback failed:", err);
    return { pipeline: [], sources: [], leadsOverTime: [], recentActivity: [] };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all CRM metrics and dashboard data (uncached).
 * Tries RPC functions first; falls back to direct queries if RPCs are unavailable.
 */
async function getCrmMetricsUncached(): Promise<CrmMetricsResult> {
  try {
    // Call both RPCs in parallel
    const [metrics, dashboard] = await Promise.all([
      fetchMetricsViaRpc().then((result) => result ?? fetchMetricsFallback()),
      fetchDashboardViaRpc().then((result) => result ?? fetchDashboardFallback()),
    ]);

    // Map leadsOverTime from daily (date) to weekly format expected by the frontend
    const leadsOverTime = (dashboard.leadsOverTime || []).map((entry) => ({
      week: new Date(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: entry.count,
    }));

    // Map recentActivity to the camelCase shape expected by the frontend
    const recentActivity = (dashboard.recentActivity || []).map((a) => ({
      id: a.id,
      changedAt: a.changed_at ?? new Date().toISOString(),
      triggerSource: null,
      dealName: a.deal_name || "Unknown Deal",
      fromStage: a.from_stage
        ? { name: a.from_stage, color: a.from_stage_color || "#6b7280" }
        : null,
      toStage: { name: a.to_stage, color: a.to_stage_color || "#6b7280" },
    }));

    return {
      // Summary metrics (consumed by CRM layout)
      pipelineValue: metrics.pipelineValue,
      winRate: metrics.winRate,
      avgSalesCycle: metrics.salesCycle,
      activeDeals: metrics.activeDeals,
      newLeads: metrics.newLeads,
      // Dashboard chart data (consumed by CRM dashboard page)
      dealsByStage: (dashboard.pipeline || []).map((s) => ({
        stage: s.stage,
        slug: s.slug || "",
        color: s.color || "#6b7280",
        count: s.count,
        value: s.value,
      })),
      dealsBySource: (dashboard.sources || []).map((s) => ({
        source: s.source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        count: s.count,
      })),
      leadsOverTime,
      recentActivity,
    };
  } catch (err) {
    console.warn("[CRM] getCrmMetricsUncached failed:", err);
    return {
      pipelineValue: 0,
      winRate: 0,
      avgSalesCycle: 0,
      activeDeals: 0,
      newLeads: 0,
      dealsByStage: [],
      dealsBySource: [],
      leadsOverTime: [],
      recentActivity: [],
    };
  }
}

/**
 * Request-deduplicated version of getCrmMetrics via React.cache().
 * Prevents duplicate calls within the same render tree.
 */
export const getCrmMetrics = cache(getCrmMetricsUncached);
