/**
 * Cap (cap.so, open-source Loom alternative) REST client.
 *
 * Server-only. Wraps the documented public REST API at `/api/developer/v1`:
 *   https://cap.so/docs/api/rest-api
 *
 * Auth: `Authorization: Bearer csk_<secret-key>` (developer secret key).
 *
 * ─── Scope & limitations (READ THIS) ─────────────────────────────────────────
 *
 * 1. The Cap public REST API only returns videos CREATED VIA THE DEVELOPER
 *    SDK (i.e. videos posted to `/api/developer/sdk/v1/videos/create` using a
 *    matching `cpk_` public key from the same Cap "developer app"). It does
 *    NOT return videos recorded through the standard Cap desktop/web app.
 *    Calling `getVideo(id)` for a desktop-recorded video returns 404 — which
 *    this client surfaces as `null`.
 *
 * 2. Cap has NO public analytics endpoint. `getVideoAnalytics` therefore
 *    THROWS by default — it doesn't fake a response. See the function jsdoc
 *    and `outreach/lib/cap/README.md` for the workarounds.
 *
 * 3. Webhooks for view events are "coming soon" per Cap's docs — not
 *    available yet. Polling is the only mechanism today.
 *
 * Reference (researched 2026-05-15):
 *   - https://cap.so/docs/api/rest-api
 *   - github.com/CapSoftware/Cap @ 0d082e0:
 *     - apps/web/app/api/developer/v1/[...route]/route.ts
 *     - apps/web/app/api/developer/v1/[...route]/videos.ts
 *     - apps/web/app/api/utils.ts (withDeveloperSecretAuth middleware)
 *     - apps/web/actions/videos/get-analytics.ts (internal Tinybird query)
 */

import "server-only";

import { z } from "zod";

import {
  capDeveloperVideoRawSchema,
  type CapErrorBody,
  capErrorSchema,
  type CapVideo,
  type CapVideoAnalytics,
} from "./types";
import { extractCapVideoId } from "./parse-url";

// Re-export the pure URL parser so callers already importing it from this
// module keep working. The actual implementation now lives in `./parse-url`
// (no `server-only`) so client components can import it directly.
export { extractCapVideoId };

// ─── Config ──────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = "https://cap.so/api";

function getApiKey(): string {
  const key = process.env.CAP_API_KEY;
  if (!key) {
    throw new Error(
      "CAP_API_KEY is not set. Add it to .env.local (see .env.example). " +
        "Generate one at https://cap.so/dashboard/developers — use the secret " +
        "key prefixed `csk_`.",
    );
  }
  return key;
}

function getBaseUrl(): string {
  return (process.env.CAP_API_BASE ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

// ─── Error class ─────────────────────────────────────────────────────────────

export class CapApiError extends Error {
  readonly status: number;
  readonly body: CapErrorBody | string | null;

  constructor(status: number, body: CapErrorBody | string | null, message?: string) {
    const fromBody = body && typeof body === "object" ? (body.error ?? body.message) : null;
    super(message ?? fromBody ?? `Cap API request failed with status ${status}`);
    this.name = "CapApiError";
    this.status = status;
    this.body = body;
  }
}

// ─── Core fetch helper ───────────────────────────────────────────────────────

interface CapFetchOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
}

/**
 * Low-level Cap REST fetch.
 *
 * - Reads `CAP_API_KEY` (required) and `CAP_API_BASE` (default
 *   `https://cap.so/api`).
 * - Sets `Authorization: Bearer <CAP_API_KEY>` (the documented header).
 * - Returns `{ status: 404, data: null }` on 404 so callers can short-circuit.
 * - Throws `CapApiError` on any other non-2xx.
 *
 * `path` is appended to the base URL verbatim — pass it with the leading
 * slash, e.g. `/developer/v1/videos/abc123`.
 */
async function capFetch<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  opts: CapFetchOptions = {},
): Promise<{ status: number; data: z.infer<T> | null }> {
  const url = `${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  };

  const response = await fetch(url, init);

  if (response.status === 404) {
    return { status: 404, data: null };
  }

  if (!response.ok) {
    const parsed = await parseErrorBody(response);
    throw new CapApiError(response.status, parsed);
  }

  const text = await response.text();
  if (!text) {
    return { status: response.status, data: null };
  }

  const json = JSON.parse(text) as unknown;
  const data = schema.parse(json) as z.infer<T>;
  return { status: response.status, data };
}

async function parseErrorBody(response: Response): Promise<CapErrorBody | string | null> {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    const json = JSON.parse(text) as unknown;
    const parsed = capErrorSchema.safeParse(json);
    if (parsed.success) return parsed.data;
    return text;
  } catch {
    return text;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch a single video's metadata.
 *
 * Returns `null` if Cap returns 404 — common when the video was recorded
 * via the desktop/web app (not via the developer SDK) or the id is wrong.
 *
 * Wire endpoint: `GET /api/developer/v1/videos/:id`
 * Documented at: https://cap.so/docs/api/rest-api#get-video
 */
export async function getVideo(capVideoId: string): Promise<CapVideo | null> {
  const envelope = z.object({ data: capDeveloperVideoRawSchema });
  const { data } = await capFetch(
    `/developer/v1/videos/${encodeURIComponent(capVideoId)}`,
    envelope,
  );
  if (!data) return null;

  const raw = data.data;
  return {
    id: raw.id,
    title: raw.name ?? "Untitled",
    // Cap's docs return `shareUrl: https://cap.so/dev/<id>` from the SDK
    // create endpoint, but the GET /videos/:id payload does NOT include the
    // share URL. Reconstruct it from the base host (drop trailing `/api`)
    // using the public `/s/<id>` form that the share-page docs show.
    shareUrl: buildShareUrl(raw.id),
    createdAt: raw.createdAt,
    ownerId: raw.externalUserId ?? null,
  };
}

/**
 * Fetch view analytics for a Cap video.
 *
 * ⚠️ NOT IMPLEMENTED — Cap has no public analytics endpoint.
 *
 * The internal `/api/dashboard/analytics` route is session-cookie gated
 * (verified against apps/web/app/api/dashboard/analytics/route.ts) and the
 * only programmatic analytics path is the server-side `getVideoAnalytics`
 * server action that queries Tinybird directly — both inaccessible to an
 * external client with only a `csk_` developer key.
 *
 * Workarounds documented in `outreach/lib/cap/README.md`:
 *   1. Self-host Cap and query its Tinybird directly.
 *   2. Manually update `lastViewedAt` on the prospect from a webhook once
 *      Cap ships them (currently "coming soon" per their docs).
 *   3. Scrape the `/s/<id>` share page meta tags — fragile, no per-view data.
 *
 * Function is intentionally left as a clear failure so a caller wiring this
 * up gets a loud error instead of an empty result. Replace with a real
 * implementation when Cap adds an endpoint that returns the shape declared
 * in `types.ts > CapVideoAnalytics`.
 */
export async function getVideoAnalytics(capVideoId: string): Promise<CapVideoAnalytics | null> {
  // TODO(cap-analytics): replace with a real call once Cap ships a public
  // analytics endpoint. The shape we want lives in `types.ts`. Until then,
  // throw rather than fabricate. See `outreach/lib/cap/README.md`.
  void capVideoId;
  throw new CapApiError(
    501,
    null,
    "Cap has no public analytics endpoint. See outreach/lib/cap/README.md " +
      "for the gap analysis and the manual `lastViewedAt` fallback.",
  );
}

function buildShareUrl(videoId: string): string {
  const customDomain = process.env.CAP_CUSTOM_DOMAIN?.trim();
  if (customDomain) {
    const host = customDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return `https://${host}/s/${videoId}`;
  }
  // Use the public site host derived from CAP_API_BASE — strip trailing `/api`
  // so `https://cap.so/api` -> `https://cap.so`.
  const baseHost = getBaseUrl().replace(/\/api$/, "");
  return `${baseHost}/s/${videoId}`;
}
