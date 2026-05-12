---
name: commit
description: Run checks, commit, push to main, then watch the Railway build and triage failures
---

## Before starting — read the Railway skill

Invoke the `use-railway` skill so you understand the CLI and how to watch deployments:

```
skill("use-railway")
```

If this is the first time running on this machine, ensure the project is linked:

```bash
railway status || railway link
```

---

## Step 1 — Quality checks (fix ALL errors before continuing)

Run these in order. Do not proceed if any fail.

```bash
bun run lint
bun run typecheck
```

> **Why:** lint catches style/correctness issues, typecheck catches TypeScript errors.

---

## Step 2 — Production build (MANDATORY — do not skip)

```bash
rm -rf .next && bun run build
```

**This must pass cleanly.** Fix all errors before moving on.

> **Why this matters more than typecheck alone:**
> - `bun run typecheck` uses TypeScript's incremental cache and can miss errors that a fresh build finds (e.g. type changes in updated SDK packages)
> - `bun run build` traces all imports — it catches missing modules that `tsc` never sees (e.g. a dep removed from `package.json` still required at runtime by a transitive package)
> - Build also runs static generation, which catches any server component accidentally using `headers()` / `cookies()` without being marked dynamic
>
> **Common failures to watch for:**
> - `Module not found: Can't resolve 'X'` — package removed but still imported transitively. Fix: add it back or add to `serverExternalPackages`.
> - `Type error: ...` during the TS check phase — SDK types changed. Fix: update usage to match new types.
> - `Export encountered an error on /some/page` — page is being statically prerendered but calls `headers()` / `cookies()`. Fix: add `export const dynamic = 'force-dynamic'` to that page.

---

## Step 3 — Schema check (only if you changed Drizzle schema)

If any files in `lib/db/schema.ts` or `lib/db/relations.ts` were changed:

```bash
bunx drizzle-kit generate
```

Include the generated file from `drizzle/` in the commit.

- **NEVER use `drizzle-kit push` against production** — it bypasses migration files and can corrupt the live DB.
- `drizzle-kit push` is for local dev only.

---

## Step 4 — Review changes

```bash
git status
git diff --staged
git diff
```

**Before staging `-A`**, confirm there's no unrelated in-progress work (`git stash list`, check untracked files). If there is, stage only your specific files.

---

## Step 5 — Stage and commit

```bash
git add <specific files, or -A only if the tree is clean>
```

If schema changed, confirm the new `drizzle/*.sql` migration file is staged.

Generate a commit message — conventional commit format, imperative mood, one line preferred:

- `feat: add X`
- `fix: correct Y`
- `chore: bump Z`
- `perf:`, `refactor:`, `docs:`, `style:`, `test:`

```bash
git commit -m "your message"
git push origin main
```

The pre-commit hook runs `lint-staged` (eslint + biome format) automatically.
**Never use `--no-verify`** — it skips those checks.

---

## Step 6 — Watch the Railway build

Railway auto-deploys **two services** on push to `main` from this repo:

- **`website`** — Next.js app, builds via `Dockerfile`
- **`worker`** — pg-boss job processor, builds via `Dockerfile.worker`

Both must reach `SUCCESS`. Poll until both are out of `BUILDING`:

```bash
railway service list --json | python3 -c "
import sys, json
for s in json.load(sys.stdin):
    if s['name'] != 'Postgres':
        print(f\"{s['name']:10} {s.get('status','?')}\")
"
```

Tail build logs per service if needed:

```bash
railway logs --build --service website --lines 200
railway logs --build --service worker  --lines 200
```

---

## Step 7 — If Railway build FAILED, triage

Railway's build environment differs from local:

- **Fresh install** — no `node_modules` cache on cold builds
- **Linux AMD64** — native binaries must be compatible
- **Dockerfile builds don’t inherit service env vars at build time** — only at runtime. If a module throws on missing env at import, the build will fail. Lazy-init those modules (see `lib/db/index.ts` for the Proxy pattern).

**Common Railway-only failures:**

- Package postinstall script fails (downloading a binary) → set `SKIP_DOWNLOAD=true` env var or remove the package
- Missing **runtime** env var → add it in the Railway dashboard → Variables for the relevant service
- OOM during build → trim the build or bump the plan's memory
- Worker built the wrong way (running `next build`) → verify `dockerfilePath` is `Dockerfile.worker` for the worker service

Read the root error from `railway logs --build --service <name>`, fix locally, repeat from Step 1.

---

## Step 8 — Confirm healthy

Once both services are `SUCCESS`:

```bash
# Website runtime
railway logs --service website --lines 30
curl -sI https://coastalprograms.com | head -5

# Worker runtime — should show “pg-boss started” and “all handlers registered”
railway logs --service worker --lines 30
```

Website logs should show `✓ Ready` / `Listening on ...` and the site should return `2xx` or `3xx` (not `5xx`).
Worker logs should show `[worker] pg-boss started` and `[worker] all handlers registered — waiting for jobs`.

---

## Rules

- **Commit directly to `main`** — no feature branches, no PRs, no review cycles.
- **Never `--force`, `--hard`, or rewrite pushed history** without explicit user confirmation.
- **Never `--no-verify`** — pre-commit hooks exist to protect you.
- **Never commit secrets** — check `git diff --cached` for `.env*`, API keys, tokens.
- **If Railway fails, fix it immediately** — broken `main` = broken production.
