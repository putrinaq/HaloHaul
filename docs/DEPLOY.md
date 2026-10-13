# Deploy

> The full production runbook arrives in Phase 6. For now this page has the
> local smoke test to run before the first real deploy, and again after any
> change to the Dockerfile, compose file or Caddyfile.

## Local Docker smoke test

Needs Docker Desktop (or any Docker engine with Compose v2). It takes about
10 minutes. The goal is to catch packaging problems on your machine instead of
on the VPS.

**0. Architecture.** On the VPS, run `uname -m`. It must print `x86_64`,
because CI builds `linux/amd64` images. If it prints `aarch64`, change
`platforms:` in `.github/workflows/ci.yml` before you deploy.

**1. Build both images exactly as CI does.**

```bash
docker build --platform linux/amd64 --target app    -t ghcr.io/local/halohaul-app:smoke .
docker build --platform linux/amd64 --target worker -t ghcr.io/local/halohaul-worker:smoke .
docker image ls | grep halohaul        # note the sizes: app ≈ 250 MB, worker ≈ 180 MB
```

**2. Make a throwaway stack directory** so your dev `.env` isn't touched.

```bash
mkdir -p ../halohaul-smoke && cp docker-compose.yml Caddyfile ../halohaul-smoke/
cd ../halohaul-smoke
cat > .env <<'EOF'
GHCR_OWNER=local
IMAGE_TAG=smoke
DOMAIN=localhost
ACME_EMAIL=smoke@example.com
POSTGRES_USER=halohaul
POSTGRES_PASSWORD=smoke-password
POSTGRES_DB=halohaul
DATABASE_URL=postgres://halohaul:smoke-password@postgres:5432/halohaul
APP_URL=https://localhost
BETTER_AUTH_SECRET=smoke-secret-smoke-secret-smoke-secret-0123
RESEND_API_KEY=re_smoke_not_real
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=smoke-admin-password
EOF
```

**3. Start it and check every service.**

```bash
docker compose up -d
docker compose ps -a
```

- [ ] `migrate` shows **Exited (0)**.
- [ ] `app` shows **healthy**. Allow it about 30 s.
- [ ] `worker`, `postgres` and `caddy` are **running**.
- [ ] `docker compose logs migrate` ends with `[migrate] done`.
- [ ] `docker compose logs worker` shows `[worker] started` and no errors.

**4. Through Caddy.** Caddy issues a local certificate for `localhost`, so use `-k`.

```bash
curl -k https://localhost/api/health          # {"ok":true}
curl -kI https://localhost/                   # 200
```

- [ ] The response headers include `strict-transport-security`,
  `content-security-policy` (containing `frame-ancestors 'none'`), and
  `x-content-type-options: nosniff`.
- [ ] There is no `x-powered-by` header and no `server` header.
- [ ] `curl -I http://localhost/` redirects to HTTPS.

**5. Seed and sign in.**

```bash
docker compose run --rm migrate node dist/seed.mjs
```

- [ ] It prints the admin, the restricted keywords and the open batches. Run it
  a second time: it prints nothing new, because the seed is safe to repeat.
- [ ] Open https://localhost and accept the certificate warning. Sign up as a
  student, then check that the session works.
- [ ] Request a magic link for `admin@example.com`. No email should be sent,
  and `docker compose logs app` should show `magic link refused for an admin account`.

**6. Resources and logging.**

```bash
docker stats --no-stream
docker inspect --format '{{.Name}} {{.HostConfig.Memory}} {{.HostConfig.LogConfig}}' $(docker compose ps -q)
```

- [ ] Every container is well under its limit at idle: app < 200 MB,
  worker < 120 MB, postgres < 200 MB, caddy < 40 MB.
- [ ] Every container shows `json-file` with `max-size:10m max-file:3`.
- [ ] `docker compose exec postgres psql -U halohaul -c "show shared_buffers; show max_connections; show work_mem;"`
  prints `128MB / 20 / 4MB`.

**7. Restart resilience.**

```bash
docker compose restart app worker && sleep 20 && curl -k https://localhost/api/health
docker compose up -d                           # migrate runs again: no-op, exits 0
```

- [ ] Health is still `{"ok":true}`, and `migrate` exits 0 again.

**8. Backup round trip (optional).** This needs a scratch R2 bucket, and
`backup.env` in the smoke directory.

```bash
mkdir -p backups && APP_DIR=$PWD LOCAL_DIR=$PWD/backups ../HaloHaul/scripts/backup.sh
APP_DIR=$PWD WORK_DIR=$PWD/backups ../HaloHaul/scripts/restore.sh latest
```

- [ ] The backup uploads, the restore asks for confirmation, and the app comes
  back healthy with the same data.

**9. Tear down.**

```bash
docker compose down -v && cd .. && rm -rf halohaul-smoke
docker image rm ghcr.io/local/halohaul-app:smoke ghcr.io/local/halohaul-worker:smoke
```

If any box stays unticked, fix it before pushing to `main`, because every push
to `main` deploys.
