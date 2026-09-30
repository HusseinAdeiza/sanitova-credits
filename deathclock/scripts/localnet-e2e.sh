#!/usr/bin/env bash
# Localnet end-to-end check for DeathClock.
#
# Brings up a validator with all three programs loaded, wires the RISC Zero
# verifier router, then submits a heartbeat carrying a REAL Groth16 receipt.
# The transaction only succeeds if verifier_router dispatches to
# groth_16_verifier and the BN254 pairing check passes on-chain.
#
# Programs are injected at genesis (--bpf-upgradeable-program) rather than
# deployed with `solana program deploy`, because a fresh validator rejects the
# executables with "Detected sbpf_version required by the executable which are
# not enabled". add_verifier also requires the verifier to live on the
# UPGRADEABLE loader with the router PDA as its upgrade authority, which
# genesis injection provides.
#
# Usage: bash scripts/localnet-e2e.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Single source of truth: scripts/program-ids.ts. These must match the
# declare_id! constants compiled into the binaries.
read_ids() {
  local out
  out="$(ROUTER_PROGRAM_ID=x npx tsx -e '
    const ids = require("./scripts/program-ids");
    console.log([ids.ROUTER_PROGRAM_ID, ids.GROTH16_VERIFIER_PROGRAM_ID,
                 ids.DEATHCLOCK_PROGRAM_ID, ids.ROUTER_STATE].join(" "));
  ')" || { echo "could not read scripts/program-ids.ts" >&2; exit 1; }
  ROUTER_PROGRAM_ID="$(echo "$out" | cut -d' ' -f1)"
  GROTH16_VERIFIER_PROGRAM_ID="$(echo "$out" | cut -d' ' -f2)"
  DEATHCLOCK_PROGRAM_ID="$(echo "$out" | cut -d' ' -f3)"
  ROUTER_STATE="$(echo "$out" | cut -d' ' -f4)"
}
read_ids
DEATHCLOCK_AUTHORITY="86ab21NszLjrmiipVvWfwoKmhJQ7Drpn5w5TxDnXvWKv"
SELECTOR="73c457ba"
# The vendored groth_16_verifier uses the legacy alt_bn128_pairing syscall,
# which newer Agave (4.x) no longer services -- it returns an error rather
# than a pairing result, surfacing as VerifierError::PairingError. Pin the
# validator to 1.18.26, where the syscall is live.
VALIDATOR_IMAGE="${VALIDATOR_IMAGE:-solanalabs/solana:v1.18.26}"
# add_verifier requires the verifier program's LoaderV3 upgrade authority to
# already be the router PDA, so it is baked in at genesis via the third
# --upgradeable-program argument rather than transferred afterwards.

# Set DEATHCLOCK_RPC to an already-running validator (e.g. the VPS) to skip
# starting one locally. The local path is flaky: the validator is OOM-killed by
# the memory-hungry Groth16 wrap, and its ledger cannot live on a Windows bind
# mount (RocksDB mmap fails, so it answers RPC but never produces blocks).
DEATHCLOCK_RPC="${DEATHCLOCK_RPC:-http://127.0.0.1:8899}"

# `solana` is not installed on the Windows host, so query the RPC over HTTP
# instead. Reaches the VPS through an SSH tunnel on 127.0.0.1:8899.
rpc() {
  case "$1" in
    slot)
      curl -s -m 10 -X POST "$DEATHCLOCK_RPC" -H 'Content-Type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' \
        | sed -n 's/.*"result":\([0-9]*\).*/\1/p'
      ;;
    account)
      curl -s -m 10 -X POST "$DEATHCLOCK_RPC" -H 'Content-Type: application/json' \
        -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getAccountInfo\",\"params\":[\"$2\",{\"encoding\":\"base64\"}]}" \
        | head -c 400; echo
      ;;
    program)
      # "program show" is a CLI-only view; the program account is a proxy for it.
      rpc account "$2"
      ;;
    *)
      echo "rpc: unsupported subcommand $1" >&2; return 1
      ;;
  esac
}

if [[ -n "${DEATHCLOCK_RPC_EXTERNAL:-}" ]]; then
  echo "==> using the external validator at $DEATHCLOCK_RPC"
  cleanup() { :; }
  trap cleanup EXIT
else
# The ledger must live inside the container's own filesystem, not on the
# Windows bind mount: RocksDB's mmap does not work reliably on a Docker Desktop
# bind mount from Windows, and the validator stalls without producing blocks.
rm -rf test-ledger

echo "==> starting validator with three programs ($VALIDATOR_IMAGE)"
docker run -d --rm --name deathclock-validator \
  --entrypoint solana-test-validator \
  --security-opt seccomp=unconfined \
  --memory 4g \
  -p 8899:8899 -p 8900:8900 \
  -v "${ROOT}:/workspace" \
  -w /workspace \
  "${VALIDATOR_IMAGE}" \
    --reset \
    --ledger /tmp/deathclock-ledger \
    --upgradeable-program /workspace/target/deploy/deathclock-keypair.json /workspace/target/deploy/deathclock.so "$DEATHCLOCK_AUTHORITY" \
    --upgradeable-program /workspace/target/deploy/verifier_router-keypair.json /workspace/target/deploy/verifier_router.so "$DEATHCLOCK_AUTHORITY" \
    --upgradeable-program /workspace/target/deploy/groth_16_verifier-keypair.json /workspace/target/deploy/groth_16_verifier.so "$ROUTER_STATE"

cleanup() {
  echo "==> stopping validator"
  docker rm -f deathclock-validator >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> waiting for the validator"
# Reachability alone is not enough: with a ledger on a bind mount the RPC
# answers but no blocks are ever produced, so poll the slot height too.
for _ in $(seq 1 60); do
  if docker exec deathclock-validator solana --url http://127.0.0.1:8899 slot 2>/dev/null | grep -qE '^[0-9]+'; then
    break
  fi
  sleep 2
done
docker exec deathclock-validator solana --url http://127.0.0.1:8899 cluster-version
echo "current slot: $(docker exec deathclock-validator solana --url http://127.0.0.1:8899 slot 2>&1 | head -1)"
fi


echo "==> checking the programs are executable"
for pair in "deathclock:${DEATHCLOCK_PROGRAM_ID}" "verifier_router:${ROUTER_PROGRAM_ID}" "groth_16_verifier:${GROTH16_VERIFIER_PROGRAM_ID}"; do
  name="${pair%%:*}"
  id="${pair##*:}"
  out="$(rpc account "$id" 2>&1 || true)"
  echo "$name ($id):"
  echo "$out" | head -3
done

# The upgrade-authority check is intentionally omitted: "solana program show"
# is CLI-only and no solana CLI is installed on the Windows host. If the
# authority is wrong, add_verifier fails loudly in the wiring step below.

echo
echo "==> wiring the verifier router"
npx tsx scripts/setup-router.ts

echo
echo "==> preparing a fixed owner keypair"
# The seal must be proven for this exact owner: the program recomputes
# SHA-256(owner || timestamp || nonce) and compares it to the journal.
OWNER_KEYPAIR="target/localnet-e2e-owner.json"
if [[ ! -f "$OWNER_KEYPAIR" ]]; then
  docker run --rm -v "${ROOT}:/workspace" -w /workspace sanitova-solana \
    solana-keygen new --no-bip39-passphrase --outfile "/workspace/$OWNER_KEYPAIR" >/dev/null
fi
OWNER_HEX="$(docker run --rm -v "${ROOT}:/workspace" -w /workspace sanitova-solana \
  solana-keygen pubkey "/workspace/$OWNER_KEYPAIR")"
# The guest commits over the raw 32 public-key BYTES, not the base58 text, so
# the prover needs the hex form of the same key.
OWNER_HEX="$(node -e "
const bs58 = require('bs58');
process.stdout.write(Buffer.from(bs58.decode('$OWNER_HEX')).toString('hex'));
")"
echo "owner: $OWNER_HEX"

echo
echo "==> pre-building the prover (keeps the proof inside the 300s freshness window)"
# Must use the same CARGO_TARGET_DIR volume as prove-heartbeat.sh, otherwise
# the pre-build populates a different cache and phase 1 recompiles from
# scratch, taking ~3.5 minutes and expiring the proof before submission.
docker run --rm \
  -v "${ROOT}:/workspace" \
  -v sanitova_solana_cargo:/root/.cargo \
  -v sanitova_risc0_home:/root/.risc0 \
  -v sanitova_solana_cache:/root/.cache/solana \
  -v "${ZK_TARGET_VOLUME:-sanitova_solana_zk_target}:/build-target" \
  -w /workspace \
  -e CARGO_TARGET_DIR=/build-target \
  -e INITIAL_OWNER="$DEATHCLOCK_AUTHORITY" \
  sanitova-solana \
  bash -lc "cargo build --release -p deathclock-zk --bin heartbeat-prover" >/dev/null

echo "==> proving a heartbeat (this takes a couple of minutes)"
bash scripts/prove-heartbeat.sh --owner "$OWNER_HEX"

# Proving runs two containers that are far heavier than the validator. Under
# memory pressure the validator can be OOM-killed mid-wrap, and because it is
# started with --rm the next command fails with a bare ECONNREFUSED that looks
# like a test bug. Check explicitly and say what actually happened.
if ! rpc slot >/dev/null 2>&1; then
  echo >&2
  echo "ERROR: the validator at $DEATHCLOCK_RPC is not answering after proving." >&2
  if [[ -z "${DEATHCLOCK_RPC_EXTERNAL:-}" ]]; then
    echo "       It most likely ran out of memory during the Groth16 wrap." >&2
    echo "       Last log lines:" >&2
    docker logs --tail 20 deathclock-validator 2>&1 | sed 's/^/       /' >&2 || true
  else
    echo "       Check the tmux session on the VPS: tmux attach -t validator" >&2
  fi
  exit 1
fi

echo
echo "==> running the on-chain E2E test"
npx ts-mocha -p ./tsconfig.json -t 1000000 programs/deathclock/tests/localnet-e2e.ts
