#!/usr/bin/env bash
# Nightly Postgres backup → Cloudflare R2 (separate bucket), 14-day retention.
#
# Install (as the deploy user, which must be in the docker group):
#   crontab -e
#   30 3 * * * /opt/halohaul/scripts/backup.sh >> /var/log/halohaul-backup.log 2>&1
# (03:30 server time. The VPS clock is UTC → 11:30 MYT; adjust to taste.)
#
# Restore procedure: docs/BACKUP.md
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/halohaul}
LOCAL_DIR=${LOCAL_DIR:-/var/backups/halohaul}
RCLONE_IMAGE=rclone/rclone:1.75

cd "$APP_DIR"
# shellcheck disable=SC1091
set -a; source ./.env; source ./backup.env; set +a

: "${BACKUP_R2_ACCOUNT_ID:?}" "${BACKUP_R2_ACCESS_KEY_ID:?}" "${BACKUP_R2_SECRET_ACCESS_KEY:?}" "${BACKUP_R2_BUCKET:?}"
RETENTION=${BACKUP_RETENTION_DAYS:-14}
PGUSER=${POSTGRES_USER:-halohaul}
PGDB=${POSTGRES_DB:-halohaul}

mkdir -p "$LOCAL_DIR"
chmod 700 "$LOCAL_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="halohaul-${STAMP}.dump"
TMP="$LOCAL_DIR/.${FILE}.partial"

log() { echo "[$(date -u +%FT%TZ)] $*"; }
trap 'rm -f "$TMP"' EXIT

log "dumping $PGDB"
# Custom format: compressed and restorable table-by-table. Written to a file
# inside the container (not a pipe) so the archive records data offsets and
# pg_restore can seek — piped custom dumps can fail to restore out of order.
IN_CONTAINER=/tmp/halohaul-backup.dump
docker compose exec -T postgres pg_dump -U "$PGUSER" -d "$PGDB" \
  --format=custom --compress=9 --no-owner --file="$IN_CONTAINER"
# Refuse to upload a corrupt dump.
docker compose exec -T postgres pg_restore --list "$IN_CONTAINER" > /dev/null
docker compose cp "postgres:$IN_CONTAINER" "$TMP"
docker compose exec -T postgres rm -f "$IN_CONTAINER"

if [[ ! -s $TMP ]]; then
  log "ERROR: dump is empty"; exit 1
fi
mv "$TMP" "$LOCAL_DIR/$FILE"
log "dump ok: $(du -h "$LOCAL_DIR/$FILE" | cut -f1)"

rclone() {
  docker run --rm \
    -v "$LOCAL_DIR:/data:ro" \
    -e RCLONE_CONFIG_R2_TYPE=s3 \
    -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
    -e RCLONE_CONFIG_R2_ACCESS_KEY_ID="$BACKUP_R2_ACCESS_KEY_ID" \
    -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$BACKUP_R2_SECRET_ACCESS_KEY" \
    -e RCLONE_CONFIG_R2_ENDPOINT="https://${BACKUP_R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
    -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
    "$RCLONE_IMAGE" "$@"
}

log "uploading to r2:$BACKUP_R2_BUCKET/postgres/$FILE"
rclone copyto "/data/$FILE" "r2:$BACKUP_R2_BUCKET/postgres/$FILE" --s3-no-check-bucket
rclone check "/data" "r2:$BACKUP_R2_BUCKET/postgres" --one-way --include "$FILE" --size-only

log "pruning R2 backups older than ${RETENTION}d"
rclone delete "r2:$BACKUP_R2_BUCKET/postgres" --min-age "${RETENTION}d" --include "halohaul-*.dump"

# Keep only the two newest local copies (10 GB disk).
ls -1t "$LOCAL_DIR"/halohaul-*.dump 2>/dev/null | tail -n +3 | xargs -r rm -f

log "backup complete"
