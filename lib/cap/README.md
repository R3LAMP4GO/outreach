# Cap (cap.so) Client

Server-only TypeScript client for [Cap](https://cap.so) — the open-source Loom alternative. Used by the outreach app to attach Cap recording metadata to prospects and (eventually) poll view analytics.

## TL;DR — what works, what doesn't

| Capability | Status | Notes |
|---|---|---|
| `extractCapVideoId(shareUrl)` | ✅ Works | Pure URL parsing — handles `/s/`, `/v/`, `/embed/`, `/dev/`, custom domains. |
| `getVideo(id)` | ⚠️ Works **only for SDK-created videos** | Calls the documented REST endpoint. Returns `null` for desktop/web-recorded videos. |
| `getVideoAnalytics(id)` | ❌ **Not implemented** — throws `CapApiError` (501) | No public analytics endpoint exists. See "The analytics gap" below. |
| Webhooks for view events | ❌ Not yet available | Cap's docs flag webhooks as "coming soon". |

## Endpoints used

### Documented (stable)

- **`GET /api/developer/v1/videos/:id`** — single video metadata.
  Source: [`apps/web/app/api/developer/v1/[...route]/videos.ts`](https://github.com/CapSoftware/Cap/blob/main/apps/web/app/api/developer/v1/%5B...route%5D/videos.ts), docs: <https://cap.so/docs/api/rest-api>.

That is the **only** Cap REST endpoint this client touches today. The other documented endpoints (`/videos`, `/videos/:id/status`, `/videos/:id`, `DELETE /videos/:id`, `/usage`) aren't wired up yet — add them when a caller actually needs them.

### Not used (and why)

- **`GET /api/dashboard/analytics`** — session-cookie gated (`getCurrentUser()` from `@cap/database/auth/session`). No API-key support. Confirmed by inspecting [`apps/web/app/api/dashboard/analytics/route.ts`](https://github.com/CapSoftware/Cap/blob/main/apps/web/app/api/dashboard/analytics/route.ts). Cannot be called from a server-to-server context with a developer secret key.
- **`getVideoAnalytics(videoId)`** (server action) — Tinybird query baked into Cap's own server. Not exposed over HTTP. Source: [`apps/web/actions/videos/get-analytics.ts`](https://github.com/CapSoftware/Cap/blob/main/apps/web/actions/videos/get-analytics.ts).

## Auth

`Authorization: Bearer csk_<secret-key>`. Verified against:
- Cap docs: <https://cap.so/docs/api/rest-api#authentication>
- Source: [`withDeveloperSecretAuth` in `apps/web/app/api/utils.ts`](https://github.com/CapSoftware/Cap/blob/main/apps/web/app/api/utils.ts) — middleware checks `authorization` header for the `csk_` prefix, hashes it, and looks up `developer_api_keys.keyHash`.

Generate a `csk_` key at <https://cap.so/dashboard/developers> → Create App → copy the **Secret key**. Cap also issues a `cpk_` public key for the SDK API — we don't use that one.

## Scope limitation: "developer app" videos only

Cap has two completely separate video tables in production:

1. **`videos`** — created by the desktop/web recorder under a real user account. This is what 99% of Cap users have. **Not accessible via the public REST API.** No documented endpoint exposes these to an external client.

2. **`developer_videos`** — created via `POST /api/developer/sdk/v1/videos/create` using a `cpk_` public key. The public REST API (`/api/developer/v1/videos/:id`) returns **only these**. Source: [`developerVideos` table in `packages/database/schema.ts`](https://github.com/CapSoftware/Cap/blob/main/packages/database/schema.ts) and the handler in [`videos.ts`](https://github.com/CapSoftware/Cap/blob/main/apps/web/app/api/developer/v1/%5B...route%5D/videos.ts) which filters on `appId`.

**Implication:** if your team records on the regular Cap desktop app, `getVideo(id)` will return `null` (404) — there is currently no way to fetch its metadata through Cap's public API. To use this integration today the recording must be created via the SDK.

## The analytics gap

The task spec asks for a per-view analytics payload (`viewerIp`, `country`, `watchedAt`, `watchDurationSeconds`, `watchPercent`, plus aggregate `totalViews`, `uniqueViewers`, `avgWatchPercent`, `completionRate`).

After reading the Cap source at commit `0d082e0` and the docs, **none of that data is exposed through any public API**. Specifically:

1. Cap's docs explicitly state: ["Individual viewer identification is not provided for general share links."](https://cap.so/docs/sharing/analytics) Cap shows only **View Count** and **Unique Views** in its own dashboard.
2. The internal `getVideoAnalytics(videoId)` server action returns `{ count: number }` — that's the entire payload, no per-view records.
3. There is no `watchPercent` / `completionRate` field anywhere in Cap's source. Cap's beacon (`apps/web/app/s/[videoId]/Share.tsx` → `POST /api/analytics/track`) records `page_hit` events with session id, country, browser, and screen size — but **not** playback progress.

So `getVideoAnalytics()` in this client throws a `CapApiError` (status 501) with a clear pointer back to this README. It does not fabricate a response.

### Fallback plan

When polling fails (which it always will today), the outreach UI must support a **manual `lastViewedAt` override**:

- Surface an editable `lastViewedAt` field on each prospect's Cap recording row.
- The admin sets it by hand after observing a real view (Slack ping, email reply, in-person mention, etc.).
- When/if Cap ships either (a) webhooks for view events, or (b) a per-view analytics endpoint, swap the manual field for the polled value.

### Other options (not implemented)

1. **Self-host Cap and query Tinybird directly.** Cap's self-hosting docs cover S3 + Postgres but mention Tinybird as a separate concern. If the outreach team controls the Cap deployment, you can run the same SQL `getVideoAnalytics` runs internally. Adds significant ops burden — only worth it if analytics become critical.
2. **Scrape the `/s/<id>` share page.** Fragile. The HTML is server-rendered with a view counter in the markup, but Cap reserves the right to change that at any time, and you still won't get per-view records. Avoid.
3. **Wait for Cap webhooks.** Currently flagged as "coming soon" in [Cap's webhook docs](https://cap.so/docs/api/webhooks). When they ship a `video.viewed` event, register a webhook handler and stop polling entirely.

## Environment variables

| Var | Required | Default | Purpose |
|---|---|---|---|
| `CAP_API_KEY` | Yes | — | Secret key (`csk_...`) from <https://cap.so/dashboard/developers>. |
| `CAP_API_BASE` | No | `https://cap.so/api` | Override for self-hosted Cap. |
| `CAP_CUSTOM_DOMAIN` | No | — | If your org uses a custom domain for share links (e.g. `video.acme.com`), set the host here and `getVideo()` will build share URLs against it. |

## When to revisit

This file should be updated if any of the following ship:

- Cap adds an analytics endpoint to `/api/developer/v1/*`.
- Cap exposes `video.viewed` webhook events.
- Cap merges `developer_videos` and `videos` (or adds a developer-API path for the latter), making `getVideo()` work for desktop-recorded content.

Until then, treat the polling story as **best-effort metadata + manual view tracking**.
