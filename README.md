# __YOUR_BRAND__ Admin

![Next.js](https://img.shields.io/badge/Next.js-16.0.0-black?style=flat&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat&logo=typescript&logoColor=white)
![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-PostgreSQL-C5F74F?style=flat&logo=drizzle&logoColor=black)
![Railway](https://img.shields.io/badge/Railway-Deployed-0B0D0E?style=flat&logo=railway&logoColor=white)

> Internal admin app: CRM, outreach automation, inbox, newsletter, settings.
> The public marketing site has been removed — visiting `/` redirects to `/admin`.

---

## Platform Capabilities

| System | Description |
|--------|-------------|
| Newsletter | Email campaign system with pg-boss queue processing |
| Outreach Automation | Email outreach with AI reply analysis and follow-ups |
| CRM Pipeline | Contacts, deals, leads with status hierarchy protection |
| Inbox | Threaded reply view with AI-suggested replies |
| Admin Dashboard | Auth (TOTP), users, settings, integrations |
| Object Storage | S3-compatible storage (MinIO local / Tigris in prod) |
| Webhooks | Cal.com booking + Resend email events |
| Prospecting | CSV import → CLI-generated SEO/AEO reports → Quo calls/SMS → AI call extraction → Cap viewer tracking → scheduled follow-ups |

---

## Tech Stack

- **Runtime**: Bun
- **Framework**: Next.js 16 (App Router) + React 19, TypeScript strict
- **Styling**: Tailwind CSS v4
- **ORM**: Drizzle (via `postgres.js`)
- **Database**: PostgreSQL on Railway (also hosts the `pgboss` queue schema)
- **Auth**: NextAuth v5 (credentials + TOTP)
- **Email**: Resend
- **Object Storage**: MinIO (local) / Railway Bucket via Tigris (prod)
- **Worker**: long-running Bun process (`scripts/worker.ts`) deployed as a separate Railway service

---

## Quick Start

Prerequisites: Bun, Docker (for local MinIO).

```bash
bun install
cp .env.example .env.local                 # fill in DATABASE_URL, AUTH_SECRET, RESEND_API_KEY, BUCKET_*
                                           # optional integrations: see docs/prospecting.md
docker compose up -d minio                 # local S3-compatible storage
bunx drizzle-kit migrate
bun run dev                                # http://localhost:3500 → redirects to /admin
```

### Scripts

```bash
bun run dev               # dev server on :3500
bun run build             # production build
bun start                 # start production server
bun run lint              # ESLint
bun run worker            # pg-boss worker (separate process)
docker compose up -d minio
```

---

## Project Structure

```
app/
├── admin/                 # Admin dashboard (NextAuth-protected)
│   ├── (auth)/            # login, invite, reset-password
│   └── (dashboard)/       # CRM, outreach, inbox, newsletter, settings
├── api/
│   ├── admin/             # Admin settings, users, uploads
│   ├── auth/              # NextAuth
│   ├── crm/               # CRM API
│   ├── outreach/          # Outreach API (campaigns, replies, cron)
│   ├── newsletter/        # Newsletter API (admin + cron — no public subscribe)
│   ├── webhooks/          # Cal.com + Resend
│   ├── cron/              # Scheduled tasks
│   ├── media/             # Authenticated file proxy
│   └── health/            # Health check
├── page.tsx               # redirects to /admin
└── layout.tsx             # root layout (CSP nonce, theme providers)

components/
├── admin/  crm/  outreach/  notifications/  settings/
├── shadcn/  ui/  icons/

lib/
├── db/                    # Drizzle schema + client
├── storage/               # S3 helpers (server-only)
├── newsletter/  outreach/  crm/
├── auth.ts  auth.config.ts
└── security/              # CSP nonce, rate limiting

scripts/
└── worker.ts              # pg-boss job processor
```

---

## Deployment

Three Railway services from this repo:

| Service | Builder | Start command |
|---|---|---|
| `website` | `Dockerfile` | `node .next/standalone/server.js` |
| `worker` | `Dockerfile.worker` | `bun scripts/worker.ts` |
| `Postgres` | managed | — (also hosts `pgboss` schema) |

Push to `main` deploys both `website` and `worker`. The worker polls the same Postgres queue and runs job handlers (outreach sends, newsletter pipeline).

For Tigris bucket setup and env var wiring, see `.env.example`.

---

## Architecture

- **Database**: All queries go through `db` from `@/lib/db` (Drizzle, server-only). Schema uses camelCase columns.
- **Storage**: All file access via `lib/storage/index.ts`. Files served via authenticated proxy routes (`/api/media/avatars/[filename]`, `/api/media/logos/[filename]`). Never generate public/unsigned S3 URLs.
- **Security**: Nonce-based CSP per request, CSRF origin/referer check on state-changing API routes, NextAuth session required for `/admin/*` and `/api/admin/*`. Hostname `hooks.__YOUR_DOMAIN__` serves webhooks only — everything else returns 404.
- **Components**: Named exports only. Animations live in `app/globals.css` as `@keyframes`, never inline.

See `CLAUDE.md` for full conventions and locked patterns (Cal.com webhook URL, outreach Reply-To, AI voice rules).

For the prospect SEO/AEO report worker (env vars, CLI contract, local stub),
see `docs/seo-reports.md`.

---

## License

Proprietary and confidential. All rights reserved.
