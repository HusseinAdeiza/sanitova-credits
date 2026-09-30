#!/usr/bin/env bash
# Proves a real DeathClock heartbeat end to end and writes a router-ready seal.
#
# Why this is a host-side script and not a single `cargo test`:
# RISC Zero's Groth16 wrap shells out to `docker run risczero/risc0-groth16-prover`
# and passes RISC0_WORK_DIR as the inner container's `-v` source. When that inner
# call is issued from INSIDE a build container, the host daemon resolves the path
# and cannot see the build container's filesystem, so the prover mounts an empty
# /mnt and aborts with:
#   nlohmann::json ... parse_error.101 ... unexpected end of input
#   Error: failed to load witness: failed to parse file: invalid magic number
# Mounting the Docker socket is not enough, and neither is pointing
# RISC0_WORK_DIR at a host path (the build container then cannot write to it).
# The only reliable split is to run the prover image from the host between the
# two halves of proving, which is what this script does:
#
#   phase1  (container)  STARK-prove -> target/risc0-work/{seal.r0,input.json}
#   groth16 (host)       run the prover image -> target/risc0-work/proof.json
#   phase2  (container)  proof.json -> target/risc0-work/seal.json
#
# Usage:
#   bash scripts/prove-heartbeat.sh [--owner HEX64] [--timestamp N] [--nonce HEX48]
set -euo pipefail

PROVER_IMAGE="${RISC0_GROTH16_PROVER_IMAGE:-risczero/risc0-groth16-prover:v2025-04-03.1}"
INITIAL_OWNER="${INITIAL_OWNER:-86ab21NszLjrmiipVvWfwoKmhJQ7Drpn5w5TxDnXvWKv}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Docker Desktop needs the host-side path for the prover image's bind mount.
WORK_DIR_HOST="${ROOT}/target/risc0-work"
# Compiling the zk host against /workspace/target means every artifact is
# written to the Windows bind mount, which takes ~3.5 minutes and blows the
# program's 300-second proof-freshness window. A Docker volume keeps the
# incremental cache on the container's own filesystem, so only the first run
# pays for compilation. target/risc0-work stays on the bind mount because the
# host-side Groth16 step has to see it.
ZK_TARGET_VOLUME="${ZK_TARGET_VOLUME:-sanitova_solana_zk_target}"

OWNER_HEX="4242424242424242424242424242424242424242424242424242424242424242"
TIMESTAMP="$(date +%s)"
NONCE_HEX="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner) OWNER_HEX="$2"; shift 2 ;;
    --timestamp) TIMESTAMP="$2"; TIMESTAMP_OVERRIDE="$2"; shift 2 ;;
    --nonce) NONCE_HEX="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

# The guest's reads are fixed-width, so a wrong length silently mis-parses.
if [[ ${#OWNER_HEX} -ne 64 ]]; then
  echo "--owner must be 64 hex chars (32 bytes), got ${#OWNER_HEX}" >&2
  exit 2
fi
if [[ ${#NONCE_HEX} -ne 48 ]]; then
  echo "--nonce must be 48 hex chars (24 bytes), got ${#NONCE_HEX}" >&2
  exit 2
fi

mkdir -p "$WORK_DIR_HOST"
rm -f "$WORK_DIR_HOST/proof.json" "$WORK_DIR_HOST/seal.json" "$WORK_DIR_HOST/heartbeat-input.json"

# The program only accepts a receipt within PROOF_MAX_AGE_SECONDS (300) of its
# timestamp, and the pipeline below (STARK + Groth16 wrap + submission) consumes
# most of that. Warm the build cache FIRST, then take the timestamp, so the
# clock starts when proving actually begins rather than at script start. Phase 1
# persists the input so phase 2 reproduces the same journal.
in_container() {
  # Run the already-built binary directly. Do NOT invoke cargo here: the zk
  # build script calls risc0_build::embed_methods(), which re-runs the guest
  # build on every invocation and so invalidates deathclock-zk-methods, forcing
  # a ~60s recompile of deathclock-zk each time. The warm-up below already
  # produced /build-target/release/heartbeat-prover, and the persistent volume
  # keeps it there between runs.
  docker run --rm \
    -v "${ROOT}:/workspace" \
    -v sanitova_solana_cargo:/root/.cargo \
    -v sanitova_risc0_home:/root/.risc0 \
    -v sanitova_solana_cache:/root/.cache/solana \
    -v "${ZK_TARGET_VOLUME}:/build-target" \
    -w /workspace \
    -e RISC0_PROVER=local \
    -e INITIAL_OWNER="$INITIAL_OWNER" \
    -e RISC0_WORK_DIR=/workspace/target/risc0-work \
    -e DEATHCLOCK_OWNER="$OWNER_HEX" \
    -e DEATHCLOCK_TIMESTAMP="${2:-$TIMESTAMP}" \
    -e DEATHCLOCK_NONCE="$NONCE_HEX" \
    sanitova-solana \
    bash -lc "test -x /build-target/release/heartbeat-prover || { echo 'prover binary missing; warm-up failed' >&2; exit 1; }; exec /build-target/release/heartbeat-prover $1"
}

# Compile first so the timestamp below is as close to proving as possible.
echo "==> warming the prover build cache"
docker run --rm \
  -v "${ROOT}:/workspace" \
  -v sanitova_solana_cargo:/root/.cargo \
  -v sanitova_risc0_home:/root/.risc0 \
  -v sanitova_solana_cache:/root/.cache/solana \
  -v "${ZK_TARGET_VOLUME}:/build-target" \
  -w /workspace \
  -e CARGO_TARGET_DIR=/build-target \
  -e INITIAL_OWNER="$INITIAL_OWNER" \
  sanitova-solana \
  bash -lc "cargo build --release -p deathclock-zk --bin heartbeat-prover" >/dev/null 2>&1 || true

echo
echo "==> phase 1: STARK proof"
# Re-take the clock immediately before proving, but never discard an explicit
# --timestamp. scripts/devnet-heartbeat.ts passes a future timestamp so the
# receipt lands inside the program's 300s window *at submission*, because the
# Groth16 wrap alone takes 300-450s. An unconditional `date +%s` here threw
# that argument away, so every devnet seal was born already stale and the
# program rejected it on arrival.
if [[ -z "${TIMESTAMP_OVERRIDE:-}" ]]; then
  TIMESTAMP="$(date +%s)"
else
  TIMESTAMP="$TIMESTAMP_OVERRIDE"
fi
NONCE_HEX="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
in_container phase1 "$TIMESTAMP"

echo
echo "==> groth16 wrap ($PROVER_IMAGE, run from the host)"
docker run --rm \
  -v "${WORK_DIR_HOST}:/mnt" \
  "$PROVER_IMAGE"

if [[ ! -f "$WORK_DIR_HOST/proof.json" ]]; then
  echo "prover image did not produce proof.json" >&2
  exit 1
fi
echo "proof.json: $(wc -c < "$WORK_DIR_HOST/proof.json") bytes"

echo
echo "==> phase 2: assemble the router seal"
in_container phase2

echo
echo "Done. Router-ready seal written to $WORK_DIR_HOST/seal.json"
