"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IconAlertTriangle,
  IconCalendar,
  IconCheck,
  IconCircleDashed,
  IconCloud,
  IconCloudUpload,
  IconDatabase,
  IconExternalLink,
  IconKey,
  IconLoader2,
  IconLock,
  IconMail,
  IconPhone,
  IconPlayerPlay,
  IconRobot,
  IconShieldLock,
  IconVideo,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { Badge } from "@/components/shadcn/ui/badge";
import { Button } from "@/components/shadcn/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/ui/card";
import { Separator } from "@/components/shadcn/ui/separator";
import { Skeleton } from "@/components/shadcn/ui/skeleton";
import { cn } from "@/lib/utils";

interface IntegrationStatus {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  required: boolean;
  configured: boolean;
  envVars: Array<{ name: string; required: boolean; secret: boolean; configured: boolean }>;
  testable: boolean;
  docsUrl?: string;
}

type TestState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; message: string; durationMs: number; at: number }
  | { status: "fail"; message: string; durationMs: number; at: number };

const CATEGORY_LABELS: Record<string, string> = {
  ai: "AI & Content",
  email: "Email",
  calls: "Calls & SMS",
  video: "Video",
  booking: "Booking",
  infrastructure: "Infrastructure",
  "internal-secrets": "Internal Secrets",
  hosting: "Hosting",
};

const CATEGORY_ORDER = [
  "ai",
  "email",
  "calls",
  "video",
  "booking",
  "infrastructure",
  "internal-secrets",
  "hosting",
];

function IntegrationIcon({ name, className }: { name: string; className?: string }) {
  switch (name) {
    case "robot":
      return <IconRobot className={className} />;
    case "mail":
      return <IconMail className={className} />;
    case "phone":
      return <IconPhone className={className} />;
    case "video":
      return <IconVideo className={className} />;
    case "calendar":
      return <IconCalendar className={className} />;
    case "database":
      return <IconDatabase className={className} />;
    case "cloud-upload":
      return <IconCloudUpload className={className} />;
    case "cloud":
      return <IconCloud className={className} />;
    case "shield-lock":
      return <IconShieldLock className={className} />;
    case "lock":
      return <IconLock className={className} />;
    default:
      return <IconKey className={className} />;
  }
}

export function IntegrationsList() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testState, setTestState] = useState<Record<string, TestState>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/integrations");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Failed to load (HTTP ${res.status})`);
        return;
      }
      const body = (await res.json()) as { integrations: IntegrationStatus[] };
      setIntegrations(body.integrations);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runTest = useCallback(async (id: string) => {
    setTestState((prev) => ({ ...prev, [id]: { status: "running" } }));
    try {
      const res = await fetch("/api/admin/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = body.error ?? `Request failed (HTTP ${res.status})`;
        setTestState((prev) => ({
          ...prev,
          [id]: { status: "fail", message, durationMs: 0, at: Date.now() },
        }));
        toast.error(message);
        return;
      }
      const next: TestState = body.ok
        ? {
            status: "ok",
            message: body.message ?? "OK",
            durationMs: body.durationMs ?? 0,
            at: Date.now(),
          }
        : {
            status: "fail",
            message: body.message ?? "Test failed.",
            durationMs: body.durationMs ?? 0,
            at: Date.now(),
          };
      setTestState((prev) => ({ ...prev, [id]: next }));
      if (body.ok) toast.success(`${id}: ${body.message}`);
      else toast.error(`${id}: ${body.message}`);
    } catch (err) {
      const message = (err as Error).message;
      setTestState((prev) => ({
        ...prev,
        [id]: { status: "fail", message, durationMs: 0, at: Date.now() },
      }));
      toast.error(message);
    }
  }, []);

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <IconAlertTriangle className="size-4" />
            <p className="text-sm">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!integrations) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat] ?? cat,
    items: integrations.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6 max-w-3xl">
      <CredentialsBanner />

      {grouped.map((group) => (
        <section key={group.category} className="space-y-3">
          <h3 className="text-lg font-semibold text-foreground">{group.label}</h3>
          <div className="space-y-3">
            {group.items.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                testState={testState[integration.id] ?? { status: "idle" }}
                onTest={() => runTest(integration.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function CredentialsBanner() {
  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <IconShieldLock className="size-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-foreground">
              Credentials live in Railway, not here
            </p>
            <p className="text-sm text-muted-foreground">
              This page reports which integrations are configured by reading the server's
              environment variables. Values are never stored, displayed, or editable from this UI.
              To add or rotate a key, open the corresponding service's Variables tab in Railway,
              then redeploy.
            </p>
            <Button asChild variant="outline" size="sm" className="shadow-sm gap-2">
              <a href="https://railway.app/dashboard" target="_blank" rel="noopener noreferrer">
                <IconExternalLink className="size-4" />
                Open Railway Dashboard
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function IntegrationCard({
  integration,
  testState,
  onTest,
}: {
  integration: IntegrationStatus;
  testState: TestState;
  onTest: () => void;
}) {
  const missingRequired = integration.envVars.filter((v) => v.required && !v.configured);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={cn(
                "size-9 rounded-lg flex items-center justify-center shrink-0",
                integration.configured
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <IntegrationIcon name={integration.icon} className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                {integration.name}
                <StatusBadge configured={integration.configured} required={integration.required} />
              </CardTitle>
              <CardDescription className="mt-1">{integration.description}</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {integration.envVars.length > 0 && (
          <div className="space-y-1.5">
            {integration.envVars.map((v) => (
              <div key={v.name} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  {v.configured ? (
                    <IconCheck className="size-3.5 text-emerald-600 shrink-0" />
                  ) : v.required ? (
                    <IconX className="size-3.5 text-destructive shrink-0" />
                  ) : (
                    <IconCircleDashed className="size-3.5 text-muted-foreground shrink-0" />
                  )}
                  <code className="font-mono text-xs text-foreground truncate">{v.name}</code>
                </div>
                <span
                  className={cn(
                    "text-xs shrink-0",
                    v.configured
                      ? "text-emerald-600"
                      : v.required
                        ? "text-destructive"
                        : "text-muted-foreground",
                  )}
                >
                  {v.configured ? "set" : v.required ? "missing" : "optional"}
                </span>
              </div>
            ))}
          </div>
        )}

        {missingRequired.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 rounded-md p-2.5">
            <IconAlertTriangle className="size-3.5 mt-0.5 shrink-0" />
            <p>
              {missingRequired.length} required env var{missingRequired.length === 1 ? "" : "s"}{" "}
              missing. Set in Railway and redeploy.
            </p>
          </div>
        )}

        {testState.status === "ok" && (
          <div className="flex items-start gap-2 text-xs text-emerald-700 bg-emerald-500/10 rounded-md p-2.5">
            <IconCheck className="size-3.5 mt-0.5 shrink-0" />
            <p>
              {testState.message}{" "}
              <span className="text-emerald-700/70">({testState.durationMs}ms)</span>
            </p>
          </div>
        )}
        {testState.status === "fail" && (
          <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 rounded-md p-2.5">
            <IconAlertTriangle className="size-3.5 mt-0.5 shrink-0" />
            <p>{testState.message}</p>
          </div>
        )}

        {(integration.testable || integration.docsUrl) && (
          <>
            <Separator />
            <div className="flex flex-wrap items-center gap-2">
              {integration.testable && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onTest}
                  disabled={testState.status === "running" || !integration.configured}
                  className="gap-2 shadow-sm"
                >
                  {testState.status === "running" ? (
                    <IconLoader2 className="size-4 animate-spin" />
                  ) : (
                    <IconPlayerPlay className="size-4" />
                  )}
                  Test Connection
                </Button>
              )}
              {integration.docsUrl && (
                <Button asChild variant="ghost" size="sm" className="gap-2">
                  <a href={integration.docsUrl} target="_blank" rel="noopener noreferrer">
                    <IconExternalLink className="size-4" />
                    Docs
                  </a>
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ configured, required }: { configured: boolean; required: boolean }) {
  if (configured) {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 text-xs font-medium"
      >
        Connected
      </Badge>
    );
  }
  if (required) {
    return (
      <Badge
        variant="outline"
        className="border-destructive/30 bg-destructive/10 text-destructive text-xs font-medium"
      >
        Not configured
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs font-medium text-muted-foreground">
      Optional
    </Badge>
  );
}
