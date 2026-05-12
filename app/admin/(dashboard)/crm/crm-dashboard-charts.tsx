"use client";

import { useId } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/shadcn/ui/chart";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  Area,
  AreaChart,
  Pie,
  PieChart,
  Cell,
  CartesianGrid,
} from "recharts";
import { getEventStyle, formatRelativeTime } from "@/lib/crm/event-styles";

interface StageData {
  stage: string;
  slug: string;
  color: string;
  count: number;
  value: number;
}

interface SourceData {
  source: string;
  count: number;
}

interface LeadWeek {
  week: string;
  count: number;
}

export interface CRMChartData {
  dealsByStage: StageData[];
  dealsBySource: SourceData[];
  leadsOverTime: LeadWeek[];
  recentActivity: Array<{
    id: string;
    changedAt: string;
    triggerSource: string | null;
    dealName: string;
    fromStage: { name: string; color: string } | null;
    toStage: { name: string; color: string };
  }>;
}

export interface CRMActivityEvent {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  metadata: unknown;
  created_at: string | null;
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    contact_status: string | null;
  } | null;
}

const SOURCE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

interface CRMDashboardChartsProps {
  charts: CRMChartData;
  activityFeed: CRMActivityEvent[];
}

export function CRMDashboardCharts({ charts: data, activityFeed }: CRMDashboardChartsProps) {
  const id = useId();
  const leadsGradientId = `${id}-leadsGradient`;

  const stageChartConfig: ChartConfig = Object.fromEntries(
    data.dealsByStage.map((s) => [s.slug, { label: s.stage, color: s.color }]),
  );

  const sourceChartConfig: ChartConfig = Object.fromEntries(
    data.dealsBySource.map((s, i) => [
      s.source,
      { label: s.source, color: SOURCE_COLORS[i % SOURCE_COLORS.length] },
    ]),
  );

  const leadsChartConfig: ChartConfig = {
    count: { label: "New Leads", color: "var(--chart-1)" },
  };

  return (
    <div className="p-6 space-y-6">
      {/* Row 1: Pipeline by Stage - Full Width */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline by Stage</CardTitle>
          <CardDescription>Deal count and value per stage</CardDescription>
        </CardHeader>
        <CardContent>
          {data.dealsByStage.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No deals in pipeline yet</p>
          ) : (
            <ChartContainer config={stageChartConfig} className="h-[300px] w-full">
              <BarChart data={data.dealsByStage} margin={{ bottom: 20 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="stage" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value: unknown, name: string) => {
                        if (name === "value")
                          return [
                            `$${Number(value).toLocaleString()}`,
                            "Value",
                          ] as React.ReactNode[];
                        return [value as React.ReactNode, "Deals"] as React.ReactNode[];
                      }}
                    />
                  }
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {data.dealsByStage.map((entry, index) => (
                    <Cell key={`${entry.slug}-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Row 2: Deals by Source + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Deals by Source</CardTitle>
            <CardDescription>Where your deals originate</CardDescription>
          </CardHeader>
          <CardContent>
            {data.dealsBySource.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No deal sources yet</p>
            ) : (
              <ChartContainer config={sourceChartConfig} className="h-[300px] w-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="source" />} />
                  <Pie
                    data={data.dealsBySource}
                    dataKey="count"
                    nameKey="source"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    strokeWidth={2}
                    label={({ payload: p }: { payload?: Record<string, unknown> }) =>
                      `${p?.source} (${p?.count})`
                    }
                    labelLine={false}
                  >
                    {data.dealsBySource.map((entry, index) => (
                      <Cell key={entry.source} fill={SOURCE_COLORS[index % SOURCE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest events across all systems</CardDescription>
          </CardHeader>
          <CardContent>
            {activityFeed.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No recent activity</p>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {activityFeed.map((event) => {
                  const { icon: Icon, color, bg } = getEventStyle(event.event_type);
                  const contactName = event.contact
                    ? [event.contact.first_name, event.contact.last_name]
                        .filter(Boolean)
                        .join(" ") || event.contact.email
                    : "Unknown";
                  return (
                    <div key={event.id} className="flex items-start gap-3 text-sm">
                      <div className={`rounded-full p-1.5 shrink-0 ${bg}`}>
                        <Icon className={`h-3.5 w-3.5 ${color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{event.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{contactName}</p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {event.created_at ? formatRelativeTime(event.created_at) : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Leads Over Time - Full Width */}
      <Card>
        <CardHeader>
          <CardTitle>Leads Over Time</CardTitle>
          <CardDescription>New contacts per week (last 8 weeks)</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={leadsChartConfig} className="h-[300px] w-full">
            <AreaChart data={data.leadsOverTime}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <defs>
                <linearGradient id={leadsGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--chart-1)"
                fill={`url(#${leadsGradientId})`}
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
