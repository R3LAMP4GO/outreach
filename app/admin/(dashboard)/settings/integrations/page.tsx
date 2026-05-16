import { IntegrationsList } from "@/components/settings/integrations-list";

export const dynamic = "force-dynamic";

export default function IntegrationsSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Integrations</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Status of every third-party service this app talks to. Values stay in Railway — this page
          only reports whether each one is configured.
        </p>
      </div>
      <IntegrationsList />
    </div>
  );
}
