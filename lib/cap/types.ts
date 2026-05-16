/**
 * Zod schemas for the Cap (cap.so, open-source Loom alternative) REST API.
 *
 * Reference (researched 2026-05-15):
 *   - https://cap.so/docs/api/rest-api  — official REST API docs
 *   - https://cap.so/docs/sharing/analytics  — what Cap exposes about analytics
 *   - https://cap.so/docs/api/webhooks  — "coming soon", no webhook events yet
 *   - github.com/CapSoftware/Cap  — source of truth for wire shapes
 *     - apps/web/app/api/developer/v1/[...route]/videos.ts  — REST handlers
 *     - apps/web/app/api/utils.ts  — `withDeveloperSecretAuth` middleware
 *     - apps/web/actions/videos/get-analytics.ts  — server-only Tinybird query
 *
 * ─── Public REST API surface ─────────────────────────────────────────────────
 *   GET    /api/developer/v1/videos              list (filter by externalUserId)
 *   GET    /api/developer/v1/videos/:id          single video
 *   GET    /api/developer/v1/videos/:id/status   processing status
 *   DELETE /api/developer/v1/videos/:id          soft-delete
 *   GET    /api/developer/v1/usage               credit balance + aggregates
 *
 *   Auth: `Authorization: Bearer csk_<secret-key>`
 *
 * ─── What ISN'T exposed publicly ─────────────────────────────────────────────
 * Cap has NO public analytics endpoint. The internal analytics flow is:
 *   - `/api/dashboard/analytics`  — session-cookie gated, NOT API-key.
 *   - `getVideoAnalytics(videoId)` — server-only action that queries Tinybird
 *     directly. Returns only `{ count: number }` (total views). No per-viewer
 *     records, no IPs, no countries, no watch percent, no completion rate.
 *
 * The Cap analytics docs explicitly state: "Individual viewer identification
 * is not provided for general share links." Cap collects only aggregate view
 * counts + unique session counts.
 *
 * Therefore `CapVideoAnalytics` below is the shape the outreach app WANTS
 * (matches the task spec), but the most we can ever populate from Cap is
 * `totalViews` and `uniqueViewers`. The `views: []` array, `avgWatchPercent`,
 * and `completionRate` will always be empty/null until either:
 *   (a) Cap ships a public per-view analytics endpoint, OR
 *   (b) the user self-hosts Cap and we query their Tinybird directly.
 *
 * Only the fields we actually consume are required. Zod silently drops
 * everything else the API ships.
 */

import { z } from "zod";

// ─── Video (REST API: GET /developer/v1/videos/:id) ──────────────────────────
// Documented wire shape (verbatim from cap.so/docs/api/rest-api):
//   {
//     id, appId, externalUserId, name, duration, width, height, fps,
//     s3Key, transcriptionStatus, metadata, deletedAt, createdAt, updatedAt
//   }
// We transform to the slimmer CapVideo shape the outreach app actually uses.
// `shareUrl` is reconstructed because the wire payload doesn't include it
// (Cap builds it as `<base>/dev/<videoId>` for SDK-created videos; we use
// `<base>/s/<videoId>` to match the share/embed URLs the docs show).

export const capDeveloperVideoRawSchema = z.object({
  id: z.string(),
  appId: z.string().nullable().optional(),
  externalUserId: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  duration: z.number().nullable().optional(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  fps: z.number().int().nullable().optional(),
  s3Key: z.string().nullable().optional(),
  transcriptionStatus: z
    .enum(["PROCESSING", "COMPLETE", "ERROR", "SKIPPED", "NO_AUDIO"])
    .nullable()
    .optional(),
  metadata: z.unknown().nullable().optional(),
  deletedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().nullable().optional(),
});

export type CapDeveloperVideoRaw = z.infer<typeof capDeveloperVideoRawSchema>;

/**
 * The flattened CapVideo shape consumed by the outreach app.
 *
 * `ownerId` maps to Cap's `externalUserId` because the public REST API never
 * exposes the real Cap user id — only the external id you supplied when the
 * video was created through the SDK.
 */
export const capVideoSchema = z.object({
  id: z.string(),
  title: z.string(),
  shareUrl: z.string().url(),
  createdAt: z.string(),
  ownerId: z.string().nullable(),
});

export type CapVideo = z.infer<typeof capVideoSchema>;

// ─── Analytics (NO public endpoint — see file header) ────────────────────────
// Shape requested by the task spec. All per-view fields are best-effort:
// Cap does not expose them through any documented endpoint. Implementations
// that can only return totals MUST populate `totalViews` and leave the rest
// at their zero/null defaults so callers don't see fake data.

const capVideoViewSchema = z.object({
  viewerIp: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  watchedAt: z.string(),
  /** Seconds the viewer actually watched. */
  watchDurationSeconds: z.number().nonnegative(),
  /** 0-1 range. Cap does NOT publish this anywhere — left for future use. */
  watchPercent: z.number().min(0).max(1),
});

export type CapVideoView = z.infer<typeof capVideoViewSchema>;

export const capVideoAnalyticsSchema = z.object({
  videoId: z.string(),
  totalViews: z.number().int().nonnegative(),
  uniqueViewers: z.number().int().nonnegative(),
  /** 0-1 range. Null until Cap exposes per-view data. */
  avgWatchPercent: z.number().min(0).max(1).nullable(),
  /** 0-1 range. Null until Cap exposes per-view data. */
  completionRate: z.number().min(0).max(1).nullable(),
  /** Empty until Cap exposes per-view records or you self-host + query Tinybird. */
  views: z.array(capVideoViewSchema),
});

export type CapVideoAnalytics = z.infer<typeof capVideoAnalyticsSchema>;

// ─── Error envelope ──────────────────────────────────────────────────────────
// Cap REST returns `{ error: string }` on every non-2xx (docs verbatim, also
// confirmed in apps/web/app/api/developer/v1/[...route]/videos.ts).

export const capErrorSchema = z
  .object({
    error: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

export type CapErrorBody = z.infer<typeof capErrorSchema>;
