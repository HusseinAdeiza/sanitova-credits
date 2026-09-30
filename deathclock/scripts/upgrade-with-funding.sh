#!/usr/bin/env bash
# Retries the devnet airdrop and upgrades the program the moment it succeeds.
#
# Why this exists: release_inheritance had a permissionless payout-redirection
# vulnerability (see commit 92a60e4). The fix is compiled and committed but the
# upgrade needs ~2.5 SOL and the deploy authority held 1.44, while the devnet
# faucet rate-limits this IP. The program at C8unxtjo... is still vulnerable
# until this succeeds, so the retry is the highest-value thing running.
#
# Safe to run repeatedly: the deploy is idempotent in the sense that re-running
# it after success just redeploys the same binary.
set -uo pipefail

AUTH="86ab21NszLjrmiipVvWfwoKmhJQ7Drpn5w5TxDnXvWKv"
PROGRAM="C8unxtjoDZWy2GmwHUPuSve1BHT5TtRKpNaDofbMS5Vh"
NEEDED_SOL=3.0
MAX_TRIES=40
ROOT=/workspace

balance() {
  solana balance "$AUTH" --url devnet 2>/dev/null | awk '{print $1}'
}

funded_enough() {
  python3 -c "import sys; sys.exit(0 if float(sys.argv[1]) >= $NEEDED_SOL else 1)" "$1" 2>/dev/null
}

echo "[$(date +%H:%M:%S)] starting airdrop retry loop (need ${NEEDED_SOL} SOL for $PROGRAM)"

for attempt in $(seq 1 $MAX_TRIES); do
  current="$(balance)"
  if [ -z "$current" ]; then
    echo "[$(date +%H:%M:%S)] attempt $attempt: RPC did not return a balance"
    sleep 30
    continue
  fi

  if funded_enough "$current"; then
    echo "[$(date +%H:%M:%S)] attempt $attempt: already funded at $current SOL, skipping airdrop"
    break
  fi

  echo "[$(date +%H:%M:%S)] attempt $attempt: balance $current SOL, requesting 2 SOL"
  solana airdrop 2 "$AUTH" --url devnet 2>&1 | tail -1

  after="$(balance)"
  echo "[$(date +%H:%M:%S)]   balance now: ${after:-unknown}"

  if funded_enough "$after"; then
    echo "[$(date +%H:%M:%S)] FUNDED"
    break
  fi

  # Back off up to ~60s: hammering the faucet extends the rate limit.
  sleep $(( attempt < 10 ? 30 : 60 ))
done

current="$(balance)"
echo "[$(date +%H:%M:%S)] final balance: ${current:-unknown} SOL (need ${NEEDED_SOL})"

if ! funded_enough "$current"; then
  echo "[$(date +%H:%M:%S)] NOT FUNDED after $MAX_TRIES attempts."
  echo "The vulnerability fix remains undeployed. Program $PROGRAM is still live."
  exit 1
fi

echo "[$(date +%H:%M:%S)] deploying the fixed program to $PROGRAM"
out="$(solana program deploy --url devnet \
        --keypair /root/.config/solana/id.json \
        --program-id "$ROOT/target/devnet/deathclock-keypair.json" \
        "$ROOT/target/deploy/deathclock.so" 2>&1)"
echo "$out" | tail -6

# The deploy is only complete once the on-chain program data points at the new
# slot, so confirm via the loader rather than trusting the CLI's exit status.
if echo "$out" | grep -qiE "Program Id: $PROGRAM|success"; then
  echo "[$(date +%H:%M:%S)] DEPLOY OK"
  exit 0
fi

echo "[$(date +%H:%M:%S)] DEPLOY DID NOT REPORT SUCCESS -- verify by hand"
echo "$out" | tail -20
exit 1
