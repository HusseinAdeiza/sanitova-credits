#!/usr/bin/env bash
# Drains the devnet program keypairs to (near) zero.
#
# A program account must not already exist on-chain: even a 0-byte account
# owes the rent-exempt minimum, so once a keypair has been funded it can
# never be turned into a program at that address. `solana program deploy`
# then fails with "is not an upgradeable program or already in use".
#
# So the sequence is: drain to the rent floor -> deploy immediately. Never
# leave a program keypair funded between runs.
set -uo pipefail

RPC="${DEATHCLOCK_RPC:-devnet}"
AUTH="${DEATHCLOCK_AUTHORITY:-86ab21NszLjrmiipVvWfwoKmhJQ7Drpn5w5TxDnXvWKv}"
AUTH_KP="${DEATHCLOCK_AUTHORITY_KP:-/root/.config/solana/id.json}"
ROOT="/workspace"
# Rent-exempt minimum for a 0-byte account, plus fee headroom.
KEEP="0.002"

for p in verifier_router groth_16_verifier deathclock; do
  kp="$ROOT/target/devnet/$p-keypair.json"
  id="$(solana-keygen pubkey "$kp")"
  bal="$(solana balance "$id" --url "$RPC" | awk '{print $1}')"
  echo "--- $p $id  bal=$bal"

  # The account must not hold data, or it is already a program/buffer.
  whole="$(echo "$bal" | cut -d. -f1)"
  frac="$(echo "$bal" | cut -d. -f2 | cut -c1-3)"
  if [ "$whole" = "0" ] && [ "${frac:-0}" -lt 2 ] 2>/dev/null; then
    echo "    already drained"
    continue
  fi
  # Send everything down to $KEEP.
  if [ "$whole" -gt 1 ] 2>/dev/null; then
    amt="$((whole-1)).99"
  else
    amt="0"
  fi
  if [ "$amt" = "0" ]; then
    echo "    below 1 SOL and below the drain threshold; leaving $bal"
    continue
  fi
  solana transfer "$AUTH" "$amt" --url "$RPC" --keypair "$kp" --fee-payer "$kp" 2>&1 \
    | grep -iE "signature|error" | head -1 | sed 's/^/    /'
  echo "    now: $(solana balance "$id" --url "$RPC" | awk '{print $1}')"
done

echo "authority: $(solana balance "$AUTH" --url "$RPC" | awk '{print $1}') SOL"
