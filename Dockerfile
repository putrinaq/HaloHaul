# syntax=docker/dockerfile:1.7
# Built in GitHub Actions only — never on the 1 GB VPS.
# Targets:  app     Next.js standalone server
#           worker  pg-boss worker + migrate/seed scripts (no node_modules)

ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- dependencies ------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---- build -------------------------------------------------------------------
FROM deps AS builder
COPY . .
RUN npm run build && npm run build:worker

# ---- app ---------------------------------------------------------------------
FROM base AS app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]

# ---- worker ------------------------------------------------------------------
FROM base AS worker
ENV NODE_ENV=production \
    MIGRATIONS_DIR=/app/drizzle
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs worker
COPY --from=builder --chown=worker:nodejs /app/dist ./dist
COPY --from=builder --chown=worker:nodejs /app/drizzle ./drizzle
USER worker
CMD ["node", "--enable-source-maps", "dist/worker.mjs"]
