#!/usr/bin/env bash
# Run every minute on the VPS by halohaul-deploy.timer (docs/DEPLOY.md): when
# the newest passing build of main isn't live yet, deploy it with deploy.sh.
# The VPS asks GitHub, rather than GitHub logging in to the VPS, so nothing
# outside can run anything here.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."

grep -qE '^AUTO_DEPLOY=true$' .env || exit 0
repo=$(git remote get-url origin | sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##')
[[ "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "Unexpected git remote" >&2; exit 1; }

# A run is only "success" once tests passed and both images were pushed.
url="https://api.github.com/repos/$repo/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&per_page=1"
etag=$(cat .deploy-etag 2> /dev/null || true)
body=$(mktemp)
trap 'rm -f "$body"' EXIT
code=$(curl -sS -m 20 -o "$body" -w '%{http_code}' -D .deploy-headers \
  -H 'Accept: application/vnd.github+json' ${etag:+-H "If-None-Match: $etag"} "$url")
# Asking again with the same ETag doesn't use up GitHub's hourly limit.
[ "$code" = 304 ] && exit 0
[ "$code" = 200 ] || { echo "GitHub answered $code" >&2; exit 1; }

sha=$(python3 -c 'import json,sys; r=json.load(open(sys.argv[1]))["workflow_runs"]; print(r[0]["head_sha"] if r else "")' "$body")
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || exit 0
live=$(grep -E '^IMAGE_TAG=' .env | cut -d= -f2-)
if [ "$sha" != "$live" ] && [ "$sha" != "$(cat .deploy-failed 2> /dev/null || true)" ]; then
  # A version that failed its health check isn't tried again; the next push will be.
  scripts/deploy.sh "$sha" || { echo "$sha" > .deploy-failed; exit 1; }
fi
grep -i '^etag:' .deploy-headers | cut -d' ' -f2- | tr -d '\r' > .deploy-etag
