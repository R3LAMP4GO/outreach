import { AppSidebar } from "@/components/shadcn/app-sidebar";
import { SiteHeader } from "@/components/shadcn/site-header";
import { SidebarInset, SidebarProvider } from "@/components/shadcn/ui/sidebar";
import { SessionTimeout } from "@/components/admin/SessionTimeout";
import { AdminHeaderTitle } from "@/components/admin/CampaignBackButton";
import { SiteSettingsProvider } from "@/lib/site-settings-context";
import { SkinApplier } from "@/components/admin/SkinApplier";

export interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminDashboardLayout({ children }: AdminLayoutProps) {
  return (
    <SiteSettingsProvider>
      <SkinApplier />
      <SidebarProvider
        suppressHydrationWarning
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" />
        <SidebarInset className="min-w-0 overflow-x-hidden">
          <SiteHeader title={<AdminHeaderTitle />} />
          <div className="flex flex-1 flex-col min-w-0 overflow-x-hidden">{children}</div>
        </SidebarInset>
        <SessionTimeout />
      </SidebarProvider>
    </SiteSettingsProvider>
  );
}
