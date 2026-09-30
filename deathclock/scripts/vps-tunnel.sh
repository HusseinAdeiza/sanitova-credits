#!/usr/bin/env bash
# Keeps an SSH tunnel to the DeathClock validator on the VPS alive.
#
# The validator runs on the VPS (4 CPU / 7.8GiB / native ext4); the proving
# pipeline stays on the Windows host because RISC Zero's Groth16 wrap shells
# out to docker and cannot see a remote filesystem. A plain `ssh -L` dies if
# the peer resets the connection mid-run, which silently kills an E2E that has
# already spent minutes proving, so this reconnects in a loop instead.
#
# Usage:
#   bash scripts/vps-tunnel.sh              # foreground, Ctrl-C to stop
#   bash scripts/vps-tunnel.sh &            # background
set -uo pipefail

VPS_HOST="${DEATHCLOCK_VPS:-root@161.97.139.15}"
LOCAL_RPC_PORT="${DEATHCLOCK_LOCAL_RPC_PORT:-8899}"
LOCAL_WS_PORT="${DEATHCLOCK_LOCAL_WS_PORT:-8900}"
RETRY_SECONDS="${DEATHCLOCK_TUNNEL_RETRY:-5}"

echo "tunneling ${VPS_HOST} -> 127.0.0.1:${LOCAL_RPC_PORT}, 127.0.0.1:${LOCAL_WS_PORT}"

while true; do
  ssh -o BatchMode=yes \
      -o StrictHostKeyChecking=no \
      -o ExitOnForwardFailure=yes \
      -o ServerAliveInterval=20 \
      -o ServerAliveCountMax=6 \
      -o TCPKeepAlive=yes \
      -N \
      -L "${LOCAL_RPC_PORT}:127.0.0.1:8899" \
      -L "${LOCAL_WS_PORT}:127.0.0.1:8900" \
      "$VPS_HOST"
  status=$?
  echo "tunnel exited (status ${status}); reconnecting in ${RETRY_SECONDS}s" >&2
  sleep "$RETRY_SECONDS"
done
