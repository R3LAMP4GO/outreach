import { Suspense } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/ui/card";
import {
  IconUsers,
  IconClock,
  IconTarget,
  IconMail,
  IconCurrencyDollar,
  IconMessageCircle,
  IconAlertTriangle,
  IconMoodSmile,
  IconMoodEmpty,
  IconMoodSad,
  IconRobot,
} from "@tabler/icons-react";
import { Skeleton } from "@/components/shadcn/ui/skeleton";
import { Button } from "@/components/shadcn/ui/button";
import {
  getDashboardKpi,
  getDashboardChannels,
  getDashboardInsights,
  getDashboardActivity,
} from "@/lib/admin/dashboard-data";
import { DashboardQuickActions } from "@/components/admin/DashboardQuickActions";
import { DashboardErrorBoundary } from "@/components/admin/DashboardErrorBoundary";

const iconMap: Record<string, typeof IconUsers> = {
  IconCurrencyDollar,
  IconMessageCircle,
  IconMail,
  IconUsers,
  IconClock,
  IconTarget,
};

function formatCurrency(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  }
  return `$${value.toLocaleString()}`;
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

// ---------------------------------------------------------------------------
// Skeleton components — one per section, matching the shape of the real UI
// ---------------------------------------------------------------------------

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PipelineSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-32 w-full" />
      </CardContent>
    </Card>
  );
}

function ChannelsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Async section components — each fetches only its slice of data
// ---------------------------------------------------------------------------

async function KpiSection() {
  const { kpi } = await getDashboardKpi();

  const kpiCards = [
    {
      title: "Active Deals",
      value: kpi.activeDeals.toString(),
      description: "Pipeline",
      icon: IconTarget,
      color: "text-chart-1",
    },
    {
      title: "Total Contacts",
      value: kpi.totalContacts.toLocaleString(),
      description: "Growing",
      icon: IconUsers,
      color: "text-foreground",
    },
    {
      title: "Email Reply",
      value: `${kpi.emailReplyRate}%`,
      description: "Engaged",
      icon: IconMail,
      color: "text-foreground",
    },
    {
      title: "Meetings",
      value: kpi.meetingsBooked.toString(),
      description: "Booked",
      icon: IconClock,
      color: "text-chart-3",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {kpiCards.map((kpiCard) => (
        <Card key={kpiCard.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{kpiCard.title}</CardTitle>
            <kpiCard.icon className={`h-4 w-4 ${kpiCard.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpiCard.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{kpiCard.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function PipelineSection() {
  const { pipeline, pipelineInsights } = await getDashboardKpi();

  const maxPipelineCount = Math.max(...pipeline.map((s) => s.count), 1);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>CRM Pipeline</CardTitle>
          <CardDescription>Deal Flow Visualization</CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/crm/deals">View All Deals</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Pipeline Stages */}
          <div className="flex items-start justify-between gap-1">
            {pipeline.map((stage, index) => {
              const percentage = Math.round((stage.count / maxPipelineCount) * 100);
              return (
                <div key={`${stage.slug}-${index}`} className="contents">
                  {index > 0 && (
                    <div className="flex items-center pt-10">
                      <div className="text-muted-foreground">→</div>
                    </div>
                  )}
                  <div className="flex-1 text-center">
                    <div className="text-xs font-medium mb-1">{stage.stage}</div>
                    <div className="text-xl font-bold mb-1">{stage.count}</div>
                    <div className="text-xs text-muted-foreground mb-2">{percentage}%</div>
                    <div className="w-full h-12 bg-muted rounded-t">
                      <div
                        className="h-full rounded-t"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: stage.color,
                        }}
                      ></div>
                    </div>
                    <div className="w-full h-1 bg-muted rounded-b"></div>
                  </div>
                </div>
              );
            })}
            {pipeline.length === 0 && (
              <div className="w-full text-center py-8 text-muted-foreground text-sm">
                No pipeline data available
              </div>
            )}
          </div>

          {/* Insights */}
          <div className="flex items-center justify-center gap-8 pt-4 border-t">
            <div className="flex items-center gap-2 text-sm">
              <IconAlertTriangle className="h-4 w-4 text-chart-3" />
              <span className="text-muted-foreground">
                {pipelineInsights.stalledDeals} deals stalled &gt;30 days
              </span>
            </div>
            <div className="text-border">|</div>
            <div className="flex items-center gap-2 text-sm">
              <IconCurrencyDollar className="h-4 w-4 text-chart-2" />
              <span className="text-muted-foreground">
                {formatCurrency(pipelineInsights.meetingStageValue)} in Meeting stage
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

async function ChannelsSection() {
  const { newsletter, outreach } = await getDashboardChannels();

  const totalCampaigns = Object.values(outreach.byStatus).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Newsletter Performance */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Newsletter Performance</CardTitle>
            <CardDescription>Subscriber engagement metrics</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/newsletter">View Details</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Total Subscribers</div>
              <div className="text-2xl font-bold">
                {newsletter.totalSubscribers.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Verified</div>
              <div className="text-2xl font-bold text-foreground">
                {newsletter.verified.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Total Sent</div>
              <div className="text-2xl font-bold">{newsletter.totalSent.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Unsubscribed</div>
              <div className="text-2xl font-bold text-chart-3">
                {newsletter.unsubscribed.toLocaleString()}
              </div>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-3">Engagement Rates</div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-muted-foreground">Open Rate</span>
                  <span className="text-sm font-medium">{newsletter.openRate}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full">
                  <div
                    className="h-2 bg-chart-1 rounded-full"
                    style={{ width: `${Math.min(newsletter.openRate, 100)}%` }}
                  ></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-muted-foreground">Click Rate</span>
                  <span className="text-sm font-medium">{newsletter.clickRate}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full">
                  <div
                    className="h-2 bg-chart-1 rounded-full"
                    style={{ width: `${Math.min(newsletter.clickRate * 5, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Outreach Campaigns */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Outreach Campaigns</CardTitle>
            <CardDescription>Campaign performance overview</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/outreach">View Details</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Active Campaigns</div>
              <div className="text-2xl font-bold text-chart-1">{outreach.activeCampaigns}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Total Sent</div>
              <div className="text-2xl font-bold">{outreach.totalSent.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Total Replies</div>
              <div className="text-2xl font-bold text-foreground">
                {outreach.totalReplies.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Reply Rate</div>
              <div className="text-2xl font-bold text-foreground">{outreach.replyRate}%</div>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-3">Campaign Status</div>
            <div className="grid grid-cols-2 gap-4">
              {(
                [
                  { key: "draft" as const, label: "Draft", barClass: "bg-muted" },
                  { key: "active" as const, label: "Active", barClass: "bg-chart-1" },
                  { key: "paused" as const, label: "Paused", barClass: "bg-chart-3" },
                  { key: "completed" as const, label: "Completed", barClass: "bg-chart-2" },
                ] as const
              ).map(({ key, label, barClass }) => (
                <div key={key}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="text-sm font-medium">{outreach.byStatus[key]}</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full">
                    <div
                      className={`h-2 ${barClass} rounded-full`}
                      style={{
                        width: `${(outreach.byStatus[key] / totalCampaigns) * 100}%`,
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

async function InsightsSection() {
  const { emailIntelligence, sourceAttribution, topUtmCampaigns } = await getDashboardInsights();

  const totalReplies =
    emailIntelligence.positive + emailIntelligence.neutral + emailIntelligence.negative || 1;

  const maxSourceContacts = Math.max(...sourceAttribution.map((s) => s.contactCount), 1);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Email Intelligence */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Email Intelligence</CardTitle>
            <CardDescription>AI-powered reply analysis</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/inbox">View All Replies</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="text-sm font-medium mb-3">Reply Metrics</div>
            <div className="grid grid-cols-2 gap-4">
              {[
                {
                  icon: IconMoodSmile,
                  iconClass: "text-chart-2",
                  barClass: "bg-chart-2",
                  label: "Positive",
                  count: emailIntelligence.positive,
                },
                {
                  icon: IconMoodEmpty,
                  iconClass: "text-muted-foreground",
                  barClass: "bg-muted",
                  label: "Neutral",
                  count: emailIntelligence.neutral,
                },
                {
                  icon: IconMoodSad,
                  iconClass: "text-destructive",
                  barClass: "bg-destructive",
                  label: "Negative",
                  count: emailIntelligence.negative,
                },
                {
                  icon: IconRobot,
                  iconClass: "text-muted-foreground",
                  barClass: "bg-muted",
                  label: "Auto-Reply",
                  count: emailIntelligence.autoReply,
                },
              ].map((metric) => {
                const pct = Math.round((metric.count / totalReplies) * 100);
                return (
                  <div key={metric.label}>
                    <div className="flex items-center gap-2 mb-2">
                      <metric.icon className={`h-4 w-4 ${metric.iconClass}`} />
                      <span className="text-sm text-muted-foreground">{metric.label}</span>
                    </div>
                    <div className="text-xl font-bold mb-1">
                      {metric.count} ({pct}%)
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full">
                      <div
                        className={`h-2 ${metric.barClass} rounded-full`}
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t space-y-2">
            <div className="text-sm font-medium mb-3">Action Items</div>
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-sm">
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">
                  {emailIntelligence.actionItems.highIntentFollowUps} high-intent replies require
                  follow-up
                </span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">
                  {emailIntelligence.actionItems.dealsCreatedFromReplies} deals automatically
                  created from positive replies
                </span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">
                  Average response time:{" "}
                  {emailIntelligence.actionItems.avgResponseTimeHours !== null
                    ? `${emailIntelligence.actionItems.avgResponseTimeHours} hours`
                    : "N/A"}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact Source Attribution */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Contact Source Attribution</CardTitle>
            <CardDescription>Lead sources and conversion tracking</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/analytics">Full Report →</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div>
              <div className="text-sm font-medium mb-4">Top Sources (All Time)</div>
              <div className="space-y-4">
                {sourceAttribution.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    No source data available
                  </div>
                )}
                {sourceAttribution.map((source) => (
                  <div key={source.source}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <IconTarget className="h-4 w-4 text-chart-1" />
                        <span className="text-sm font-medium">{source.source}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold">${source.revenue.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">
                          conv: {source.conversionRate}%
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-xs text-muted-foreground">
                        {source.contactCount} contacts
                      </div>
                      <div className="text-xs text-muted-foreground">│</div>
                      <div className="text-xs text-muted-foreground">{source.dealCount} deals</div>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full">
                      <div
                        className="h-2 bg-chart-1 rounded-full"
                        style={{
                          width: `${(source.contactCount / maxSourceContacts) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="text-sm font-medium mb-3">Top UTM Campaigns</div>
              <div className="space-y-2">
                {topUtmCampaigns.length === 0 && (
                  <div className="text-sm text-muted-foreground">No UTM campaign data</div>
                )}
                {topUtmCampaigns.map((campaign) => (
                  <div key={campaign.campaign} className="flex items-start gap-2 text-sm">
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">
                      {campaign.campaign} → {campaign.contactCount} contacts → $
                      {campaign.revenue.toLocaleString()} revenue
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

async function ActivitySection() {
  const { recentActivity } = await getDashboardActivity();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest updates across all systems</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/activity">View All →</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {recentActivity.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">No recent activity</div>
          )}
          {recentActivity.map((activity, index) => {
            const ActivityIcon = iconMap[activity.icon] || IconTarget;
            const isLast = index === recentActivity.length - 1;

            return (
              <div key={activity.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className="w-2 h-2 rounded-full mt-1.5"
                    style={{ backgroundColor: activity.color }}
                  ></div>
                  {!isLast && <div className="w-px h-full bg-muted mt-2"></div>}
                </div>
                <div className={`flex-1 ${!isLast ? "pb-4" : ""}`}>
                  <div className="text-xs text-muted-foreground mb-1">
                    {timeAgo(activity.timestamp)}
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <ActivityIcon className="h-4 w-4" style={{ color: activity.color }} />
                    <span className="font-medium text-sm">{activity.description}</span>
                  </div>
                  {activity.detail && (
                    <p className="text-sm text-muted-foreground">{activity.detail}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page — multiple independent Suspense boundaries for progressive loading
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  return (
    <div className="p-6 space-y-6">
      {/* KPI cards — fastest, loads first */}
      <DashboardErrorBoundary sectionName="KPI">
        <Suspense fallback={<KpiSkeleton />}>
          <KpiSection />
        </Suspense>
      </DashboardErrorBoundary>

      {/* Pipeline — same data source as KPI, loads in parallel */}
      <DashboardErrorBoundary sectionName="Pipeline">
        <Suspense fallback={<PipelineSkeleton />}>
          <PipelineSection />
        </Suspense>
      </DashboardErrorBoundary>

      {/* Newsletter + Outreach — medium priority */}
      <DashboardErrorBoundary sectionName="Channels">
        <Suspense fallback={<ChannelsSkeleton />}>
          <ChannelsSection />
        </Suspense>
      </DashboardErrorBoundary>

      {/* Email Intelligence + Source Attribution — slower, below the fold */}
      <DashboardErrorBoundary sectionName="Insights">
        <Suspense fallback={<InsightsSkeleton />}>
          <InsightsSection />
        </Suspense>
      </DashboardErrorBoundary>

      {/* Recent activity — slowest, bottom of page */}
      <DashboardErrorBoundary sectionName="Activity">
        <Suspense fallback={<ActivitySkeleton />}>
          <ActivitySection />
        </Suspense>
      </DashboardErrorBoundary>

      {/* Quick Actions — no data dependency, renders instantly */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks and shortcuts</CardDescription>
        </CardHeader>
        <CardContent>
          <DashboardQuickActions />
        </CardContent>
      </Card>
    </div>
  );
}
