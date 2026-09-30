#!/usr/bin/env bash
# Adds the Docker CLI (no daemon) to the sanitova-solana image.
#
# RISC Zero's Groth16 proving is Docker-only: risc0-groth16 shells out to
# `docker run risczero/risc0-groth16-prover` to wrap the p254 STARK seal into a
# BN254 proof. Inside a build container there is no CLI, so it reports
# "Please install docker first" even when the host daemon is reachable.
set -euo pipefail

set -x
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y --no-install-recommends ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y --no-install-recommends docker-ce-cli
  rm -rf /var/lib/apt/lists/*
fi
docker --version
