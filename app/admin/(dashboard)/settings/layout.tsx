import { SettingsSidebar } from "@/components/settings/settings-sidebar";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="space-y-6 px-4 py-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your admin dashboard and site settings
        </p>
      </div>
      <div className="flex flex-col gap-6 lg:flex-row">
        <SettingsSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </main>
  );
}
