# Prospecting Pipeline — Operator Guide

End-to-end operator reference for the prospecting loop: how to run it locally,
how to wire it in production, and what to check when it breaks. For the
per-integration deep dives see:

- `docs/seo-reports.md` — SEO/AEO report CLI contract
- `docs/quo-integration.md` — Quo (OpenPhone) webhooks, signature verification,
  partial-ready retries
- `docs/cap-integration.md` — Cap polling cron, deduplication, hot-lead
  notifications

---

## Overview

The prospecting pipeline turns a CSV of businesses into a tracked sales loop.
After import, each prospect gets a CLI-generated SEO/AEO report attached, then
the admin places an outbound call (or sends SMS) through Quo from the
prospect detail page. When the call ends, Quo's webhook fires, the worker
fetches the AI-generated transcript + summary, and `@kenkaiiii/gg-ai` extracts
the structured outcome (person name, captured email/phone, follow-up intent,
meeting interest). The extraction promotes the prospect's `outreachStage`,
creates a `contacts` row when an email was captured, and schedules a
`prospect-follow-up` pg-boss job if the prospect asked for a follow-up. A Cap
video link can be attached to the prospect; the worker polls Cap every 5
minutes for viewer events and writes them to `video_engagement_events` plus a
hot-lead `notifications` row when a viewer completes ≥ 75 %. The admin sees
the whole timeline in `/admin/prospecting/<id>`.

Pre-CRM entity is `prospects` (no email required). A contact is only created
once an email is captured — see CLAUDE.md → "Prospecting Pipeline".

---

## Pipeline diagram

```
                              ┌─────────────────────────────────┐
                              │  CSV (businessName + optional)  │
                              └────────────────┬────────────────┘
                                               │ POST /api/admin/prospects/import
                                               ▼
                              ┌─────────────────────────────────┐
                              │   prospects table (status=new)  │
                              └────────────────┬────────────────┘
                                               │ enqueue generate-seo-report
                                               ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │  worker: SEO_REPORT_CLI_CMD → writes <outDir>/<prospectId>.html       │
   │          → upload to object storage → prospects.seoReportStatus=ready │
   └───────────────────────────────────────────────────────────────────────┘
                                               │
                                               ▼
                              ┌─────────────────────────────────┐
                              │  admin opens /admin/prospecting │
                              │  → "Call" button (lib/quo)      │
                              └────────────────┬────────────────┘
                                               │ outbound call placed in Quo
                                               ▼
                              ┌─────────────────────────────────┐
                              │   Quo webhooks → /api/webhooks/ │
                              │   quo (call.completed,          │
                              │   call.summary.completed,       │
                              │   call.transcript.completed,    │
                              │   message.received,             │
                              │   message.delivered)            │
                              └────────────────┬────────────────┘
                                               │ enqueue process-quo-call
                                               ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │  worker: fetch transcript + summary → gg-ai extract                   │
   │          → upsert contact (only if email captured)                    │
   │          → prospects.outreachStage = called/email_captured/...        │
   │          → contact_timeline row → admin notification                  │
   │          → if follow-up intent: insert prospect_follow_ups +          │
   │            enqueue prospect-follow-up (startAfter=dueAt)              │
   └───────────────────────────────────────────────────────────────────────┘
                                               │
                       (separate, periodic loop)│
                                               ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │  worker pg-boss schedule: poll-cap-analytics every 5 min              │
   │          → for each active prospect with capVideoId, fetch views      │
   │          → dedupe → video_engagement_events + timeline +              │
   │            hot-lead notification (priority HIGH if ≥75% watched)      │
   └───────────────────────────────────────────────────────────────────────┘
                                               │
                                               ▼
                              ┌─────────────────────────────────┐
                              │  worker: prospect-follow-up     │
                              │  fires at dueAt → notification  │
                              │  (admin completes from UI)      │
                              └─────────────────────────────────┘
```

---

## Setup checklist

Run these in order on a fresh machine (or fresh Railway project).

### 1. Set env vars

Copy `.env.example` → `.env.local` and fill the `# === Prospecting / Outreach
Integrations ===` section, plus `ANTHROPIC_API_KEY` (under `INTEGRATIONS &
API KEYS`) and `CRON_SECRET` (under `OPTIONAL FEATURES → Cron Jobs`).

Required for the full loop:

- `ANTHROPIC_API_KEY` — call extraction (also used by newsletter generation)
- `SEO_REPORT_CLI_CMD`, `SEO_REPORT_OUT_DIR`, `SEO_REPORT_TIMEOUT_MS`,
  `SEO_REPORT_WORKER_CONCURRENCY`
- `QUO_API_KEY`, `QUO_WEBHOOK_SECRET`, `QUO_PHONE_NUMBER`
- `CAP_API_KEY`, `CAP_POLL_LOOKBACK_DAYS`
- `CRON_SECRET` (manual `/api/cron/poll-cap-analytics` trigger)
- `BUCKET_*` (the SEO report HTML is uploaded to object storage)

All must be set on **both** the `website` and `worker` Railway services in
production. The worker runs the jobs; the website serves the webhooks and the
admin UI.

### 2. Apply database migrations

```bash
bunx drizzle-kit migrate
```

This creates the prospect-loop tables:

- `prospects`, `prospect_follow_ups`, `video_engagement_events` (0006)
- `contact_timeline` adds `prospect_id` (0007)
- `quo_webhook_events`, `quo_calls_processed` (0008)
- `contact_timeline.is_read` (0009)

Re-running is safe — Drizzle's migrator is idempotent.

### 3. Configure the Quo webhook

In the Quo dashboard: **Settings → Integrations → Webhooks → Create webhook**

- URL: `https://<your-domain>/api/webhooks/quo`
  (use the `hooks.<domain>` subdomain if you've configured one — same
  rationale as Cal.com, see `app/api/webhooks/cal/README.md`)
- Subscribe to **all five** event types:
  - `call.completed`
  - `call.summary.completed`
  - `call.transcript.completed`
  - `message.received`
  - `message.delivered`
- Copy the **Signing Secret** into `QUO_WEBHOOK_SECRET` (verbatim — don't
  trim or re-encode the base64).

The webhook handler is idempotent via `quo_webhook_events` and the AI
extraction is idempotent via `quo_calls_processed`, so duplicate deliveries
from Quo's at-least-once retry policy are safe.

Full signature verification details: `docs/quo-integration.md`.

### 4. Schedule Cap analytics polling

**Default (recommended)**: the worker self-manages the cron via pg-boss. No
external scheduler is needed. `scripts/worker.ts` calls:

```ts
await boss.schedule(QUEUE.POLL_CAP_ANALYTICS, "*/5 * * * *");
```

So as long as the `worker` Railway service is up, polling runs every 5
minutes. The cron string and concurrency (`localConcurrency: 1`) are pinned
in `scripts/worker.ts`.

**Alternative (manual / external trigger)**: hit the HTTP endpoint from a
Railway cron service, Upstash QStash, or curl:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<your-domain>/api/cron/poll-cap-analytics
```

This enqueues one job; the worker picks it up on its next 5 s polling tick.

Full details: `docs/cap-integration.md`.

### 5. Verify the worker is running

In a terminal:

```bash
bun run worker
```

Expected boot output (look for these handler-registered lines):

```
[worker] pg-boss started
[worker] queues ensured: newsletter-send, newsletter-curate, ...
[worker] generate-seo-report handler — concurrency: 2
[worker] process-quo-call handler — concurrency: 2
[worker] prospect-follow-up handler registered
[worker] scheduled outreach-process every 5 min
[worker] scheduled poll-cap-analytics every 5 min
[worker] all handlers registered — waiting for jobs
```

If any of `generate-seo-report`, `process-quo-call`, `poll-cap-analytics`, or
`prospect-follow-up` are missing from the log, the worker is on an older
build — redeploy.

In production, tail the worker container with `.gg/eyes/logs.sh worker
--since 5m` to see the same output.

---

## CSV format

The import endpoint (`POST /api/admin/prospects/import`) accepts a single
JSON body `{ csv: string }`. The parser is RFC 4180-compliant: quoted fields,
escaped `""`, embedded newlines inside quotes, and CRLF/LF/CR line endings
all work. See `lib/prospects/csv-parser.ts` for the full implementation.

### Columns

| Column | Required | Notes |
|---|---|---|
| `businessName` | **yes** | The only required column. |
| `website` | no | Validated with `new URL()`. Adds `https://` if no protocol. Must have a `.` in the hostname. |
| `phone` | no | Loose validation — at least 7 digits after stripping non-digit characters. Stored as the trimmed raw string (E.164 normalisation happens downstream). |
| `address` | no | Free-text street address. |
| `city` | no | |
| `state` | no | |
| `country` | no | |
| `industry` | no | Free-text. |
| `googlePlaceId` | no | Indexed (`prospects_google_place_id_idx`) for dedupe lookups. |
| `notes` | no | Free-text. AI extraction appends to this when a person is named on a call but no email was captured. |

Header matching is **case-insensitive and punctuation-insensitive**:
`Business Name`, `business_name`, `business-name`, and `BUSINESSNAME` all map
to `businessName`. Unknown columns are silently ignored.

### Sample row

```csv
businessName,website,phone,city,country,industry,notes
"Acme Coffee Roasters",acmecoffee.com,+61 400 111 222,Sydney,Australia,Cafes,"Refrigerated subscription program"
```

One CSV → one POST → one `prospects` row per data row + one
`generate-seo-report` pg-boss job per row + one `prospect_imported` timeline
event. Per-row validation errors are returned in the response under `errors[]`
so a single bad row doesn't fail the whole import.

---

## CLI contract (SEO_REPORT_CLI_CMD)

The worker runs `SEO_REPORT_CLI_CMD` once per prospect to generate the SEO/AEO
report HTML. The handler at `lib/prospects/jobs/generate-seo-report.ts`:

1. Splits the template on whitespace into argv **first**.
2. **Then** substitutes the placeholders `{website}`, `{businessName}`,
   `{prospectId}`, `{outDir}` inside each argv slot.
3. Passes the resulting argv array to `Bun.spawn` directly — **no shell**.

Because argv splitting happens before substitution, user-controlled values
(`prospects.website`, `prospects.businessName`) can never inject shell
metacharacters. They become a single argv item regardless of content.

### What your CLI must do

- Accept whatever flags your template encodes (e.g. `--url`, `--out`).
- Write its output file to the path implied by `{outDir}/{prospectId}.html`.
  The handler reads `<SEO_REPORT_OUT_DIR>/<prospectId>.html` after exit
  regardless of how the template was written.
- Exit `0` on success, non-zero on failure.
- Print error context to stderr — the last 500 chars get persisted to
  `prospects.seo_report_error` and surfaced in the `seo_report_failed`
  timeline event.

### Tiny stub for local testing

A minimal shell stub that just writes a placeholder file:

```bash
cat > /tmp/stub-seo << 'EOF'
#!/usr/bin/env bash
# Usage: stub-seo --url <url> --out <path>
out=""
while [ $# -gt 0 ]; do
  case "$1" in
    --out) out="$2"; shift 2 ;;
    *) shift ;;
  esac
done
mkdir -p "$(dirname "$out")"
echo "<h1>fake report for $out</h1>" > "$out"
EOF
chmod +x /tmp/stub-seo
```

Wire it into `.env.local`:

```bash
SEO_REPORT_CLI_CMD=/tmp/stub-seo --url {website} --out {outDir}/{prospectId}.html
SEO_REPORT_OUT_DIR=./reports
SEO_REPORT_TIMEOUT_MS=10000
SEO_REPORT_WORKER_CONCURRENCY=2
```

Then run `bun run worker`, import one prospect through `/admin/prospecting/import`,
and watch `./reports/<prospectId>.html` get written. `prospects.seoReportStatus`
flips to `ready` and `seoReportUrl` is set to `/api/media/reports/<id>.html`.

For the full CLI contract including failure modes, retry behaviour, and the
output-path convention, see `docs/seo-reports.md`.

---

## Troubleshooting

### Reports stuck on `generating`

The `generate-seo-report` job didn't return. Check:

1. **Worker logs** — `.gg/eyes/logs.sh worker --since 10m` (production) or
   the `bun run worker` terminal (local). Look for `[generate-seo-report]
   spawning ...`, `[generate-seo-report] exit code ...`, or a stack trace.
2. **CLI on PATH** — if the template starts with an unqualified command
   (`seo-report --url ...`), the worker's PATH must include it. Use an
   absolute path (`/usr/local/bin/seo-report` or `/tmp/stub-seo`) to remove
   ambiguity, especially in Docker.
3. **`SEO_REPORT_TIMEOUT_MS`** — the default is 5 min. A slow CLI that runs
   longer is killed with SIGTERM and `seoReportStatus` flips to `failed`,
   not `generating`. If the status is genuinely stuck at `generating`, the
   handler crashed before writing the status — check the worker logs.
4. **Object storage** — the upload step happens after the CLI exits. A
   misconfigured `BUCKET_*` will fail the job after the CLI succeeded. The
   exception is logged and the row goes to `failed` with the error in
   `prospects.seo_report_error`.

Re-fire a single prospect with:

```bash
bun -e '
  import("./lib/queue").then(async ({ enqueueGenerateSeoReport }) => {
    const jobId = await enqueueGenerateSeoReport({ prospectId: "<uuid>" });
    console.log("enqueued", jobId);
  })
'
```

### Webhook 401s (`/api/webhooks/quo`)

Quo's signature check rejected the payload. Confirm:

1. **`QUO_WEBHOOK_SECRET` matches the Quo dashboard exactly** — copy from
   "Reveal Signing Secret". Don't strip base64 padding, don't trim, don't
   re-encode.
2. **The secret is set on the `website` service** (where the route runs),
   not just the `worker`. Both should have it, but the webhook handler is on
   the website.
3. **Clock skew** — the verifier rejects timestamps older than 5 min or
   skewed more than 30 s. If the server's clock is wrong, every webhook
   401s. Check `date` in the container.
4. **`DEBUG_WEBHOOK_SIGNATURE=true`** temporarily — logs the components of
   the signature check (header parts, computed digest, expected digest). DO
   NOT leave on in production; it logs the secret prefix.

Full signature algorithm: `lib/quo/verify-signature.ts` + `docs/quo-integration.md`.

### Cap polling returns 0 views

The `poll-cap-analytics` job ran but inserted no rows. Check:

1. **`prospects.capVideoId` is set and parsed correctly** — the URL parser
   in `lib/cap/parse-url.ts` accepts both `cap.so/s/<id>` and custom-domain
   share links (`video.acme.com/s/<id>`). A mistyped or shortened URL
   returns `null` and the prospect is skipped.
2. **Cap API key has the right scope** — log into <https://cap.so/dashboard/developers>
   and confirm the `csk_...` key is for the same workspace that owns the
   videos. A foreign-workspace key 401s.
3. **The prospect is "active"** — the handler only polls prospects where
   `lastTouchedAt` is newer than `CAP_POLL_LOOKBACK_DAYS` (default 30) OR
   `outreachStage` is `emailed`/`email_captured`/`phone_captured`. Older
   prospects with no recent touches are silently skipped. Raise the lookback
   or touch the prospect to unblock.
4. **Cap doesn't yet ship a public analytics endpoint** — the polling
   handler treats this as a silent skip (see `docs/cap-integration.md` →
   "Known limitation"). The Cap API gap is real; until it's filled, no
   amount of polling will return view rows.

Manually trigger a poll with:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3500/api/cron/poll-cap-analytics
```

and watch `.gg/eyes/logs.sh worker --since 1m`.

### AI extraction returns `null` personName

Expected on voicemails, hang-ups, very short calls, or calls where the
prospect never said their name. The extraction prompt is conservative — it
won't invent details. When this happens:

- `prospects.outreachStage` still progresses (to `called`).
- No `contacts` row is created (the `NOT NULL` email constraint plus the
  "only create when email captured" rule both kick in).
- A `call_made`/`call_received` timeline event is still written with the
  full transcript metadata.

To verify, fetch the transcript directly from Quo:

```bash
bun -e '
  import("./lib/quo/client").then(async ({ getCallTranscript }) => {
    const t = await getCallTranscript("<callId>");
    console.log(JSON.stringify(t, null, 2));
  })
'
```

If the transcript clearly contains a name and the extractor missed it,
re-run the extraction by re-enqueueing the call:

```bash
bun -e '
  import("./lib/queue").then(async ({ enqueueProcessQuoCall }) => {
    const id = await enqueueProcessQuoCall({ callId: "<callId>" });
    console.log("enqueued", id);
  })
'
```

(idempotency is keyed on `quo_calls_processed.call_id` — delete that row
first if you want a true re-run.)

---

## Reference

- Schema: `lib/db/schema.ts` (search `prospects`, `prospect_follow_ups`,
  `video_engagement_events`, `quo_webhook_events`, `quo_calls_processed`)
- Worker registration: `scripts/worker.ts`
- Enqueue functions: `lib/queue/index.ts`
- Import endpoint: `app/api/admin/prospects/import/route.ts`
- Quo webhook route: `app/api/webhooks/quo/route.ts`
- Cap cron route: `app/api/cron/poll-cap-analytics/route.ts`
- Admin UI: `app/admin/(dashboard)/prospecting/`
