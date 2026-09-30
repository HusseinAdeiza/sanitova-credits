#!/usr/bin/env bash
set -euo pipefail

CLUSTER="${CLUSTER:-devnet}"
KEYPAIR="${KEYPAIR:-target/deploy/deathclock-keypair.json}"

printf '\n DeathClock deploy\n'
printf ' Cluster: %s\n Program: %s\n\n' "$CLUSTER" "$KEYPAIR"
anchor build
anchor deploy --provider.cluster "$CLUSTER"
printf 'Program ID: '
solana address -k "$KEYPAIR"
printf '\nVerify the deployment with:\n  solana program show %s --url https://api.%s.solana.com\n' "$(solana address -k "$KEYPAIR")" "$CLUSTER"
