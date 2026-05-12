"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shadcn/ui/card";
import { IconTrendingUp, IconUsers, IconTarget, IconSparkles } from "@tabler/icons-react";

interface KPIMetrics {
  pipelineValue: number;
  winRate: number;
  salesCycle: number;
  activeDeals: number;
  newLeads: number;
}

interface CRMLayoutShellProps {
  kpi: KPIMetrics;
  children: React.ReactNode;
}

const formatCurrency = (value: number) => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${Math.round(value)}`;
};

export function CRMLayoutShell({ kpi, children }: CRMLayoutShellProps) {
  const pathname = usePathname();

  const kpiCards = [
    {
      title: "Pipeline Value",
      value: formatCurrency(kpi.pipelineValue),
      description: "Total value of active deals",
      icon: IconTrendingUp,
      color: "text-blue-600",
    },
    {
      title: "Win Rate",
      value: `${kpi.winRate}%`,
      description: "Deals won vs total closed",
      icon: IconTarget,
      color: "text-green-600",
    },
    {
      title: "Active Deals",
      value: kpi.activeDeals,
      description: "Deals in pipeline",
      icon: IconSparkles,
      color: "text-orange-600",
    },
    {
      title: "New Leads",
      value: kpi.newLeads,
      description: "Added this week",
      icon: IconUsers,
      color: "text-indigo-600",
    },
  ];

  const getActiveTab = () => {
    if (pathname === "/admin/crm") return "dashboard";
    if (pathname?.startsWith("/admin/crm/leads")) return "leads";
    if (pathname?.startsWith("/admin/crm/deals")) return "deals";
    if (pathname?.startsWith("/admin/crm/pipeline")) return "pipeline";
    return "dashboard";
  };

  const tabs = [
    { value: "dashboard", label: "Dashboard", href: "/admin/crm" },
    { value: "leads", label: "Leads", href: "/admin/crm/leads" },
    { value: "deals", label: "Deals", href: "/admin/crm/deals" },
    { value: "pipeline", label: "Pipeline", href: "/admin/crm/pipeline" },
  ];

  return (
    <div className="flex flex-col w-full">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">CRM</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your sales pipeline, leads, and customer relationships
            </p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {kpiCards.map((kpi) => (
            <Card key={kpi.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{kpi.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{kpi.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={getActiveTab()}>
          <TabsList className="w-full justify-start">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} asChild>
                <Link href={tab.href} prefetch>
                  {tab.label}
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
