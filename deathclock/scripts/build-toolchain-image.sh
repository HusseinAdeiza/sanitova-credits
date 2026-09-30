# Builds the sanitova-solana image used for all DeathClock Rust/Anchor work.
#
# Adds the Docker CLI to the Solana toolchain image. RISC Zero's Groth16 proving
# is Docker-only (risc0-groth16 shells out to
# `docker run risczero/risc0-groth16-prover`), so the build container needs a
# `docker` binary and a mounted host socket to reach the host daemon.
set -euo pipefail

IMAGE="${1:-sanitova-solana}"

if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  if docker run --rm "$IMAGE" docker --version >/dev/null 2>&1; then
    echo "$IMAGE already has the Docker CLI; nothing to do."
    exit 0
  fi
else
  echo "Base image $IMAGE not found; build or pull it first." >&2
  exit 1
fi

docker build --tag "$IMAGE" - <<'DOCKERFILE'
FROM sanitova-solana
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg; \
    install -m 0755 -d /etc/apt/keyrings; \
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg; \
    chmod a+r /etc/apt/keyrings/docker.gpg; \
    echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" > /etc/apt/sources.list.d/docker.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends docker-ce-cli; \
    rm -rf /var/lib/apt/lists/*; \
    docker --version
DOCKERFILE

echo "Rebuilt $IMAGE with the Docker CLI."
