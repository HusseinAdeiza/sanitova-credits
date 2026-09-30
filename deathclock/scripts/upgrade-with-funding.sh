#!/usr/bin/env bash
# Retries the devnet airdrop and upgrades the program the moment it succeeds.
#
# Why this exists: release_inheritance had a permissionless payout-redirection
# vulnerability (commit 92a60e4). The fix is compiled and committed but the
# upgrade needs ~2.5 SOL and the deploy authority held 1.44, so the program at
# C8unxtjo... is still vulnerable until this succeeds.
#
# The first version bounded itself by attempt count (40 tries). That was the
# wrong shape: the faucet allows 2 airdrops per hour per IP, so the quota is a
# function of wall-clock time, not of how many times you ask. Forty attempts at
# 60s is 40 minutes, which ended at almost exactly the moment the hourly window
# opened -- the script would have quit moments before funding became available
# and reported failure, when it had merely run out of attempts one window early.
# It now runs against a deadline, which is the unit the limit is actually
# measured in.
#
# Safe to run repeatedly: re-running after success just redeploys the same
# binary.
set -uo pipefail

AUTH="86ab21NszLjrmiipVvWfwoKmhJQ7Drpn5w5TxDnXvWKv"
PROGRAM="C8unxtjoDZWy2GmwHUPuSve1BHT5TtRKpNaDofbMS5Vh"
NEEDED_SOL=3.0
# Spans at least two faucet windows, since a window can open while a request is
# still in flight.
RUN_MINUTES=${RUN_MINUTES:-150}
ROOT=/workspace

balance() {
  solana balance "$AUTH" --url devnet 2>/dev/null | awk '{print $1}'
}

funded_enough() {
  python3 -c "import sys; sys.exit(0 if float(sys.argv[1]) >= $NEEDED_SOL else 1)" "$1" 2>/dev/null
}

stamp() { date -u +%H:%M:%S; }

start=$(date +%s)
deadline=$(( start + RUN_MINUTES * 60 ))
attempt=0

echo "[$(stamp)Z] airdrop loop: need ${NEEDED_SOL} SOL for $PROGRAM, running ${RUN_MINUTES}m"

while [ "$(date +%s)" -lt "$deadline" ]; do
  attempt=$(( attempt + 1 ))
  current="$(balance)"

  if [ -n "$current" ] && funded_enough "$current"; then
    echo "[$(stamp)Z] attempt $attempt: already funded at $current SOL"
    break
  fi

  if [ -n "$current" ]; then
    echo "[$(stamp)Z] attempt $attempt: balance $current SOL, requesting 2 SOL"
  else
    echo "[$(stamp)Z] attempt $attempt: balance unavailable, requesting 2 SOL"
  fi
  solana airdrop 2 "$AUTH" --url devnet 2>&1 | tail -1

  after="$(balance)"
  if [ -n "$after" ]; then
    echo "[$(stamp)Z]   balance now: $after"
  fi

  if funded_enough "$after"; then
    echo "[$(stamp)Z] FUNDED after $attempt attempt(s)"
    break
  fi

  # Never sleep past the deadline.
  if [ $(( $(date +%s) - start + 60 )) -ge "$deadline" ]; then
    break
  fi
  sleep 60
done

current="$(balance)"
echo "[$(stamp)Z] final balance: ${current:-unknown} SOL (need ${NEEDED_SOL})"

if ! funded_enough "$current"; then
  echo "[$(stamp)Z] NOT FUNDED after $attempt attempt(s) / ${RUN_MINUTES}m."
  echo "The payout fix remains UNDEPLOYED. Program $PROGRAM is still vulnerable."
  exit 1
fi

echo "[$(stamp)Z] deploying the fixed program to $PROGRAM"
out="$(solana program deploy --url devnet \
        --keypair /root/.config/solana/id.json \
        --program-id "$ROOT/target/devnet/deathclock-keypair.json" \
        "$ROOT/target/deploy/deathclock.so" 2>&1)"
echo "$out" | tail -8

if echo "$out" | grep -qiE "Program Id: $PROGRAM"; then
  echo "[$(stamp)Z] DEPLOY OK -- confirm the on-chain loader slot before trusting it"
  exit 0
fi

echo "[$(stamp)Z] DEPLOY DID NOT REPORT SUCCESS -- verify by hand"
echo "$out" | tail -20
exit 1
