"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/shadcn/ui/card";
import { Skeleton } from "@/components/shadcn/ui/skeleton";
import { Badge } from "@/components/shadcn/ui/badge";
import { TrendingUp, TrendingDown, Mail, Users, MousePointerClick, Eye } from "lucide-react";

interface Stats {
  totalSubscribers: number;
  activeCampaigns: number;
  avgOpenRate: number;
  avgClickRate: number;
  totalSent: number;
  recentActivity: Array<{
    id: string;
    type: "campaign_sent" | "subscriber_added" | "curation_run";
    description: string;
    timestamp: string;
  }>;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            {trend === "up" && <TrendingUp className="h-3 w-3 text-emerald-600" />}
            {trend === "down" && <TrendingDown className="h-3 w-3 text-destructive" />}
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function NewsletterAnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        const response = await fetch("/api/newsletter/stats");

        if (!response.ok) {
          throw new Error("Failed to fetch stats");
        }

        const data = await response.json();
        setStats(data);
      } catch (err) {
        console.error("Error fetching stats:", err);
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        setLoading(false);
      }
    }

    fetchStats();

    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded">
          <strong className="font-bold">Error: </strong>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Newsletter Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Overview of your newsletter performance and subscriber engagement
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {loading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-3 w-32 mt-2" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : stats ? (
          <>
            <StatCard
              title="Total Subscribers"
              value={stats.totalSubscribers.toLocaleString()}
              subtitle="Verified and active"
              icon={Users}
              trend={stats.totalSubscribers > 0 ? "up" : "neutral"}
            />
            <StatCard
              title="Total Sent"
              value={stats.totalSent.toLocaleString()}
              subtitle="Newsletters delivered"
              icon={Mail}
              trend={stats.totalSent > 0 ? "up" : "neutral"}
            />
            <StatCard
              title="Avg Open Rate"
              value={`${(stats.avgOpenRate * 100).toFixed(1)}%`}
              subtitle={
                stats.avgOpenRate > 0.25
                  ? "Above industry average (21%)"
                  : stats.avgOpenRate > 0.15
                    ? "Average performance"
                    : "Below industry average"
              }
              icon={Eye}
              trend={
                stats.avgOpenRate > 0.25 ? "up" : stats.avgOpenRate > 0.15 ? "neutral" : "down"
              }
            />
            <StatCard
              title="Avg Click Rate"
              value={`${(stats.avgClickRate * 100).toFixed(1)}%`}
              subtitle={
                stats.avgClickRate > 0.025
                  ? "Above industry average (2.3%)"
                  : stats.avgClickRate > 0.015
                    ? "Average performance"
                    : "Below industry average"
              }
              icon={MousePointerClick}
              trend={
                stats.avgClickRate > 0.025 ? "up" : stats.avgClickRate > 0.015 ? "neutral" : "down"
              }
            />
          </>
        ) : null}
      </div>

      {/* Recent Activity */}
      {!loading && stats && stats.recentActivity.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 pb-4 border-b last:border-0"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{activity.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(activity.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant="default">{activity.type.replace("_", " ")}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!loading && stats && stats.totalSent === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No newsletters sent yet</h3>
            <p className="text-muted-foreground">
              Create and send your first newsletter to start seeing analytics data.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
