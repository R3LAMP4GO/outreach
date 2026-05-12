# Handoff Guide

This is a Next.js 16 admin platform with outreach (cold email), a newsletter
pipeline, CRM, and a pg-boss worker. It was forked from a branded internal tool
and stripped to a generic state — all brand strings, secrets, and personal info
are replaced with placeholder tokens you'll swap in below.

Follow this guide top-to-bottom for a working local dev environment, then
production.

---

## 1. Prerequisites

Install these once on your machine:

- **Bun** ≥ 1.3 — `curl -fsSL https://bun.sh/install | bash`
- **Docker Desktop** (for local Postgres + MinIO)
- **Node** ≥ 22 (Bun uses Node-compatible APIs; some tools still want it)
- A code editor (VS Code, Cursor, etc.)

Optional but useful:
- **Railway CLI** — `bun add -g @railway/cli` (for deployment)
- **mailpit** — local SMTP sink for inspecting emails in dev

---

## 2. Local setup (10 minutes)

```bash
# Clone & install
git clone <your-repo-url> my-app
cd my-app
bun install

# Start local Postgres + MinIO
docker compose up -d

# Copy env template, then fill it in (see section 3)
cp .env.example .env.local

# Apply database schema (creates all tables)
bun run db:push

# Run it
bun run dev          # web app on http://localhost:3500
bun run worker       # pg-boss worker (separate terminal — for outreach sends & newsletter jobs)
```

Visit http://localhost:3500/admin — you'll hit the login page. There's no seed
user yet; create one via the database (section 5) or wire up your own signup
route.

---

## 3. Environment variables

`.env.local` is the local dev config. **`.env.example` is the full reference** —
copy it, then fill in real values for the ones you need.

### Minimum to boot locally

| Var | What to put | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/postgres` | Matches `docker-compose.yml` defaults |
| `AUTH_SECRET` | `openssl rand -base64 32` | Required by NextAuth |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3500` | Used in email templates & previews |
| `BUCKET_*` | Defaults in `.env.example` work with the bundled MinIO | Bucket name `media` is auto-created |

### To send email (optional in dev)

| Var | Where to get it |
|---|---|
| `RESEND_API_KEY` | https://resend.com → API Keys |
| `DEFAULT_FROM_EMAIL` | A verified Resend sender (`hello@email.yourdomain.com`) |
| `NEWSLETTER_FROM_EMAIL` | Same — for newsletter sends |

### To use the AI reply analyzer (outreach)

| Var | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |

### Webhook secrets (generate fresh ones)

Generate each with `openssl rand -hex 32`:

- `CAL_WEBHOOK_SECRET` — Cal.com booking webhook signing
- `RESEND_WEBHOOK_SECRET` — Resend events (opens/clicks/bounces)
- `CRON_SECRET` / `OUTREACH_CRON_SECRET` — gates cron endpoints
- `UNSUBSCRIBE_SECRET` — signs unsubscribe links
- `NEWSLETTER_API_KEY` / `OUTREACH_API_KEY` — gate internal API routes

### Optional

- `AUTH_COOKIE_DOMAIN` — set to `.yourdomain.com` in production if you need the
  session cookie to span subdomains. Leave unset locally (host-only cookie).
- `GOOGLE_API_KEY` — only if you use Google services in your stack.

---

## 4. Replace the placeholder tokens

The repo contains a handful of placeholder strings you must find-and-replace
project-wide. Each token is intentionally unique so you can use a single
find-and-replace per token, including across markdown.

| Token | Replace with | Example |
|---|---|---|
| `__YOUR_BRAND__` | Your brand / product name | `Acme Co` |
| `__YOUR_DOMAIN__` | Bare domain (no scheme) | `acme.com` |
| `__YOUR_CAL_LINK__` | Full Cal.com booking URL | `https://cal.com/acme/intro` |
| `__YOUR_SUPPORT_EMAIL__` | Admin / support contact email | `support@acme.com` |
| `__YOUR_SECURITY_EMAIL__` | Security disclosure email | `security@acme.com` |
| `__YOUR_FROM_EMAIL__` | Default transactional `From:` mailbox | `hello@email.acme.com` |
| `__SENDER_NAME__` | Outreach sender's full name (eval fixtures only) | `Jane Doe` |
| `__SENDER_FIRST_NAME__` | Sender's first name (eval fixtures only) | `Jane` |
| `__SENDER_EMAIL__` | Sender's mailbox (eval fixtures only) | `jane@email.acme.com` |
| `__SENDER_PHONE__` | Sender's phone (eval fixtures only) | `0400 000 000` |

### Quick check

After your find-and-replace, this should print nothing:

```bash
grep -rn "__YOUR_\|__SENDER_" --include="*.ts" --include="*.tsx" --include="*.md" .
```

### Branding assets

Drop your own files at:

- `public/logos/logo.svg` — sidebar + login page logo
- `public/logos/logo.png` — raster fallback for email templates
- `public/favicon.png` + `public/android-chrome-512x512.png` — favicons (regenerate from realfavicongenerator.net)

---

## 5. Creating the first admin user

There's no built-in signup flow — the platform assumes invite-only admin
access. To create your first user, run this against your local DB:

```sql
-- Replace email + password hash
INSERT INTO "user" (id, name, email, "passwordHash", role)
VALUES (
  gen_random_uuid(),
  'Admin',
  'you@example.com',
  '<bcrypt hash — generate with: bun -e "console.log(await Bun.password.hash(\"yourpass\"))">',
  'super_admin'
);
```

Or use `bun run db:studio` to open Drizzle Studio and insert via the UI.

Once logged in, you can invite further admins via **Settings → Users**.

---

## 6. Verifying everything works

```bash
bun run lint        # ESLint — must be 0 errors
bun run typecheck   # TypeScript strict mode — must be clean
bun run test:run    # Vitest — all 1320+ tests must pass
bun run build       # Production build — must succeed
```

All four green = you're good to deploy.

---

## 7. Deploying to Railway

The repo is designed to deploy as **three Railway services** in a single
project, all pointing at the same GitHub repo. The web service and worker
share code but run different commands. The worker is **not optional** — if
you skip it, outreach emails won't send and newsletter jobs won't process.

| Service | Type | Builder | Start command | Purpose |
|---|---|---|---|---|
| `Postgres` | Managed DB | — | — | App data + pg-boss queue (`pgboss` schema) |
| `website` | App | Dockerfile (`./Dockerfile`) | `node .next/standalone/server.js` | Next.js web app |
| `worker` | App | Dockerfile (`./Dockerfile.worker`) | `bun scripts/worker.ts` | pg-boss job processor |

The build configs are committed: `railway.json` (website) and
`railway.worker.json` (worker). Railway picks them up automatically if you
set the config path per service (step 4d below).

### Step-by-step

#### a) Create the project

```bash
bun add -g @railway/cli
railway login
railway init       # creates a new project, prompts for name
```

Or just create it in the Railway dashboard. Either way, you should end up
with an empty project.

#### b) Add Postgres

Dashboard → **+ New** → **Database** → **Add PostgreSQL**.

Railway provisions it and gives you two env vars on the Postgres service:

- `DATABASE_URL` — internal URL (use this for `website` and `worker`)
- `DATABASE_PUBLIC_URL` — public TCP proxy URL (use this from your laptop)

No manual setup needed. pg-boss creates its own `pgboss` schema on first run.

#### c) Add the `website` service

Dashboard → **+ New** → **GitHub Repo** → pick your repo.

Then on the service:

1. **Settings → Source** → set the repo branch to `main`.
2. **Settings → Build** → set **Config Path** to `railway.json`.
   This tells Railway to use `Dockerfile` as the builder.
3. **Settings → Networking** → click **Generate Domain** to get a
   `*.up.railway.app` URL, or **Custom Domain** to add yours.
4. **Variables** → see env-var list below.

#### d) Add the `worker` service

Dashboard → **+ New** → **GitHub Repo** → pick the **same repo**.

Then on the service:

1. Rename it to `worker` (Settings → Service Name).
2. **Settings → Source** → branch `main`.
3. **Settings → Build** → set **Config Path** to `railway.worker.json`.
   This makes Railway use `Dockerfile.worker` and start with
   `bun scripts/worker.ts`.
4. **Settings → Networking** → **do NOT generate a domain**. The worker is
   internal-only, no HTTP server.
5. **Settings → Deploy** → confirm restart policy is `ON_FAILURE` with
   max 10 retries (already set in `railway.worker.json`).
6. **Variables** → see env-var list below.

#### e) Add object storage (Railway Bucket / Tigris)

Dashboard → **+ New** → **Database** → **Add Bucket**.

Railway provisions a Tigris-backed S3-compatible bucket and exposes:

- `BUCKET_ENDPOINT`
- `BUCKET_REGION`
- `BUCKET_NAME` (rename to `BUCKET_MEDIA_NAME` via variable reference)
- `BUCKET_ACCESS_KEY_ID` (rename to `BUCKET_MEDIA_ACCESS_KEY_ID`)
- `BUCKET_SECRET_ACCESS_KEY` (rename to `BUCKET_MEDIA_SECRET_ACCESS_KEY`)
- `BUCKET_FORCE_PATH_STYLE=false` (set manually — Tigris uses virtual-host)

Reference these from `website` and `worker` using Railway's `${{Bucket.VAR}}`
syntax (see env-var section below).

### Env vars per service

Railway lets you **reference variables across services** with
`${{ServiceName.VAR_NAME}}` — use this for `DATABASE_URL` and bucket creds so
you don't have to copy/paste secrets.

#### `website` service variables

| Var | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `NEXT_PUBLIC_SITE_URL` | `https://yourdomain.com` (or the Railway-generated URL) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_COOKIE_DOMAIN` | `.yourdomain.com` (only if you have subdomains; otherwise leave unset) |
| `RESEND_API_KEY` | From resend.com |
| `RESEND_WEBHOOK_SECRET` | From Resend webhook config |
| `ANTHROPIC_API_KEY` | From console.anthropic.com |
| `DEFAULT_FROM_EMAIL` | `hello@email.yourdomain.com` (verified in Resend) |
| `NEWSLETTER_FROM_EMAIL` | `newsletter@email.yourdomain.com` |
| `CAL_WEBHOOK_SECRET` | From Cal.com webhook config (if used) |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `OUTREACH_CRON_SECRET` | `openssl rand -hex 32` |
| `UNSUBSCRIBE_SECRET` | `openssl rand -hex 32` |
| `NEWSLETTER_API_KEY` | `openssl rand -hex 32` |
| `OUTREACH_API_KEY` | `openssl rand -hex 32` |
| `BUCKET_ENDPOINT` | `${{Bucket.BUCKET_ENDPOINT}}` |
| `BUCKET_REGION` | `${{Bucket.BUCKET_REGION}}` |
| `BUCKET_MEDIA_NAME` | `${{Bucket.BUCKET_NAME}}` |
| `BUCKET_MEDIA_ACCESS_KEY_ID` | `${{Bucket.BUCKET_ACCESS_KEY_ID}}` |
| `BUCKET_MEDIA_SECRET_ACCESS_KEY` | `${{Bucket.BUCKET_SECRET_ACCESS_KEY}}` |
| `BUCKET_FORCE_PATH_STYLE` | `false` |
| `NODE_ENV` | `production` (Railway sets this automatically) |

#### `worker` service variables

The worker needs a **subset** of the website's vars — anything it touches when
running jobs. Minimum set:

| Var | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `NEXT_PUBLIC_SITE_URL` | Same as website (used in email templates) |
| `RESEND_API_KEY` | Same |
| `ANTHROPIC_API_KEY` | Same |
| `DEFAULT_FROM_EMAIL` | Same |
| `NEWSLETTER_FROM_EMAIL` | Same |
| `UNSUBSCRIBE_SECRET` | Same |
| `OUTREACH_CRON_SECRET` | Same (the worker self-triggers via the cron endpoint) |
| `BUCKET_*` | Same five bucket vars as website |
| `NODE_ENV` | `production` |

The simplest approach: **set every var on both services**. Slight duplication
but zero chance of a missing var blowing up a job.

### First deploy

1. Make sure both services have their **Config Path** set (step c.2 and d.3).
2. Push to `main` → both services build and deploy in parallel.
3. Watch the **Deploy Logs** tab on each. First build takes ~3–5 min
   (Docker layer cache is cold).

### Apply the database schema (one-time)

The schema isn't auto-applied — you need to push it once after Postgres
spins up. Two options:

**Option A — from your laptop (easiest):**

```bash
# Grab DATABASE_PUBLIC_URL from the Railway Postgres service → Variables
DATABASE_URL="postgresql://...@<public-host>:<port>/railway" bun run db:push
```

**Option B — from Railway's web shell:**

On the `website` service → **⋮ menu** → **Shell** →

```bash
bun run db:push
```

Drizzle will print every table it creates. Re-running is safe — it's an
idempotent schema sync.

pg-boss creates its own `pgboss.*` tables automatically when the worker boots
for the first time — nothing to do there.

### Verifying the worker is alive

After the worker deploys, **Logs** should show:

```
[worker] pg-boss started
[worker] subscribed to queue: newsletter:send
[worker] subscribed to queue: outreach:send-email
[worker] subscribed to queue: outreach:process
...
```

If you see those lines and no errors, the worker is processing jobs. To
smoke-test it end-to-end, trigger an outreach send from the admin UI and
watch the worker logs — you should see a job picked up and an email sent.

If the worker is crashing on boot, 95% of the time it's a missing env var.
Railway's logs will show exactly which one (the worker fails loudly).

### Scaling the worker

The worker is single-instance by default. pg-boss handles concurrency
_within_ one process via `teamSize` / `batchSize` options in
`scripts/worker.ts`. If you need horizontal scaling later, you can bump
`Settings → Deploy → Replicas` on the worker service — pg-boss is designed
for multi-worker coordination and won't double-process jobs.

For most workloads, **one worker replica is plenty**.

### Auto-deploy on push

Both services are wired to the `main` branch by default. Push to `main` →
both redeploy in parallel. There's no staging branch — if you want one,
add a `staging` branch on each service's Source settings and a second
project for the staging env.

### Cal.com webhook subdomain (only if you use Cal.com)

If your domain runs through Cloudflare with Bot Fight Mode enabled, Cal.com's
webhook POSTs will get 403'd at the Cloudflare edge before reaching your app.

The fix: a dedicated `hooks.yourdomain.com` subdomain configured as **DNS-only
(grey cloud)** in Cloudflare, pointing at the Railway `website` service. Then
point Cal's webhook subscriber URL at
`https://hooks.yourdomain.com/api/webhooks/cal`.

Full details + DNS records: `app/api/webhooks/cal/README.md`.

---

## 8. Architecture cheatsheet

| Concern | Where it lives |
|---|---|
| Routes | `app/` (App Router) |
| Admin UI | `app/admin/(dashboard)/` |
| Auth | `lib/auth.ts`, `lib/auth.config.ts` (NextAuth Credentials) |
| Database client | `lib/db/index.ts` (Drizzle) |
| DB schema | `lib/db/schema.ts` |
| Background jobs | `scripts/worker.ts` (pg-boss handlers) |
| Job enqueue functions | `lib/queue/index.ts` |
| Object storage | `lib/storage/index.ts` (S3-compatible) |
| Outreach | `lib/outreach/` |
| Newsletter | `lib/newsletter/` |
| Email templates | `lib/newsletter/emails/`, `lib/email/` |
| Perception probes (eyes) | `.gg/eyes/` |

Read `CLAUDE.md` for the full conventions doc — naming, anti-patterns, and the
locked-behaviour sections (Cal webhook, Reply-To, AI voice).

---

## 9. Locked behaviour (read before touching outreach)

These rules are pinned by regression tests and live in `CLAUDE.md`. Breaking
them means broken bookings or broken deliverability.

- **Cal.com webhook host** — must be DNS-only in Cloudflare. See above.
- **Outreach Reply-To** — outgoing outreach emails set `Reply-To` to the
  sender's plain mailbox, never `reply+<uuid>@...`. Replies match back to
  contacts via `In-Reply-To`/`References` headers. Tests in
  `app/api/outreach/replies/[replyId]/send/__tests__/route.test.ts` will fail
  if this regresses.
- **AI reply-analyzer voice** — the system prompt in
  `lib/outreach/ai/reply-analyzer.ts` bakes in tone rules, banned phrases,
  and a verbatim calendar URL. Edit the voice rules to suit your brand, but
  keep `lib/outreach/ai/__tests__/reply-analyzer.test.ts` in sync.

To eval the AI prompt after editing it:

```bash
bun scripts/eval-replies.ts
```

This runs 8 hardcoded cases through the live Anthropic API and prints
pass/fail per case.

---

## 10. Known gaps to fill yourself

These weren't part of the stripping pass — you'll want to handle them before
shipping:

- **Documentation refresh** — `app/api/*/README.md` and
  `lib/newsletter/emails/*.md` still contain the original brand name in
  prose. Replace if you care, or delete if you don't.
- **First admin user creation flow** — currently DB-only (section 5). If you
  want a CLI or web signup, you'll need to wire it.
- **Brand-specific copy in admin UI** — sidebar fallback names, login welcome
  text, etc. all use `__YOUR_BRAND__` now; replace once and you're done.

---

That's it. If something doesn't boot, check `.env.local` first (90% of issues),
then `docker compose ps` to confirm Postgres + MinIO are healthy.
