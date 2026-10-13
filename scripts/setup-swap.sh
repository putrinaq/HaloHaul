#!/usr/bin/env bash
# Adds a 2 GB swap file on the VPS (1 GB RAM) and makes it permanent.
# Idempotent. Run once as root:  sudo bash scripts/setup-swap.sh
set -euo pipefail

SWAPFILE=/swapfile
SIZE=2G

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

if swapon --show=NAME --noheadings | grep -qx "$SWAPFILE"; then
  echo "Swap already active on $SWAPFILE:"
  swapon --show
else
  if [[ ! -f $SWAPFILE ]]; then
    fallocate -l "$SIZE" "$SWAPFILE" || dd if=/dev/zero of="$SWAPFILE" bs=1M count=2048 status=progress
  fi
  chmod 600 "$SWAPFILE"
  mkswap "$SWAPFILE"
  swapon "$SWAPFILE"
  echo "Swap enabled."
fi

if ! grep -q "^$SWAPFILE " /etc/fstab; then
  echo "$SWAPFILE none swap sw 0 0" >> /etc/fstab
  echo "Added to /etc/fstab."
fi

# Prefer RAM; only swap under real pressure. Keep filesystem caches a bit longer.
cat > /etc/sysctl.d/99-halohaul-swap.conf <<'EOF'
vm.swappiness=10
vm.vfs_cache_pressure=50
EOF
sysctl --system >/dev/null

free -h
