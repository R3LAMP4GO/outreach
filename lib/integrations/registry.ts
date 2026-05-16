import "server-only";

/**
 * Integrations registry.
 *
 * Single source of truth for which third-party services and infrastructure
 * credentials this app expects. The Settings → Integrations page reads from
 * this registry and reports configured/missing status — values themselves
 * are NEVER read or returned, only their presence is checked.
 *
 * Per CLAUDE.md: "All credentials configured via environment variables
 * (no database storage)". This module is a status mirror, not a store.
 */

export type IntegrationCategory =
  | "ai"
  | "email"
  | "calls"
  | "video"
  | "booking"
  | "infrastructure"
  | "internal-secrets"
  | "hosting";

export interface IntegrationEnvVar {
  /** Env var name (matches process.env key exactly). */
  name: string;
  /** When true, the integration is broken without this var. */
  required: boolean;
  /** When true, this var is a secret value (never log or echo). */
  secret: boolean;
}

export interface IntegrationDefinition {
  id: string;
  name: string;
  category: IntegrationCategory;
  /** One-sentence description of what the integration powers. */
  description: string;
  /** Tabler icon component name (rendered client-side). */
  icon: string;
  /** When true, the app cannot function without this integration. */
  required: boolean;
  envVars: IntegrationEnvVar[];
  /** If present, the Test button calls the test runner with this id. */
  testable: boolean;
  /** Public URL to obtain credentials. */
  docsUrl?: string;
}

export const INTEGRATIONS: IntegrationDefinition[] = [
  // ─── AI ────────────────────────────────────────────────────────────────────
  {
    id: "openai",
    name: "OpenAI",
    category: "ai",
    description:
      "Newsletter generation, reply analysis, and call extraction. Models defined in lib/ai/models.ts.",
    icon: "robot",
    required: true,
    envVars: [{ name: "OPENAI_API_KEY", required: true, secret: true }],
    testable: true,
    docsUrl: "https://platform.openai.com/api-keys",
  },

  // ─── Email ─────────────────────────────────────────────────────────────────
  {
    id: "resend",
    name: "Resend",
    category: "email",
    description: "Sends outreach campaigns, newsletter blasts, and admin notification emails.",
    icon: "mail",
    required: true,
    envVars: [
      { name: "RESEND_API_KEY", required: true, secret: true },
      { name: "RESEND_WEBHOOK_SECRET", required: true, secret: true },
      { name: "DEFAULT_FROM_EMAIL", required: true, secret: false },
      { name: "NEWSLETTER_FROM_EMAIL", required: true, secret: false },
    ],
    testable: true,
    docsUrl: "https://resend.com/api-keys",
  },

  // ─── Calls & SMS ───────────────────────────────────────────────────────────
  {
    id: "quo",
    name: "Quo (OpenPhone)",
    category: "calls",
    description: "Outbound SMS, call metadata, and transcripts for the prospecting pipeline.",
    icon: "phone",
    required: false,
    envVars: [
      { name: "QUO_API_KEY", required: true, secret: true },
      { name: "QUO_WEBHOOK_SECRET", required: true, secret: true },
      { name: "QUO_PHONE_NUMBER", required: true, secret: false },
    ],
    testable: true,
    docsUrl: "https://www.openphone.com/docs/api-reference/authentication",
  },

  // ─── Video ─────────────────────────────────────────────────────────────────
  {
    id: "cap",
    name: "Cap",
    category: "video",
    description: "Polls Cap viewer analytics for prospecting follow-ups. See lib/cap/README.md.",
    icon: "video",
    required: false,
    envVars: [{ name: "CAP_API_KEY", required: true, secret: true }],
    testable: false,
    docsUrl: "https://cap.so/dashboard/developers",
  },

  // ─── Booking ───────────────────────────────────────────────────────────────
  {
    id: "calcom",
    name: "Cal.com",
    category: "booking",
    description: "Webhook signature verification for booking → deal-stage promotion.",
    icon: "calendar",
    required: false,
    envVars: [{ name: "CAL_WEBHOOK_SECRET", required: true, secret: true }],
    testable: false,
    docsUrl: "https://cal.com/docs/core-features/webhooks",
  },

  // ─── Infrastructure ────────────────────────────────────────────────────────
  {
    id: "database",
    name: "PostgreSQL Database",
    category: "infrastructure",
    description: "Drizzle ORM client. Backs the app and the pg-boss job queue.",
    icon: "database",
    required: true,
    envVars: [{ name: "DATABASE_URL", required: true, secret: true }],
    testable: true,
  },
  {
    id: "storage",
    name: "Object Storage",
    category: "infrastructure",
    description:
      "S3-compatible bucket (MinIO local / Railway Bucket via Tigris in prod) for avatars and logos.",
    icon: "cloud-upload",
    required: true,
    envVars: [
      { name: "BUCKET_ENDPOINT", required: true, secret: false },
      { name: "BUCKET_REGION", required: false, secret: false },
      { name: "BUCKET_MEDIA_NAME", required: false, secret: false },
      { name: "BUCKET_MEDIA_ACCESS_KEY_ID", required: true, secret: true },
      { name: "BUCKET_MEDIA_SECRET_ACCESS_KEY", required: true, secret: true },
    ],
    testable: true,
  },
  {
    id: "auth",
    name: "NextAuth",
    category: "infrastructure",
    description: "Session signing and cookie domain configuration.",
    icon: "shield-lock",
    required: true,
    envVars: [
      { name: "AUTH_SECRET", required: false, secret: true },
      { name: "NEXTAUTH_SECRET", required: false, secret: true },
      { name: "NEXTAUTH_URL", required: true, secret: false },
    ],
    testable: false,
  },
  {
    id: "encryption",
    name: "Credential Encryption Key",
    category: "infrastructure",
    description:
      "AES-256-GCM key for encrypting per-user TOTP secrets. Generate with: openssl rand -hex 32.",
    icon: "key",
    required: true,
    envVars: [{ name: "INTEGRATION_ENCRYPTION_KEY", required: true, secret: true }],
    testable: true,
  },

  // ─── Internal Secrets ──────────────────────────────────────────────────────
  {
    id: "internal-secrets",
    name: "Internal API Secrets",
    category: "internal-secrets",
    description:
      "Bearer tokens for internal endpoints (N8N imports, cron jobs, unsubscribe links).",
    icon: "lock",
    required: false,
    envVars: [
      { name: "OUTREACH_API_KEY", required: false, secret: true },
      { name: "OUTREACH_CRON_SECRET", required: false, secret: true },
      { name: "NEWSLETTER_API_KEY", required: false, secret: true },
      { name: "UNSUBSCRIBE_SECRET", required: true, secret: true },
      { name: "CRON_SECRET", required: false, secret: true },
    ],
    testable: false,
  },

  // ─── Hosting ───────────────────────────────────────────────────────────────
  {
    id: "railway",
    name: "Railway",
    category: "hosting",
    description:
      "Deploy target. Env vars on this page live in Railway's Variables UI — open it to add or rotate them.",
    icon: "cloud",
    required: false,
    envVars: [],
    testable: false,
    docsUrl: "https://railway.app/dashboard",
  },
];

export interface IntegrationStatus {
  id: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  icon: string;
  required: boolean;
  /** True when all required env vars for this integration are set. */
  configured: boolean;
  envVars: Array<{ name: string; required: boolean; secret: boolean; configured: boolean }>;
  testable: boolean;
  docsUrl?: string;
}

/**
 * Snapshot the configured state of every integration. Server-only — reads
 * process.env directly. Returns booleans, NOT the values themselves.
 */
export function getIntegrationStatuses(): IntegrationStatus[] {
  return INTEGRATIONS.map((def) => {
    const envVars = def.envVars.map((v) => ({
      name: v.name,
      required: v.required,
      secret: v.secret,
      configured: Boolean(process.env[v.name]?.trim()),
    }));

    // An integration counts as "configured" when every required env var is
    // present. Integrations with no env vars (e.g. Railway) report configured
    // = true — the entry exists for documentation / deep-linking only.
    const requiredVars = envVars.filter((v) => v.required);
    const configured = requiredVars.length === 0 || requiredVars.every((v) => v.configured);

    return {
      id: def.id,
      name: def.name,
      category: def.category,
      description: def.description,
      icon: def.icon,
      required: def.required,
      configured,
      envVars,
      testable: def.testable,
      docsUrl: def.docsUrl,
    };
  });
}

export function getIntegrationById(id: string): IntegrationDefinition | undefined {
  return INTEGRATIONS.find((i) => i.id === id);
}
