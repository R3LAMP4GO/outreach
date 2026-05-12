import { getCrmMetrics } from "@/lib/crm/metrics";
import { CRMLayoutShell } from "./crm-layout-shell";

export interface CRMLayoutProps {
  children: React.ReactNode;
}

export default async function CRMLayout({ children }: CRMLayoutProps) {
  const metrics = await getCrmMetrics();

  return (
    <CRMLayoutShell
      kpi={{
        pipelineValue: metrics.pipelineValue,
        winRate: metrics.winRate,
        salesCycle: metrics.avgSalesCycle,
        activeDeals: metrics.activeDeals,
        newLeads: metrics.newLeads,
      }}
    >
      {children}
    </CRMLayoutShell>
  );
}
