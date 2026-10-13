# HaloHaul

Personal-buyer service for university students in Malaysia: students submit
items from Chinese marketplaces, the operator buys them, consolidates them into
scheduled shipping batches, and hands them out at a campus pickup point.

The full brief is in [docs/BRIEF.md](docs/BRIEF.md). Design references are in
Figma (see [design/README.md](design/README.md)).

## Stack

Next.js 16 (App Router, standalone output) · PostgreSQL 16 · Drizzle ·
Better Auth · Zod · pg-boss worker · Tailwind · Vitest · Docker Compose + Caddy.

## Layout

```
src/
  domain/          pure, tested business logic (no I/O)
    money.ts             sen/fen, FX conversion (integer only)
    shipping.ts          billable weight, rate table, estimate range
    reconciliation.ts    weigh-in vs quoted range, +20% cap
    quote.ts, fees.ts    quote totals, fees and credits
    orderStateMachine.ts the only place status transitions are defined
    categories/          versioned category registry (Zod + field metadata)
    settings.ts          settings schema with defaults
  db/              Drizzle schema, client, migrate, seed
  server/          env, auth (Better Auth), session guards, email
  worker/          pg-boss worker (separate process)
  app/             Next.js routes
drizzle/           SQL migrations (generated, plus custom triggers)
scripts/           swap, backup, restore, worker bundler
docs/              brief, backups
```

## Local development

Requirements: Node 24, plus Docker or a local Postgres 16.

```bash
cp .env.example .env
# set DATABASE_URL=postgres://halohaul:halohaul@localhost:5432/halohaul
# set APP_URL=http://localhost:3000 and BETTER_AUTH_SECRET (openssl rand -base64 48)
docker compose -f docker-compose.dev.yml up -d
#   …or, without Docker: `npm run db:local` in its own terminal (PGlite on
#   port 5432, data kept in .pglite/; same DATABASE_URL works)
npm install
npm run db:migrate
npm run db:seed -- --demo     # admin from ADMIN_EMAIL/ADMIN_PASSWORD + demo student
npm run dev                   # http://localhost:3000
npm run worker                # in another terminal
```

Without `RESEND_API_KEY`, emails (such as magic links) are printed to the console.

| Command | |
|---|---|
| `npm test` | unit + DB tests (DB tests use in-process PGlite, no server needed) |
| `npm run typecheck` / `npm run lint` | |
| `npm run db:generate` | new migration after editing `src/db/schema` |
| `npm run build` / `npm run build:worker` | production builds (CI does this) |

## Conventions

- **Money** is integers only: `*_sen` (MYR) and `*_fen` (RMB). Every RMB amount
  is stored with its `fx_rate` (`numeric(12,6)`, MYR per CNY).
- **The ledger and status history are append-only**, enforced by DB triggers.
  Corrections are new rows.
- **Status changes** go through `assertTransition()` in `src/domain/orderStateMachine.ts`.
- **Weights** are in grams, **dimensions** in millimetres, and **times** are
  stored as `timestamptz` and shown in Asia/Kuala_Lumpur.
- Business logic lives in `src/domain`. Routes and the worker call it and never
  reimplement it.

## Photo storage (Cloudflare R2)

Photos never touch local disk. Browsers upload straight to R2 with a presigned
PUT. The server then re-encodes each photo with sharp (stripping EXIF/GPS) and
serves it back through short-lived presigned GETs. Without the `R2_*` env vars,
uploads are switched off and the order form says so.

Bucket setup:

1. Create a **private** bucket (`R2_BUCKET`) and an API token with Object Read &
   Write on that bucket only.
2. Add a CORS rule so browsers can upload:

   ```json
   [{ "AllowedOrigins": ["https://YOUR_DOMAIN"], "AllowedMethods": ["PUT"],
      "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
   ```

3. Add a lifecycle rule that deletes objects under `incoming/` after 1 day, to
   clean up abandoned uploads.

## Home page images

The design photos live in Figma and `design/photos` (not in git).
`node scripts/optimize-images.mjs` writes the small WebP files in
`public/images`, which *are* committed. Next's runtime image optimisation stays
off, so the 1 GB VPS never resizes images.

## Deploy

Push to `main`. GitHub Actions lints, typechecks and tests, then builds the
`app` and `worker` images and pushes them to GHCR. It then SSHes into the VPS,
pins `IMAGE_TAG` to the commit SHA and runs `docker compose up -d`. The one-shot
`migrate` service applies migrations before `app` and `worker` start. Nothing is
built on the server.

Required repository secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, and
optionally `VPS_PORT`. The VPS needs `/opt/halohaul/.env` (from `.env.example`)
and `backup.env` (from `backup.env.example`).

First-time server prep: `sudo bash scripts/setup-swap.sh`, and install Docker.
Then, after the first deploy:
`docker compose run --rm migrate node dist/seed.mjs` creates settings, the
restricted keywords, open batches and the admin user. The full runbook arrives
in Phase 6 (`docs/DEPLOY.md`).

Backups and restore: [docs/BACKUP.md](docs/BACKUP.md).
