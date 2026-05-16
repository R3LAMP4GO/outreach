# SEO / AEO Report Generation

Per-prospect SEO/AEO reports are produced by an external CLI run by the
pg-boss worker. The handler lives at
`lib/prospects/jobs/generate-seo-report.ts` and is registered in
`scripts/worker.ts` under the `generate-seo-report` queue.

The CSV import endpoint (`POST /api/admin/prospects/import`) enqueues one
job per imported prospect; you can also re-fire jobs manually via
`enqueueGenerateSeoReport({ prospectId })` from `lib/queue/index.ts`.

---

## Required environment variables

Set on the **worker** service (and locally in `.env.local` for testing).

| Variable | Default | Purpose |
|---|---|---|
| `SEO_REPORT_CLI_CMD` | _(none — required)_ | Templated CLI invocation. See placeholders below. |
| `SEO_REPORT_OUT_DIR` | `./reports` | Directory the CLI writes report HTML to. |
| `SEO_REPORT_TIMEOUT_MS` | `300000` (5 min) | Per-prospect timeout. Process is SIGTERM'd on expiry. |
| `SEO_REPORT_WORKER_CONCURRENCY` | `2` | Max concurrent prospects per worker node. |

Object storage (`BUCKET_*`) must also be configured — the report HTML is
uploaded to `reports/<prospectId>.html` in the media bucket and served via
the authenticated proxy at `/api/media/reports/<prospectId>.html`.

---

## CLI contract

`SEO_REPORT_CLI_CMD` is a single shell-style command line. The handler:

1. Splits it on whitespace into argv **first**.
2. **Then** substitutes placeholders inside each argv slot.
3. Passes the resulting argv array to `Bun.spawn` directly — no shell.

This means user-controlled values (a prospect's `website` or `businessName`)
**cannot** inject shell metacharacters. They become a single argv item
regardless of content.

### Placeholders

| Token | Source | Notes |
|---|---|---|
| `{website}` | `prospects.website` | May be empty if the prospect has no website. |
| `{businessName}` | `prospects.business_name` | Always set. |
| `{prospectId}` | `prospects.id` | UUID. |
| `{outDir}` | `SEO_REPORT_OUT_DIR` env | Absolute or relative path. |

### Requirements your CLI must satisfy

- Accept whatever flags your template encodes (e.g. `--url`, `--out`).
- Write its output file to the path implied by `{outDir}/{prospectId}.html`
  — the handler reads `<outDir>/<prospectId>.html` after exit, regardless
  of how the template was written. If you change the output convention,
  also update `expectedOutputPath` in the handler.
- Exit `0` on success, non-zero on failure.
- Print error context to stderr — the last 500 chars are persisted to
  `prospects.seo_report_error` and included in the `seo_report_failed`
  timeline event.

### Failure modes

The handler treats any of the following as failures (flips status to
`failed`, writes a `seo_report_failed` timeline event, re-throws):

- Non-zero exit code
- Timeout (process SIGTERM'd after `SEO_REPORT_TIMEOUT_MS`)
- Exit 0 but the expected output file is missing
- Object storage upload error

---

## Testing locally with a stub CLI

Create a tiny shell script that just writes a placeholder file:

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
echo "<h1>fake report</h1>" > "$out"
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

Then run:

```bash
bun run worker                                  # in one terminal
# import 1 prospect via the admin /admin/prospecting/import UI, then watch:
ls -la reports/                                 # expect <prospectId>.html
# In psql: SELECT id, seo_report_status, seo_report_url FROM prospects ORDER BY created_at DESC LIMIT 1;
# Expected: status='ready', url='/api/media/reports/<prospectId>.html'
```

---

## Retry behaviour

The job is enqueued with `retryLimit: 3` and `retryDelay: 120s`
(see `enqueueGenerateSeoReport` in `lib/queue/index.ts`). On the first
failure the handler marks `seoReportStatus='failed'` and re-throws. On
subsequent pg-boss retries the idempotency check returns early (status is
no longer `pending`), so retries are effectively a single attempt that
records its failure permanently. Re-enqueue manually if you want another
attempt after fixing the CLI.
