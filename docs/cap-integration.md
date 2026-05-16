# Cap (cap.so) Integration

This doc covers the operational side of the outreach app's Cap integration:
how prospect videos get attached, how view analytics are polled, and how the
cron is scheduled. For the low-level REST client and the Cap-API gap analysis
see `outreach/lib/cap/README.md`.

---

## Components at a glance

| Layer | File | Purpose |
|---|---|---|
| REST client | `lib/cap/client.ts` | Fetch video metadata, parse share URLs. Server-only. |
| Types / schemas | `lib/cap/types.ts` | Zod schemas for Cap responses. |
| Storage | `prospects.cap_video_id` + `prospects.cap_video_url` | Per-prospect video reference. |
| Engagement log | `video_engagement_events` | One row per recorded view (deduped on `cap_video_id + occurred_at + viewer_ip`). |
| Timeline | `contact_timeline` (via `writeTimelineEvent`) | Same view, mirrored to the per-prospect/contact timeline. |
| Notifications | `notifications` | Hot-lead alert for the assigned admin (priority `HIGH`). |
| Cron handler | `lib/prospects/jobs/poll-cap-analytics.ts` | Polls Cap for every active prospect, writes the rows above. |
| Cron HTTP | `app/api/cron/poll-cap-analytics/route.ts` | Thin enqueue endpoint for manual / external triggers. |
| Worker schedule | `scripts/worker.ts` | `boss.schedule(POLL_CAP_ANALYTICS, '*/5 * * * *')` — the canonical 5-min cron. |

---

## How the cron is scheduled (the canonical path)

The polling job is **self-managed by the worker process** via pg-boss's
internal scheduler. No external cron service is required.

`scripts/worker.ts` calls:

```ts
await boss.schedule(QUEUE.POLL_CAP_ANALYTICS, "*/5 * * * *");
await boss.work(QUEUE.POLL_CAP_ANALYTICS, { localConcurrency: 1 }, handlePollCapAnalyticsJob);
```

- **Cron string**: `*/5 * * * *` (every 5 minutes).
- **Concurrency**: bounded to **1** so overlapping ticks queue rather than
  race on the same prospect set.
- **Retry**: `retryLimit: 1`, `retryDelay: 60s`, `expireInSeconds: 600`. On
  transient Cap outages the next 5-min tick is the retry path; a stuck job
  is killed by the expire timer.

This mirrors the existing `OUTREACH_PROCESS_QUEUE` schedule — same
in-process pg-boss pattern, no separate Railway cron service needed.

### Why we don't use a Railway cron service

Railway supports cron services that hit an HTTP endpoint, and the
`/api/cron/poll-cap-analytics` route is wired and ready for that pattern.
**We don't use it** because:

1. The worker is already a long-running process with a stable connection
   pool to Postgres — cheaper than spinning up a one-shot HTTP service.
2. `boss.schedule` is transactional with the queue; an external HTTP cron
   can fire twice (Railway retries) or be silently throttled.
3. Less surface area to misconfigure (one fewer service deployment).

The HTTP endpoint is kept for **manual triggers** — see below.

---

## Manual triggers

When you want to fire the polling job out-of-band (debugging, a hot lead
you know just landed, a backfill after fixing a Cap issue), hit the HTTP
endpoint:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3500/api/cron/poll-cap-analytics
```

The route enqueues exactly one `poll-cap-analytics` job, the worker picks
it up on its next 5s polling tick, and the handler runs once across all
active prospects. The response is `{ "enqueued": true, "jobId": "..." }`.

Tail the worker logs to watch it run:

```bash
.gg/eyes/logs.sh worker --since 1m
```

---

## What counts as an "active prospect"?

The handler only polls prospects where `cap_video_id IS NOT NULL` **and**
at least one of:

- `last_touched_at` is within `CAP_POLL_LOOKBACK_DAYS` (default `30`), or
- `outreach_stage` is one of `emailed`, `email_captured`, `phone_captured`.

Anything older or with no engagement signal is skipped. This bounds the
per-tick Cap API spend regardless of total prospect count. To poll more
aggressively, raise `CAP_POLL_LOOKBACK_DAYS`.

The query has a hard cap of `MAX_PROSPECTS_PER_TICK = 1000` rows as a
safety guard — well above realistic batch sizes. If you genuinely have
more than a thousand active prospects with videos, paginate the query
inside the handler instead of raising the cap.

---

## Event-type classification

For each new view, the handler picks ONE event type using the most-engaged
signal that applies:

| Rule | Engagement event type |
|---|---|
| Same viewer (matched by IP) has a prior view | `video_rewatched` |
| Watch fraction ≥ 0.90 | `watched_completed` |
| Watch fraction ≥ 0.75 | `watched_75` |
| Watch fraction ≥ 0.50 | `watched_50` |
| Anything else (low engagement, anonymous or first time) | `first_view` |

These are stored in `video_engagement_events.event_type` as text.

Each engagement event is mirrored to a `contact_timeline` row with one of
the schema-allowed timeline event types:

| Engagement event | Timeline event |
|---|---|
| `watched_completed` | `video_completed` |
| `video_rewatched` | `video_rewatched` |
| All others | `video_viewed` |

The full engagement event name and the integer watch percent are stored in
the timeline row's `metadata` JSON for downstream filtering.

### Hot-lead notifications

A `notifications` row (priority `HIGH`, type `video_engagement`) is created
when the engagement event is `watched_75`, `watched_completed`, or
`video_rewatched`. The recipient is:

1. `prospects.assigned_user_id` if set, otherwise
2. The first row of `admin_users` (single-admin systems), otherwise
3. The notification is skipped with a warning log.

---

## Deduplication

A view is considered the same as one already on file when the triple
`(cap_video_id, occurred_at, viewer_ip)` matches. The dedupe key is also
applied **within a single Cap response** so a duplicate row inside the API
payload doesn't insert twice.

`viewer_ip = NULL` (anonymous views) stays distinct — two anonymous views
at different timestamps are recorded separately.

---

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `CAP_API_KEY` | Yes | — | Secret key (`csk_...`) from <https://cap.so/dashboard/developers>. Used by the REST client. |
| `CAP_API_BASE` | No | `https://cap.so/api` | Override for self-hosted Cap. |
| `CAP_CUSTOM_DOMAIN` | No | — | Custom share-link host (e.g. `video.acme.com`). |
| `CAP_POLL_LOOKBACK_DAYS` | No | `30` | Window for the "active prospect" predicate. |
| `CRON_SECRET` | Yes | — | Gates `/api/cron/poll-cap-analytics`. Generate with `openssl rand -hex 32`. |

`CRON_SECRET` and `CAP_POLL_LOOKBACK_DAYS` must be set on **both** the
`website` service (for the HTTP endpoint) and the `worker` service (for
the polling handler).

---

## Known limitation: Cap has no public analytics endpoint

Cap currently doesn't expose a public per-view analytics endpoint, so
`getVideoAnalytics` throws `CapApiError(501)` by default. The polling
handler treats this as a **silent skip** (debug log, not an error) so the
worker logs don't get flooded with the same message every 5 min.

When Cap ships an endpoint:

1. Replace the body of `getVideoAnalytics` in `lib/cap/client.ts` with the
   real `fetch` + Zod parse.
2. The shape the handler already consumes (`CapVideoAnalytics` from
   `lib/cap/types.ts`) is the contract — no change needed on the polling
   side. The parsing boundary is marked `TODO(cap-analytics)` in the
   handler.
3. Re-run the tests in `lib/prospects/jobs/__tests__/poll-cap-analytics.test.ts`
   to confirm the new client wiring doesn't break the handler contract.

See `lib/cap/README.md` for the full gap analysis and the fallback plan
(manual `lastViewedAt` override on the prospect).

---

## Local verification

```bash
# 1. Start the worker
bun run worker

# 2. Trigger a poll manually
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3500/api/cron/poll-cap-analytics

# 3. Watch the worker logs
.gg/eyes/logs.sh worker --since 30s

# Expected (with no active prospects):
#   [worker] poll-cap-analytics job <id>
#   [worker] poll-cap-analytics job <id> done — prospects: 0, new events: 0, errors: 0
```

To exercise the full path end-to-end, insert a test prospect with a
`cap_video_id` and an `outreach_stage` of `emailed`, then trigger the
endpoint. Without a real Cap analytics endpoint the polling will skip
silently — the integration test
(`lib/prospects/jobs/__tests__/poll-cap-analytics.test.ts`) is what
exercises the full insert / timeline / notification flow against a mocked
Cap response.
