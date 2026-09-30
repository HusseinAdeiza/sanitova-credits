#!/usr/bin/env bash
# Deploys the three DeathClock programs to devnet at known addresses.
#
# THE ARGUMENT CONTRACT (each of these cost a wasted deploy to learn):
#
#  1. This image ships solana-cli 4.2.2:
#         solana program deploy [FLAGS] [OPTIONS] [PROGRAM_FILEPATH]
#     There is NO positional program-keypair argument. `--keypair` is the
#     FEE PAYER, not the program id -- using it that way makes the CLI mint
#     a throwaway program keypair and deploy to a random address, which it
#     then reports as "Program Id: <unrelated>". The target must be passed
#     as `--program-id <ID>`.
#
#  2. NEVER fund the program keypair before deploying. Any transfer to that
#     address CREATES the account, and an existing account can never become a
#     program account -- the loader rejects it with
#     "is not an upgradeable program or already in use", because even a
#     0-byte account owes the rent-exempt minimum. The rent must come from
#     the fee payer's balance, not from a pre-funded program address.
#
#  3. A signature is NOT proof of deployment. The funding transfer and the
#     deploy each print one. Every run verifies with getAccountInfo and only
#     reports success when executable=true AND owner=BPFLoaderUpgradeab1.
set -uo pipefail

RPC="${DEATHCLOCK_RPC:-devnet}"
AUTH="${DEATHCLOCK_AUTHORITY:-86ab21NszLjrmiipVvWfwoKmhJQ7Drpn5w5TxDnXvWKv}"
AUTH_KP="${DEATHCLOCK_AUTHORITY_KP:-/root/.config/solana/id.json}"
ROOT="/workspace"
VEND="$ROOT/vendor/risc0-solana/solana-verifier"
LOADER="BPFLoaderUpgradeab1e11111111111111111111111"
RPC_URL="https://api.devnet.solana.com"

program_state() {
  local info exe owner
  info="$(curl -s -X POST "$RPC_URL" -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getAccountInfo\",\"params\":[\"$1\",{\"encoding\":\"jsonParsed\"}]}")"
  if ! echo "$info" | grep -q '"value":{'; then echo "absent false -"; return; fi
  exe="$(echo "$info" | grep -o '"executable":[a-z]*' | head -1 | cut -d: -f2)"
  owner="$(echo "$info" | grep -o '"owner":"[A-Za-z0-9]*"' | head -1 | cut -d'"' -f4)"
  echo "present ${exe:-false} ${owner:--}"
}

fail=0
for p in verifier_router groth_16_verifier deathclock; do
  kp="$ROOT/target/devnet/$p-keypair.json"
  id="$(solana-keygen pubkey "$kp")"
  case "$p" in
    verifier_router|groth_16_verifier) so="$VEND/target/deploy/$p.so" ;;
    *) so="$ROOT/target/deploy/$p.so" ;;
  esac

  echo "############ $p -> $id ############"
  if [ ! -f "$so" ]; then
    echo "  MISSING ARTIFACT: $so"; fail=1; echo; continue
  fi
  echo "  elf: $so ($(stat -c%s "$so") bytes)"
  echo "  authority balance: $(solana balance "$AUTH" --url "$RPC" | awk '{print $1}') SOL"

  read -r _e _x _o <<<"$(program_state "$id")"
  if [ "$_e" = "present" ]; then
    if [ "$_x" = "true" ] && [ "$_o" = "$LOADER" ]; then
      echo "  ALREADY DEPLOYED and executable -- nothing to do."; echo; continue
    fi
    echo "  BLOCKED: account exists (executable=$_x owner=$_o) but is not a program."
    echo "          An account that has ever received lamports can never"
    echo "          become a program account. Fresh keypair required."
    fail=1; echo; continue
  fi
  echo "  address unused on-chain: OK"
  echo "  program keypair balance: $(solana balance "$id" --url "$RPC" | awk '{print $1}') (must be 0)"

  # Deploy. The contract (solana-cli 4.2.2):
  #   --program-id accepts a PATH TO A KEYPAIR FILE, not a bare pubkey --
  #   "Address is one of: a path to a keypair file, a hyphen, ASK, or a
  #   hardware wallet url". Passing the keypair path is what makes the CLI
  #   sign for the program account; without a keypair it mints a random
  #   address. --keypair is the fee payer, and the loader charges the
  #   rent-exempt deposit to it while creating the program account, so the
  #   program address must never be funded beforehand: any lamport sent
  #   there creates an account that can never become a program.
  out="$(solana program deploy --url "$RPC" --keypair "$AUTH_KP" \
          --program-id "$kp" "$so" 2>&1)"

  read -r _e _x _o <<<"$(program_state "$id")"
  if [ "$_x" = "true" ] && [ "$_o" = "$LOADER" ]; then
    echo "  VERIFIED on-chain: executable=true, owner=BPFLoaderUpgradeab1"
    echo "$out" | grep -iE "signature" | head -2 | sed 's/^/    /'
  else
    echo "  FAILED (executable=$_x owner=$_o)"
    echo "$out" | grep -viE "^\s*$|=====|^To resume|^ *\[BUFFER|^ *\`solana|recover|12-word|^\s+[a-z]+ [a-z]+ [a-z]+ " \
      | tail -10 | sed 's/^/    /'
    fail=1
  fi
  echo
done

echo "authority balance: $(solana balance "$AUTH" --url "$RPC" | awk '{print $1}') SOL"
exit $fail
