#!/usr/bin/env bash
# Restore a Postgres backup from R2 (or a local file) into the running stack.
#
#   scripts/restore.sh --list                         list backups in R2
#   scripts/restore.sh latest                         restore the newest R2 backup
#   scripts/restore.sh halohaul-20261013T193000Z.dump restore a specific R2 backup
#   scripts/restore.sh ./path/to/file.dump            restore a local file
#
# DESTRUCTIVE: replaces the current database. App and worker are stopped during
# the restore. Full procedure and verification steps: docs/BACKUP.md
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/halohaul}
WORK_DIR=${WORK_DIR:-/var/backups/halohaul/restore}
RCLONE_IMAGE=rclone/rclone:1.75

cd "$APP_DIR"
# shellcheck disable=SC1091
set -a; source ./.env; source ./backup.env; set +a
PGUSER=${POSTGRES_USER:-halohaul}
PGDB=${POSTGRES_DB:-halohaul}

rclone() {
  docker run --rm \
    -v "$WORK_DIR:/data" \
    -e RCLONE_CONFIG_R2_TYPE=s3 \
    -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
    -e RCLONE_CONFIG_R2_ACCESS_KEY_ID="$BACKUP_R2_ACCESS_KEY_ID" \
    -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$BACKUP_R2_SECRET_ACCESS_KEY" \
    -e RCLONE_CONFIG_R2_ENDPOINT="https://${BACKUP_R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
    "$RCLONE_IMAGE" "$@"
}

ARG=${1:-}
if [[ -z $ARG ]]; then
  sed -n '2,11p' "$0"; exit 1
fi

mkdir -p "$WORK_DIR"

if [[ $ARG == "--list" ]]; then
  rclone lsl "r2:$BACKUP_R2_BUCKET/postgres" | sort -k2,3
  exit 0
fi

if [[ -f $ARG ]]; then
  DUMP=$(realpath "$ARG")
else
  NAME=$ARG
  if [[ $NAME == "latest" ]]; then
    NAME=$(rclone lsf "r2:$BACKUP_R2_BUCKET/postgres" --include "halohaul-*.dump" | sort | tail -n 1)
    [[ -n $NAME ]] || { echo "No backups found in R2." >&2; exit 1; }
  fi
  echo "Downloading $NAME…"
  rclone copyto "r2:$BACKUP_R2_BUCKET/postgres/$NAME" "/data/$NAME"
  DUMP="$WORK_DIR/$NAME"
fi

echo "Checking dump integrity…"
# Restore from a file inside the container (seekable), not from stdin.
IN_CONTAINER=/tmp/halohaul-restore.dump
docker compose cp "$DUMP" "postgres:$IN_CONTAINER"
trap 'docker compose exec -T postgres rm -f "$IN_CONTAINER" || true' EXIT
docker compose exec -T postgres pg_restore --list "$IN_CONTAINER" > /dev/null

echo
echo "About to REPLACE database '$PGDB' with: $(basename "$DUMP")"
read -r -p "Type the database name to continue: " CONFIRM
[[ $CONFIRM == "$PGDB" ]] || { echo "Aborted."; exit 1; }

echo "Stopping app and worker…"
docker compose stop app worker

echo "Restoring…"
# --clean --if-exists drops each object before recreating it; single transaction
# so a failed restore leaves the old data in place.
docker compose exec -T postgres pg_restore -U "$PGUSER" -d "$PGDB" \
  --clean --if-exists --no-owner --single-transaction --exit-on-error "$IN_CONTAINER"

echo "Running migrations (in case the backup predates the current schema)…"
docker compose run --rm migrate

echo "Starting app and worker…"
docker compose up -d app worker

echo "Restore complete. Verify with the checks in docs/BACKUP.md."
