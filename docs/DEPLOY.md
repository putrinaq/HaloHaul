# Deploying

Every push to `main` is checked and built into images by GitHub Actions. The VPS
puts them live itself: every minute `halohaul-deploy.timer` asks GitHub for the
newest passing build of `main` and, if it isn't live yet, runs
`scripts/deploy.sh`. Nothing outside can log in to the VPS to deploy.

`deploy.sh` backs up the database to `backups/` (the last ten), switches images,
waits for the app to be healthy, and goes back to the previous version if it
isn't. Database changes aren't undone; the backup is there for that. A version
that failed isn't tried again: the next push is. Nginx changes are installed by
hand (it says when there are any).

## On and off

`AUTO_DEPLOY=true` in `/opt/halohaul/.env` turns it on; anything else turns it off.

## See what it did

```bash
journalctl -u halohaul-deploy --since today
systemctl list-timers halohaul-deploy.timer
```

## By hand

As the deploy user, with a full commit sha whose images are built:

```bash
cd /opt/halohaul && scripts/deploy.sh <sha>
```

## Setting it up (once, as root)

```bash
cp /opt/halohaul/deploy/systemd/halohaul-deploy.* /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now halohaul-deploy.timer
echo AUTO_DEPLOY=true >> /opt/halohaul/.env
```
