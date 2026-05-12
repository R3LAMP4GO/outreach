# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow

Commit directly to `main`. No feature branches, no pull requests, no review cycles.

Use the `/commit` command (`.gg/commands/commit.md`) — it runs the full checks, commits, pushes, and watches the Railway build for failures.

### Rules
- **Never `--no-verify`** — pre-commit (lint-staged) hooks exist for a reason.
- **Never `--force`, `--hard`, or rewrite pushed history** without explicit confirmation.
- **Never commit secrets** — check `git diff --cached` for `.env*`, API keys, tokens.
- **If `main` is red on Railway, fix it immediately** — broken `main` = broken production.

### Commit messages
Conventional commits, imperative mood, one line preferred: `feat:`, `fix:`, `chore:`, `perf:`, `refactor:`, `docs:`, `style:`, `test:`.

## Communication Style

- **No code examples in responses** - Don't show JSON payloads, request bodies, or code blocks in chat
- **Structured text only** - Use headings, bullet points, status indicators (✅ ❌ ⚠)
- **Talk about implementation** - Describe what needs to happen, don't show the code
- **Concise and direct** - Get to the point, no fluff
- Code examples are fine in files, documentation, and plan mode - just not in chat responses

## Commands

```bash
# Development
bun run dev                     # Start dev server on :3500

# Build & Production
bun run build                   # Production build
bun start                       # Start production server

# Code Quality
bun run lint                    # ESLint check

# Worker (pg-boss job processor)
bun run worker                 # Start pg-boss worker process

# Cache issues
rm -rf .next && bun run dev
```

## Critical Patterns

### Database Client
- `db` from `@/lib/db` — Drizzle ORM client, used for ALL database queries (server-only)
- `@/lib/db/schema` — Drizzle table definitions (camelCase column names)
- `@/lib/db/relations` — Drizzle relation definitions
- `@supabase/supabase-js` is **no longer used** for database queries
- Webhooks are unauthenticated → use admin-level `db` access directly

### Database RPC Calls
- All RPC calls use `db.execute(sql`...`)` with named parameter syntax (`:=`)
- RPC functions still in use: `upsert_contact_with_hierarchy_protection`, `update_contact_and_deal_for_booking`, `bulk_add_tags`, `bulk_delete_contacts`, `get_crm_metrics`, `get_crm_dashboard_data`, `increment_sender_count`, `update_campaign_stats`, `get_unique_tags`

### Environment Variables
- `DATABASE_URL` — required, PostgreSQL connection string for Drizzle
- `BUCKET_ENDPOINT`, `BUCKET_MEDIA_ACCESS_KEY_ID`, `BUCKET_MEDIA_SECRET_ACCESS_KEY` — required for file uploads
- Use `process.env.RESEND_API_KEY`, `process.env.ANTHROPIC_API_KEY` directly
- Email addresses: `process.env.DEFAULT_FROM_EMAIL`, `process.env.NEWSLETTER_FROM_EMAIL`
- All credentials configured via environment variables (no database storage)

### Components
- **Named exports only** - No default exports
- **Animations** - ALL defined in `app/globals.css` with `@keyframes`, never inline
### Layout
- **Responsive**: Mobile-first (`md:` at 768px, `lg:` at 1024px)
- **Container pattern**: `w-full px-4 py-16` → `max-w-7xl mx-auto`

## CRM Pipeline

- Contact form → creates contact (status: lead) + deal (stage: Lead)
- Outreach positive reply → contact (status: lead) + deal (stage: Contacted)
- Cal.com booking → upgrades contact to "qualified" + moves deal to "Meeting Booked"
- Stages: Lead → Contacted → Meeting Booked → Proposal Sent → Won → Lost
- Pipeline slug: `sales-pipeline`
- Status hierarchy protection: subscriber < lead < qualified < customer (never downgrades)

**Outreach replies never auto-promote past `Contacted`.** Only a real Cal.com `BOOKING_CREATED` webhook moves a deal to `Meeting Booked` — regardless of how the AI classified the reply intent. See `lib/outreach/crm/push-to-crm.ts` and `app/api/webhooks/cal/route.ts`.

## Cal.com Webhook URL (LOCKED)

**Production Subscriber URL:** `https://hooks.__YOUR_DOMAIN__/api/webhooks/cal`

**Do NOT change this to the apex domain (`__YOUR_DOMAIN__`) or orange-cloud the `hooks` CNAME in Cloudflare.** Cloudflare's free-tier Bot Fight Mode returns 403 for Cal.com’s POSTs before they reach Railway, silently breaking the booking → deal-stage flow. The `hooks` subdomain is grey-cloud (DNS only) precisely to bypass this. Full rationale + DNS record details: `app/api/webhooks/cal/README.md`.

## Outreach Reply-To (LOCKED)

**Outgoing outreach emails MUST use the sender's plain mailbox as `Reply-To`.**

- ✅ `Reply-To: sender@email.__YOUR_DOMAIN__`
- ❌ `Reply-To: reply+<uuid>@email.__YOUR_DOMAIN__`
- ❌ `Reply-To: sender@... <reply+<uuid>@...>` (display-name + bracket trick)

**Why this is locked:**
- Recipients see Reply-To when they hit "Reply" in Gmail/Outlook — a UUID-suffixed address looks like spam / a fake sender and kills trust + deliverability.
- Replies must land in the actual sender's inbox so they can have a real conversation.

**How replies still get matched to the originating contact:**
- Inbound webhook (`lib/outreach/webhooks/events/received.ts`) extracts UUIDs from the reply's `In-Reply-To` / `References` headers and matches them against `outreach_contacts.email_{1,2,3}_resend_id` (Resend uses the send id as Message-ID).
- From-address match is the secondary fallback for clients that strip threading headers.

**Do not** reintroduce `generateReplyToAddress(...)` in **either** of the two send paths:

1. `lib/outreach/sending/sender.ts` — outbound campaign emails (sequences 1/2/3)
2. `app/api/outreach/replies/[replyId]/send/route.ts` — admin replies sent from the Inbox UI

Both must set `replyTo = sender.email`. `generateReplyToAddress` is kept only as a `@deprecated` backstop for matching legacy inbound replies in the webhook handler — never for new sends.

**Locked blocks** (search for `CRITICAL: Reply-To`):
- `lib/outreach/sending/sender.ts`
- `app/api/outreach/replies/[replyId]/send/route.ts`

**Regression tests** that will fail if the UUID reply-to is reintroduced:
- `app/api/outreach/replies/[replyId]/send/__tests__/route.test.ts` — *"sets Reply-To to the sender's plain mailbox"*

## Outreach AI voice (LOCKED)

The AI reply analyzer (`lib/outreach/ai/reply-analyzer.ts`) drafts suggested replies in a specific brand voice. **Do not soften or genericise it** during refactors.

**Hard rules baked into `SYSTEM_PROMPT`:**
- The work is described as "we build systems" / "tailored systems" / "custom systems". **NEVER** as "AI automation" or "AI-powered" — these phrases are explicitly banned.
- Australian English ("organise", "realise", "favour"). Direct, plainspoken, masculine register.
- **No em-dashes (—).** Use commas, full stops, or colons.
- Banned phrases: `"AI automation"`, `"AI-powered"`, `"circle back"`, `"touch base"`, `"reach out"`, `"I hope this finds you well"`, `"synergy"`, `"leverage"`, `"transform"`, `"just wanted to"`. Update the list in the prompt itself, not in code.
- Signoff format is fixed: `Thanks,\n{sender_first_name}`. The first name is **dynamically injected** via the `senderFirstName` param — never hardcode "Jake". Auto-suggestions use the campaign sender; manual regenerations (Phase 2) will use the logged-in admin.
- Calendar link is verbatim: `__YOUR_CAL_LINK__`. Pricing reference: `$5,000 AUD+`, `4 to 8 weeks`.

**Regression tests** that fail if the voice drifts:
- `lib/outreach/ai/__tests__/reply-analyzer.test.ts` — *"does NOT contain the banned phrase 'AI automation'"*, *"includes the calendar link verbatim"*, *"injects the sender first name"*

**Eval harness** for prompt iteration without waiting for live replies:
- `bun scripts/eval-replies.ts` — runs 8 hardcoded cases (one per intent) against the live Anthropic API and prints pass/fail + each generated reply for eyeball review.

## Anti-patterns

### Components & Styling
- ❌ Default exports
- ❌ Inline keyframe animations (use globals.css)
- ❌ Animate `top`/`left` (use `transform`)
- ❌ Hardcode colors (use design tokens)

### Database & Drizzle
- ❌ Using `supabaseAdmin()` or `getSupabaseClient()` for database queries (use `db` from `@/lib/db`)
- ❌ Using snake_case column names in Drizzle queries (schema uses camelCase: `contacts.firstName` not `contacts.first_name`)
- ❌ Forgetting to map camelCase Drizzle results to snake_case for API responses
- ❌ Using `{ data, error }` pattern (Drizzle throws errors, use try/catch)
- ❌ Importing `db` in Client Components (it uses `"server-only"`)

### Environment Variables
- ❌ Hardcoding email addresses (use env vars: `DEFAULT_FROM_EMAIL`, `NEWSLETTER_FROM_EMAIL`)
- ❌ Committing API keys to git (use .env.local, gitignored)
- ❌ Not checking if env var is set before using

## Object Storage

- `lib/storage/index.ts` — `server-only` exports: `uploadFile`, `downloadFile`, `deleteFile`
- `lib/storage/client.ts` — cached `S3Client` factory (also `server-only`)
- All storage operations go through these helpers — never import the AWS SDK directly in routes
- Local dev: MinIO via `docker compose up -d minio` (auto-creates the `media` bucket)
- Production: Railway Bucket (Tigris) — add a Bucket service in Railway, then reference its vars (see `.env.example`)
- Uploaded files are served via authenticated proxy routes:
  - Avatars → `/api/media/avatars/[filename]` (requires session)
  - Logos → `/api/media/logos/[filename]` (requires session)
- Upload endpoints:
  - `POST /api/admin/upload/avatar` — multipart, 2 MB, PNG/JPG/WebP only
  - `POST /api/admin/upload/logo` — multipart, 2 MB, PNG/JPG/WebP/SVG (content-validated)
  - Both have `DELETE` handlers to remove the file from storage and clear the DB field

### Storage Anti-patterns
- ❌ Storing images as base64 in the database (use object storage)
- ❌ Serving storage files via public/unsigned S3 URLs (use the proxy routes)
- ❌ Importing `lib/storage` in Client Components (it is `server-only`)
- ❌ Trusting `file.type` alone for SVG validation (also inspect buffer contents)

### Storage Environment Variables
- `BUCKET_ENDPOINT` — S3-compatible endpoint URL
- `BUCKET_REGION` — region (e.g. `us-east-1` for MinIO, `auto` for Tigris)
- `BUCKET_FORCE_PATH_STYLE` — `true` for MinIO, `false` for Tigris/AWS
- `BUCKET_MEDIA_NAME` — bucket name (default: `media`)
- `BUCKET_MEDIA_ACCESS_KEY_ID` — access key
- `BUCKET_MEDIA_SECRET_ACCESS_KEY` — secret key

## Tech Stack

- **Runtime**: Bun
- **Framework**: Next.js 16 (App Router) + React 19
- **Styling**: Tailwind CSS v4
- **ORM**: Drizzle ORM (PostgreSQL query builder via `postgres.js`)
- **Database**: PostgreSQL hosted on Railway (Supabase was the old host — no longer used)
- **Job Queue**: pg-boss (backed by the same Railway Postgres — no external queue service)
- **Object Storage**: MinIO (local) / Railway Bucket via Tigris (production)
- **Deployment**: Railway web service + Railway worker service (proxied through Cloudflare)

## Railway Services

The project deploys as **three** Railway services from this single repo:

| Service | Builder | Start command | Purpose |
|---|---|---|---|
| `website` | `Dockerfile` | `node .next/standalone/server.js` | Next.js app (admin only — `/` redirects to `/admin`) |
| `worker` | `Dockerfile.worker` | `bun scripts/worker.ts` | pg-boss job processor (outreach sends, newsletter pipeline) |
| `Postgres` | (managed) | — | Database (also hosts the `pgboss` schema for the queue) |

**Why the worker exists:** The `website` is an HTTP server — it enqueues jobs (writes rows to `pgboss.job`) but can’t run them. The `worker` is a long-running process that polls the queue and runs job handlers. Same code, same DB, different start command.

**Push to `main` deploys both** `website` and `worker` simultaneously.

When adding a new background job:
1. Add a typed enqueue function in `lib/queue/index.ts`
2. Add the matching handler in `scripts/worker.ts` and register it via `boss.work()`
3. Call the enqueue function from a route/cron — the worker picks it up automatically

See @package.json for full dependency list.

## Detailed Patterns

For code examples and comprehensive patterns:
- Drizzle database operations → @lib/db/schema.ts, @lib/db/relations.ts
- Component & styling conventions → @.claude/rules/component-patterns.md

## Eyes

Perception probes live in `.gg/eyes/`. All headless. Artifacts → `.gg/eyes/out/` (gitignored). Invoke probes yourself; don't ask the user to verify what you can verify.

### Available probes

| Need | Run | Then |
|---|---|---|
| See container/process logs (Next.js dev, worker, MinIO, Postgres) | `.gg/eyes/logs.sh <container-or-name> [--since 5m] [--lines 200]` | Read the printed log path; grep for the request id, error, or `[ERROR]` lines. |
| Hit any HTTP endpoint and see status + headers + body | `.gg/eyes/http.sh <url> [method] [body-or-@file] [-H "Header: value" ...]` | Output goes to `.gg/eyes/out/`. Inspect the JSON body and status to confirm the route shape. |
| Screenshot a page in the admin or marketing site (Playwright, headless Chromium) | `.gg/eyes/visual.sh http://localhost:3500/<path> [WIDTHxHEIGHT] [--full-page]` | Open the printed PNG path. Compare to expected layout; check for clipping, missing borders, broken styles. |
| Capture outbound email locally (mailpit SMTP sink at 127.0.0.1:65240) | `.gg/eyes/mail.sh list` → `.gg/eyes/mail.sh latest` → `.gg/eyes/mail.sh read <id>` | Use to inspect Resend-bound emails redirected through mailpit in dev (subject, From/Reply-To, body, headers). |

**Verification status (`ggcoder eyes verify`):** `http` ✓ verified, `logs` ✓ verified, `visual` ✓ verified. `mail` installs cleanly and the probe is callable (mailpit runs on 127.0.0.1:65240 SMTP / 127.0.0.1:65241 HTTP), but its bundled self-test fails on redactor strictness — use the probe directly, don't trust `eyes verify` as a gate for `mail`.

### When to use these eyes (automatically, without being asked)

Reach for probes ON YOUR OWN INITIATIVE when any of these apply:

- **After editing any file under `app/admin/(dashboard)/inbox/`, `components/admin/EmailThread.tsx`, or `components/admin/ReplyComposer.tsx`** — screenshot the inbox: `.gg/eyes/visual.sh http://localhost:3500/admin/inbox 1440x900 --full-page`. Open the PNG, confirm the threaded bubbles render with their card borders, no duplicate quoted history, and badges (intent / sentiment / status) are correct.
- **After editing any `.tsx` under `app/` or `components/` that renders a hero / landing / pricing section** — screenshot the affected route (e.g. `.gg/eyes/visual.sh http://localhost:3500/services`) and check for descender clipping on gradient text and the `pt-64 pb-24` hero spacing.
- **After adding/modifying any route under `app/api/**/route.ts`** — hit it with `.gg/eyes/http.sh http://localhost:3500/api/<path>` (or `... POST '{"key":"value"}'` for POST) and confirm status code + JSON shape matches the route's contract before claiming it works.
- **After touching anything under `lib/outreach/sending/`, `lib/outreach/webhooks/`, `lib/newsletter/sender/`, or `app/api/outreach/replies/[replyId]/send/`** — trigger a send in dev, then `.gg/eyes/mail.sh latest` to inspect the actual rendered email. Verify Reply-To matches the LOCKED rule (sender's plain mailbox, never `reply+<uuid>@`).
- **After changing the worker (`scripts/worker.ts`) or any pg-boss enqueue path in `lib/queue/`** — tail the worker container with `.gg/eyes/logs.sh worker --since 5m` and confirm the job was picked up, ran, and didn't throw.
- **When a webhook handler under `lib/outreach/webhooks/events/` or `app/api/webhooks/` fails or behaves oddly** — `.gg/eyes/logs.sh website --since 10m` to read the actual request and stack trace, don't guess.
- **After modifying `lib/outreach/ai/reply-analyzer.ts` (the locked-voice prompt) OR any file it imports** — (1) run `bun scripts/eval-replies.ts` to confirm the prompt still produces output that matches the LOCKED voice rules (greeting, signoff, no em-dashes, no banned phrases, calendar URL when relevant); (2) tell the user to restart their dev server. Bun's hot-reload sometimes serves the stale compiled module to webhook routes, which produces confused output for the next inbound reply that arrives. The eval is the truth-test; the dev-server restart is the propagation fix.

If a probe fails or returns unexpected results, investigate the artifact directly (open the PNG, read the log file, inspect the JSON) before assuming the probe itself is broken.

### When NOT to use

- Docs-only changes, comments, formatting.
- Refactors covered by `bun run test:run` and `bun run typecheck`.
- Dev server isn't up AND the task doesn't require runtime verification (e.g. pure schema/type work).
- Same probe already ran this turn on the same artifact — reuse the output.
- Tests for pure functions (the test suite already covers them).

### When to escalate a capability gap (the self-improvement loop)

If you're about to **guess**, **skip verification**, or **hand-wave** about something a better probe would show you — STOP and surface the tradeoff inline. Phrasing like:

> "I tried screenshotting but the failure is a JS error I can only see in the browser console — and there's no `browser_console` probe. Two paths: (a) ~3 min to add it, then I can diagnose properly. (b) Workaround: I'd guess from the DOM state. Your call?"

Wait for the user's choice. **Don't escalate more than once per request** — if the user picked the workaround, don't re-ask in the same turn.

For minor friction (worked around it but wished it were better), don't interrupt — log it for later review:
- `ggcoder eyes log rough "<reason>" [--probe <name>]` — minor friction, you handled it
- `ggcoder eyes log wish "<gap>"` — capability you wished existed
- `ggcoder eyes log blocked "<reason>"` — call this AFTER the user approves an inline-escalation fix, for the audit trail

These accumulate quietly. The user reviews them periodically. Open signals will appear in your context on future turns until they're acked.

## Compaction Instructions

When summarizing this conversation (via /compact), follow these rules to minimize token usage:

- **Preserve:**
  - Current project architecture and key technical decisions.
  - The exact "Next Steps" or current task list.
  - Core code snippets that were successfully implemented.
- **Discard:**
  - All verbose terminal output, logs, and stack traces.
  - Failed attempts or discarded approaches.
  - Intermediate file listings and search results (grep outputs).
- **Format:** Keep the final summary under 3,000 tokens if possible.
