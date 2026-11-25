# Deploying

Every push to `main` is checked and built into images by GitHub Actions. Putting
them live is off until you turn it on.

## By hand

On the VPS, as the deploy user, once the images are built:

```
cd /opt/halohaul && scripts/deploy.sh <full commit sha>
```

It backs up the database to `backups/`, switches version, and goes back by itself
if the new one isn't healthy. Nginx changes are installed by hand; it says when
there are any.

## Automatically

The "Deploy to VPS" job is skipped unless the repository variable `AUTO_DEPLOY`
is `true`. **Then every push to main goes live.**

1. On the VPS, make a key that can only run the deploy script:

   ```
   sudo -iu putri
   ssh-keygen -t ed25519 -N '' -C halohaul-github-deploy -f ~/.ssh/github_deploy
   echo "restrict,command=\"/opt/halohaul/scripts/deploy.sh\" $(cat ~/.ssh/github_deploy.pub)" >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```

2. In GitHub → Settings → Environments → `production`, limit deployment branches
   to `main`, and add these environment secrets:

   | Secret | Value |
   |---|---|
   | `VPS_HOST` | the VPS address |
   | `VPS_PORT` | its SSH port |
   | `VPS_USER` | `putri` |
   | `VPS_SSH_KEY` | all of `cat ~/.ssh/github_deploy` (then `rm ~/.ssh/github_deploy`) |
   | `VPS_KNOWN_HOSTS` | output of `ssh-keyscan -t ed25519 -p PORT HOST`, checked against `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the VPS |

3. In Settings → Secrets and variables → Actions → **Variables**, add
   `AUTO_DEPLOY` = `true`.

To stop: set `AUTO_DEPLOY` to anything else. To revoke the key: delete its line
from `~/.ssh/authorized_keys`.
