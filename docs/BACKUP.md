# Backups and restore

Postgres is the only stateful service on the VPS. Photos already live in R2, so
they are not part of these backups.

## What runs

`scripts/backup.sh`, nightly from the host crontab:

1. `pg_dump --format=custom` inside the `postgres` container, written to a file
   so the archive is seekable.
2. `pg_restore --list` on the dump. A corrupt dump stops the job before upload.
3. Upload to the **backup bucket** in R2 with the rclone container, then check
   the uploaded size.
4. Delete R2 backups older than `BACKUP_RETENTION_DAYS` (14).
5. Keep the two newest dumps locally in `/var/backups/halohaul`.

The backup bucket has its own R2 token (in `backup.env`, not `.env`), so a
compromise of the app container can't read or delete backups.

> **Personal data:** dumps contain phone numbers, measurements and prescriptions.
> R2 encrypts at rest, but keep the backup bucket private and its token tightly
> scoped. Never download dumps to personal machines except to test a restore,
> and delete them afterwards.

## One-time setup

1. In Cloudflare R2, create a bucket `halohaul-backups`. Create an API token
   with **Object Read & Write** on that bucket only.
2. Optional, as a second guard: add an R2 lifecycle rule on the bucket that
   deletes objects after 15 days.
3. On the VPS:

   ```bash
   cd /opt/halohaul
   cp backup.env.example backup.env   # copy it over first; fill in the token
   chmod 600 backup.env
   sudo mkdir -p /var/backups/halohaul && sudo chown "$USER" /var/backups/halohaul
   sudo touch /var/log/halohaul-backup.log && sudo chown "$USER" /var/log/halohaul-backup.log
   scripts/backup.sh                  # first run by hand, check the output
   crontab -e
   # 30 3 * * * /opt/halohaul/scripts/backup.sh >> /var/log/halohaul-backup.log 2>&1
   ```

4. Add `/var/log/halohaul-backup.log` to logrotate, or truncate it monthly.

## Restore

`scripts/restore.sh` replaces the live database. It stops `app` and `worker`,
restores in a **single transaction** (if it fails, the old data stays), runs any
newer migrations, and starts the app again.

```bash
cd /opt/halohaul
scripts/restore.sh --list            # see what's in R2
scripts/restore.sh latest            # newest backup
scripts/restore.sh halohaul-20261013T193000Z.dump
scripts/restore.sh /var/backups/halohaul/halohaul-20261013T193000Z.dump   # local copy
```

It asks you to type the database name before it does anything destructive.

### After a restore, check

```bash
docker compose ps                                   # app healthy, worker up
curl -fsS https://$DOMAIN/api/health                # {"ok":true}
docker compose exec postgres psql -U halohaul -d halohaul -c \
  "select count(*) orders, max(created_at) newest from orders;"
docker compose exec postgres psql -U halohaul -d halohaul -c \
  "select count(*), sum(amount_sen) from ledger_entries;"
```

The newest order should be from just before the backup time. Sign in as the
admin and open one recent order.

### Restoring onto a fresh VPS

1. Set up the server: Docker, `scripts/setup-swap.sh`, `/opt/halohaul` holding
   `.env`, `backup.env`, `docker-compose.yml`, `Caddyfile` and `scripts/`.
2. `docker compose up -d postgres`, then wait for it to report healthy.
3. `scripts/restore.sh latest`. This also runs migrations and starts the app and
   worker.
4. `docker compose up -d caddy`, then point DNS at the new server.

## Test the restore regularly

A backup you have never restored is a hope, not a backup. Once a month, and
before risky migrations:

```bash
# Restore the latest backup into a throwaway database on the same server.
cd /opt/halohaul && set -a && source .env && source backup.env && set +a
scripts/restore.sh --list | tail -1
docker compose exec postgres createdb -U halohaul restore_test
# Download the newest dump (as restore.sh does), copy it in, and restore it into restore_test:
#   docker compose cp <dump> postgres:/tmp/t.dump
#   docker compose exec postgres pg_restore -U halohaul -d restore_test --no-owner /tmp/t.dump
docker compose exec postgres psql -U halohaul -d restore_test -c "select count(*) from orders;"
docker compose exec postgres dropdb -U halohaul restore_test
```

Phase 6 turns this into a scripted drill.
