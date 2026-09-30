#!/usr/bin/env bash
# Resets the devnet program accounts.
#
# The vendored Anchor.toml originally overrode declare_id! with the upstream
# localnet IDs, so early deploys wrote programs under 2CYCBtL../Cct3GAKE../
# BF1Y36xB.. and set each one's upgrade authority to the devnet ID. That
# circular state blocks a clean deploy, and those accounts hold nothing but
# stale binaries, so we close them first.
#
# Each close must be signed by the *devnet* keypair (it is the authority),
# not the fee payer.
set -uo pipefail

RPC="${DEATHCLOCK_RPC:-devnet}"
AUTH="${DEATHCLOCK_AUTHORITY:-86ab21NszLjrmiipVvWfwoKmhJQ7Drpn5w5TxDnXvWKv}"
AUTHORITY_KP="${DEATHCLOCK_AUTHORITY_KP:-/root/.config/solana/id.json}"

# program account, devnet keypair that owns it
STALE=(
  "2CYCBtLHLrd13S9AvvZ73SS691bfzNM7uQoayRtmeFT3|target/devnet/verifier_router-keypair.json"
  "Cct3GAKER29JFHJTMgcgNkiGTzza9y4sEdBceiuRfBGj|target/devnet/groth_16_verifier-keypair.json"
  "BF1Y36xBRoQVB7z3gi5rSnciAHwbn5yMn8ToSnZ8Woo|target/devnet/deathclock-keypair.json"
)

echo "### closing stale program accounts on $RPC"
for entry in "${STALE[@]}"; do
  id="${entry%%|*}"
  kp="${entry##*|}"
  if [ ! -f "$kp" ]; then
    echo "  $id: SKIP (missing $kp)"
    continue
  fi
  echo "--- $id  (authority keypair: $kp)"
  # Fund the signer so it can pay the close fee.
  solana transfer "$id" 0.05 --url "$RPC" --keypair "$AUTHORITY_KP" \
    --allow-unfunded-recipient --fee-payer "$AUTHORITY_KP" >/dev/null 2>&1
  # --bypass-warning is safe here: these are throwaway accounts holding stale
  # binaries from the Anchor.toml override bug. We will never reuse their IDs.
  out="$(solana program close "$id" --url "$RPC" --keypair "$kp" --bypass-warning 2>&1)"
  # `solana program close` prints "Closed Program Id <id>, N SOL reclaimed".
  # It does NOT print a signature line, so match on the reclaim text.
  if echo "$out" | grep -qi "closed program id"; then
    echo "    closed: $(echo "$out" | grep -i 'closed program id' | head -1 | tr -s ' ')"
  else
    # Full error: never truncate, the reason is always in here.
    echo "    FAILED:"
    echo "$out" | sed 's/^/      /' | head -8
  fi
done

echo
echo "### remaining state"
for entry in "${STALE[@]}"; do
  id="${entry%%|*}"
  bal="$(solana balance "$id" --url "$RPC" 2>/dev/null | awk '{print $1}')"
  echo "  $id  balance=${bal:-?}"
done
echo "  authority $AUTH  balance=$(solana balance "$AUTH" --url "$RPC" 2>/dev/null | awk '{print $1}')"
