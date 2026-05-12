# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Website (Next.js 16 + standalone output)
#
# Two-stage build: bun for install + build, node for runtime.
# We avoid `bun install --frozen-lockfile` because of a known railpack/bun
# cross-platform lockfile incompatibility on Linux x86_64 vs macOS arm64.
# ─────────────────────────────────────────────────────────────────────────────

FROM oven/bun:1.3.13 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install

FROM oven/bun:1.3.13 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ── Runtime ──
FROM node:22.22.2-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy Next.js standalone output (server, minimal node_modules, package.json)
COPY --from=builder /app/.next/standalone ./.next/standalone
COPY --from=builder /app/.next/static ./.next/standalone/.next/static
COPY --from=builder /app/public ./.next/standalone/public

EXPOSE 3000

CMD ["node", ".next/standalone/server.js"]
