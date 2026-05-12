"use client";

import { useEffect, useState } from "react";
import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import { Badge } from "@/components/shadcn/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/ui/card";
import { Skeleton } from "@/components/shadcn/ui/skeleton";

interface NewsletterStats {
  totalSubscribers: number;
  avgOpenRate: number;
  avgClickRate: number;
  totalSent: number;
  activeCampaigns: number;
}

export function NewsletterSectionCards() {
  const [stats, setStats] = useState<NewsletterStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/newsletter/stats");
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        setError(true);
      }
    } catch (error) {
      console.error("Failed to fetch newsletter stats:", error);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 px-4 lg:px-6 @5xl/main:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="@container/card">
            <CardHeader>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32 mt-2" />
              <Skeleton className="h-6 w-16 mt-2" />
            </CardHeader>
            <div className="px-6 pb-6">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-3/4 mt-2" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardDescription className="text-red-500">
              Failed to load newsletter statistics
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Calculate trends (mock for now - in production, compare to previous period)
  const subscriberTrend = 8.5; // % growth
  const openRateTrend = stats.avgOpenRate > 25 ? 5.2 : -2.1;
  const clickRateTrend = stats.avgClickRate > 3 ? 3.8 : -1.5;
  const sentTrend = 12.0;

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-2 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @5xl/main:grid-cols-4">
      {/* Total Subscribers */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Subscribers</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {stats.totalSubscribers.toLocaleString()}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {subscriberTrend > 0 ? <IconTrendingUp /> : <IconTrendingDown />}
              {subscriberTrend > 0 ? "+" : ""}
              {subscriberTrend}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {subscriberTrend > 0 ? "Growing this month" : "Needs attention"}{" "}
            {subscriberTrend > 0 ? (
              <IconTrendingUp className="size-4" />
            ) : (
              <IconTrendingDown className="size-4" />
            )}
          </div>
          <div className="text-muted-foreground">Verified active subscribers</div>
        </CardFooter>
      </Card>

      {/* Average Open Rate */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Average Open Rate</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {stats.avgOpenRate.toFixed(1)}%
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {openRateTrend > 0 ? <IconTrendingUp /> : <IconTrendingDown />}
              {openRateTrend > 0 ? "+" : ""}
              {openRateTrend.toFixed(1)}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {stats.avgOpenRate > 25 ? "Above industry average" : "Room for improvement"}{" "}
            {openRateTrend > 0 ? (
              <IconTrendingUp className="size-4" />
            ) : (
              <IconTrendingDown className="size-4" />
            )}
          </div>
          <div className="text-muted-foreground">Based on last 10 newsletters</div>
        </CardFooter>
      </Card>

      {/* Average Click Rate */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Average Click Rate</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {stats.avgClickRate.toFixed(1)}%
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {clickRateTrend > 0 ? <IconTrendingUp /> : <IconTrendingDown />}
              {clickRateTrend > 0 ? "+" : ""}
              {clickRateTrend.toFixed(1)}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {stats.avgClickRate > 3 ? "Strong engagement" : "Optimize CTAs"}{" "}
            {clickRateTrend > 0 ? (
              <IconTrendingUp className="size-4" />
            ) : (
              <IconTrendingDown className="size-4" />
            )}
          </div>
          <div className="text-muted-foreground">Click-through performance</div>
        </CardFooter>
      </Card>

      {/* Total Sent */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Sent</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {stats.totalSent.toLocaleString()}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {sentTrend > 0 ? <IconTrendingUp /> : <IconTrendingDown />}
              {sentTrend > 0 ? "+" : ""}
              {sentTrend}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {sentTrend > 0 ? "Consistent delivery" : "Activity declined"}{" "}
            {sentTrend > 0 ? (
              <IconTrendingUp className="size-4" />
            ) : (
              <IconTrendingDown className="size-4" />
            )}
          </div>
          <div className="text-muted-foreground">Newsletters delivered</div>
        </CardFooter>
      </Card>
    </div>
  );
}
