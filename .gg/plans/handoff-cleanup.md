# Handoff cleanup — strip marketing leftovers + generic-ify branding

## Goal

This repo is a **copy** of the live Coastal Programs admin platform that the user wants to hand to a mate. The live project keeps running on Railway. This copy needs:

1. **Dead marketing code removed** — the previous `strip-marketing-site.md` pass removed public routes but left a pile of marketing-only components, SEO docs, and structured-data lib that nothing in `app/` references.
2. **Branding generic-ified** — Coastal Programs strings, `jake-schepis` Cal link, email defaults, auth cookie domain, login screen logo all replaced with placeholders the mate can fill in.
3. **Secrets scrubbed** — `.env.local` reset to a placeholder template so the zip is safe to send. (User keeps the real values in their original repo / Railway.)
4. **No Railway interaction** — read-only commands only, never link or mutate.

After this pass: `bun run dev` boots the admin, login screen says generic platform name, no Coastal Programs strings in code, and the mate can grep one or two placeholder tokens to rebrand for himself.

## What's already done (don't redo)

The previous `strip-marketing-site.md` plan already:
- Made `app/page.tsx` redirect to `/admin`.
- Set `app/layout.tsx` metadata to "Admin" with `robots: noindex`.
- Deleted public marketing routes (`app/about/`, `app/services/`, `app/blog/`, etc — all confirmed gone).
- Deleted `components/sections/`, `GoogleTagManager`, `WebVitalsReporter`, `StructuredData`.
- README already describes the repo as "Internal admin app".

## Investigation summary (already done in plan mode)

- `app/` imports **zero** files from `components/ui/*` — the 50-odd files in there (BlogCard, ProjectCard, AnimatedHero, CalEmbed, FloatingCTA, TestimonialCard, etc.) are all dead marketing components left behind.
- `lib/schema.ts` (structured data with hardcoded `jake@coastalprograms.com`, site URL, person/org schemas) has zero consumers in code — only referenced in deleted SEO docs.
- `docs/seo/` (54 SEO/metadata/structured-data markdown files) is pure marketing-site documentation. No code references.
- `docs/Features/`, `docs/traces/`, `docs/outreach-infrastructure.md` are platform docs — **keep**.
- `components/icons/{gmail-logo,outlook-logo}.tsx` are used by the outreach campaigns page — **keep**.
- `app/admin/(dashboard)/blog/` uses the `blogPosts` table but has no public consumer; the previous plan opted to keep it. **Keep** — the mate may want it.
- `app/admin/(dashboard)/data.json` is leftover scaffold data (cover-page rows). Not referenced. **Delete**.
- `scripts/test-onboarding-flow.sh` POSTs to `/api/newsletter/onboarding` which was deleted in the prior session. **Delete the script.**
- `public/logos/coastal-programs-logo.{png,svg}` — referenced by `settings/users/page.tsx` and the login screen. Replace with a generic placeholder or rename and update references.
- `public/partners/` — already gone (per prior strip plan).

## Branding touchpoints (must be generic-ified)

Hardcoded Coastal Programs / Jake references that need to become placeholders:

| File | Line(s) | What |
|---|---|---|
| `app/admin/(auth)/login/page.tsx` | 84, 93, 195 | Logo `alt`, headline copy, `mailto:` link |
| `app/admin/(auth)/reset-password/page.tsx` | 54, 93 | Logo `alt` |
| `app/admin/(dashboard)/blog/page.tsx` | 97 | Hardcoded `authorUrl` |
| `app/admin/(dashboard)/settings/users/page.tsx` | 37, 106 | `DEFAULT_LOGO` path, fallback business name |
| `app/admin/(dashboard)/outreach/campaigns/[id]/page.tsx` | 1120, 1316 | Hardcoded preview URLs (use `NEXT_PUBLIC_SITE_URL`) |
| `lib/auth.config.ts` | 106 | Auth cookie `domain: ".coastalprograms.com"` |
| `lib/notifications.ts` | 100, 177, 294 | `DEFAULT_FROM_EMAIL` fallback to `hello@email.coastalprograms.com` |
| `lib/outreach/ai/reply-analyzer.ts` | 71, 86, 158, 179, 200 | Cal.com link `https://cal.com/jake-schepis/business-consultation` baked into AI system prompt + few-shot examples |
| `lib/email/__tests__/build-quoted-reply.test.ts` | 160, 164 | Test fixtures with Cal link |
| `lib/outreach/ai/__tests__/reply-analyzer.test.ts` | 352 | Test asserts the Cal link verbatim |
| `lib/newsletter/emails/components/EmailFooter.tsx` | 60 | Footer "Book a call" link |
| `app/api/newsletter/send-test/route.ts` | 118, 158 | Email template Cal links |
| `scripts/eval-replies.ts` | 136 | Eval fixture with Jake's signature block |
| `scripts/test-outreach-booking.ts` | 178–179 | Default organizer email + name |
| `middleware.ts` | 41 | Comment mentioning `hooks.coastalprograms.com` |
| `README.md` | 124 | Mentions `hooks.coastalprograms.com` |
| `SECURITY.md` | 18, 42 | `security@coastalprograms.com`, "coastalprograms.com" scope |
| `CLAUDE.md` | 88, 90, 96, 97, 132 | Webhook URL + Reply-To examples + Cal link |

**Strategy:** introduce two placeholder constants the mate replaces project-wide:
- `__YOUR_DOMAIN__` (replaces `coastalprograms.com`)
- `__YOUR_CAL_LINK__` (replaces `https://cal.com/jake-schepis/business-consultation`)

Add a `HANDOFF.md` at the repo root listing every token + the files they appear in, so the mate runs one find-and-replace per token.

## Risks

- **The AI reply-analyzer prompt is locked** (CLAUDE.md "Outreach AI voice (LOCKED)") and its tests assert the Cal link verbatim. If I replace the Cal link with a placeholder, the `reply-analyzer.test.ts` assertion fails. **Mitigation:** update both prompt and test to use the same placeholder, so the regression test still pins the link to whatever value the prompt currently has — just generic.
- **Auth cookie `domain: ".coastalprograms.com"`** in `lib/auth.config.ts` will break local dev login if the mate's domain isn't set. Switch to reading from `process.env.NEXTAUTH_COOKIE_DOMAIN` with no default (NextAuth defaults to host-only cookies, which works fine on localhost and any production domain).
- **`bun run test:run` must still pass** after replacements. The Cal-link tests are the main risk.
- **Deleting `lib/schema.ts` is safe** (zero code consumers verified), but deleting `components/ui/` removes 50+ files — `tsc --noEmit` and `bun run test:run` are the safety net.

## Out of scope

- Renaming any DB tables, env vars, or DB column names. The mate inherits the schema as-is.
- Touching `lib/db/schema.ts`, migrations, or seed data.
- Anything related to the live Railway project. **Strictly local-repo edits only.**
- Updating the CLAUDE.md "LOCKED" rationale — leave it as-is, just replace the literal strings. The mate can rewrite the lock rules to match his own setup.

## Verification

After every numbered step is done:

1. `bun run lint` — should report **0 errors** (existing warnings are fine).
2. `bunx tsc --noEmit` — must be clean.
3. `bun run test:run` — all tests pass (1356 was the previous baseline).
4. `grep -r "coastalprograms\|jake-schepis\|Coastal Programs" --include="*.ts" --include="*.tsx" .` — should return **zero hits** in code (markdown explanations of the find-and-replace tokens in `HANDOFF.md` are fine).
5. Open `.env.local` — confirm it contains only placeholder values, no real secrets.
6. Skim `HANDOFF.md` — confirm every placeholder token is listed with file paths.

## Steps

1. Scrub `.env.local` to placeholder values (re-do the scrub from earlier, keep the same shape as `.env.example`).
2. Delete `components/ui/` entirely (50+ marketing components, zero importers in `app/`).
3. Delete `components/ui/animations/` if not already inside the above (it's a subfolder — same delete covers it).
4. Delete `lib/schema.ts` (structured-data lib, zero code consumers).
5. Delete `docs/seo/` entirely (54 marketing SEO/metadata/structured-data markdown files).
6. Delete `app/admin/(dashboard)/data.json` (scaffold leftover, not referenced).
7. Delete `scripts/test-onboarding-flow.sh` (POSTs to a deleted route).
8. Replace Coastal Programs references in admin login + reset-password pages (`alt`, headline, mailto) with `__YOUR_BRAND__` and `__YOUR_SUPPORT_EMAIL__` placeholders.
9. Replace the hardcoded `authorUrl` in `app/admin/(dashboard)/blog/page.tsx` line 97 with `process.env.NEXT_PUBLIC_SITE_URL || "__YOUR_DOMAIN__"`.
10. Replace `DEFAULT_LOGO` path + fallback business name in `app/admin/(dashboard)/settings/users/page.tsx` lines 37 + 106 with generic strings; rename `public/logos/coastal-programs-logo.{png,svg}` to `public/logos/logo.{png,svg}` and update the reference.
11. Replace the two hardcoded `coastalprograms.com` preview/unsubscribe URLs in `app/admin/(dashboard)/outreach/campaigns/[id]/page.tsx` lines 1120 + 1316 to use `process.env.NEXT_PUBLIC_SITE_URL` consistently with a `__YOUR_DOMAIN__` fallback.
12. Remove the hardcoded `domain: ".coastalprograms.com"` cookie option in `lib/auth.config.ts` line 106 — replace with reading `process.env.AUTH_COOKIE_DOMAIN` (undefined → host-only cookie, which is the correct default).
13. Replace the three `hello@email.coastalprograms.com` fallbacks in `lib/notifications.ts` with `__YOUR_FROM_EMAIL__` (still gated behind `process.env.DEFAULT_FROM_EMAIL ||`).
14. Replace the Cal.com link `https://cal.com/jake-schepis/business-consultation` everywhere it appears (`lib/outreach/ai/reply-analyzer.ts`, `app/api/newsletter/send-test/route.ts`, `lib/newsletter/emails/components/EmailFooter.tsx`) with `__YOUR_CAL_LINK__`.
15. Update the matching test fixtures + assertions in `lib/email/__tests__/build-quoted-reply.test.ts` and `lib/outreach/ai/__tests__/reply-analyzer.test.ts` to assert the same `__YOUR_CAL_LINK__` placeholder, so the lock-test still pins prompt → assertion.
16. Update `scripts/eval-replies.ts` signature block to remove Jake's name/phone/email, replace with `__SENDER_NAME__` / `__SENDER_EMAIL__` placeholders.
17. Update `scripts/test-outreach-booking.ts` default organizer to `test@example.com` / `Test Organizer`.
18. Update `middleware.ts` comment, `README.md`, `SECURITY.md`, and `CLAUDE.md` to use `__YOUR_DOMAIN__` and `__YOUR_CAL_LINK__` placeholders in all illustrative URLs/emails.
19. Create `HANDOFF.md` at repo root listing every placeholder token + the files each appears in, plus a quickstart (clone → `bun install` → fill placeholders → set Railway vars → deploy).
20. Run verification: `bun run lint`, `bunx tsc --noEmit`, `bun run test:run`, and the grep check from the Verification section. Fix any failures before declaring done.
