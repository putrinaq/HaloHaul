#!/usr/bin/env bash
# Deploys one commit of main on the VPS: backs up the database, switches to that
# commit's images, waits until the app is healthy, and goes back to the previous
# images if it isn't. Run as the deploy user:
#
#   scripts/deploy.sh <full commit sha>
#
# As an SSH key's forced command (docs/DEPLOY.md) the sha is the only thing the
# caller controls, and it must be on main.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."

# The whole script is read before anything runs: `git pull` below may replace it.
main() {
  local sha="${SSH_ORIGINAL_COMMAND:-${1:-}}"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "Usage: deploy.sh <full commit sha>" >&2; exit 2; }

  exec 9> .deploy.lock
  flock -w 600 9 || { echo "Another deploy is still running" >&2; exit 1; }

  git fetch -q origin main
  git merge-base --is-ancestor "$sha" origin/main || { echo "That commit isn't on main" >&2; exit 1; }
  # Runs finish out of order: never replace a newer commit with an older one.
  if [ "$(git rev-parse HEAD)" != "$sha" ] && git merge-base --is-ancestor "$sha" HEAD; then
    echo "Already on a newer commit; nothing to do"
    exit 0
  fi

  local previous owner
  previous=$(grep -E '^IMAGE_TAG=' .env | cut -d= -f2-)
  owner=$(grep -E '^GHCR_OWNER=' .env | cut -d= -f2-)
  docker pull -q "ghcr.io/$owner/halohaul-app:$sha"
  docker pull -q "ghcr.io/$owner/halohaul-worker:$sha"

  umask 077
  mkdir -p backups
  docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "backups/pre-${sha:0:12}.dump.part"
  mv "backups/pre-${sha:0:12}.dump.part" "backups/pre-${sha:0:12}.dump"
  # Keep the last ten. These are for undoing a deploy, not real backups (docs/BACKUP.md).
  find backups -maxdepth 1 -name 'pre-*.dump' -printf '%T@ %p\n' | sort -rn | tail -n +11 | cut -d' ' -f2- | xargs -r rm -f
  umask 022

  git merge -q --ff-only "$sha"
  set_tag "$sha"
  if docker compose up -d app worker && healthy; then
    echo "Deployed ${sha:0:12}"
  else
    echo "The new version isn't healthy; going back to ${previous:0:12}" >&2
    docker compose logs --tail 40 migrate app >&2 || true
    set_tag "$previous"
    docker compose up -d --no-deps app worker
    healthy || echo "The previous version isn't healthy either" >&2
    echo "Rolled back. The database was not changed back: see backups/pre-${sha:0:12}.dump" >&2
    exit 1
  fi

  if ! cmp -s deploy/nginx/halohaul.conf /etc/nginx/sites-available/halohaul; then
    echo "Note: deploy/nginx/halohaul.conf differs from the installed one; install it by hand"
  fi
  # Only our own old images: this server runs other sites too.
  docker images --format '{{.Repository}}:{{.Tag}}' \
    | grep -E "^ghcr\.io/$owner/halohaul-(app|worker):" \
    | grep -vE ":($sha|$previous)$" | xargs -r docker rmi > /dev/null 2>&1 || true
}

# The app answering its health check, within two and a half minutes.
healthy() {
  local id state
  id=$(docker compose ps -q app)
  for _ in $(seq 1 50); do
    state=$(docker inspect -f '{{.State.Health.Status}}' "$id" 2> /dev/null || echo missing)
    [ "$state" = healthy ] && return 0
    sleep 3
  done
  return 1
}

set_tag() { sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$1/" .env; }

main "$@"
exit
