# DeathClock deployment

## Local / build-only

The Windows host does not have native Anchor support. Use the `sanitova-solana` image with persistent Cargo and Solana cache volumes:

```bash
docker run --rm \
  -v "$PWD:/workspace" \
  -v sanitova_solana_cargo:/usr/local/cargo/registry \
  -v sanitova_solana_cache:/root/.cache/solana \
  -w /workspace sanitova-solana bash -lc 'anchor build'
```

## Devnet

1. Install and configure Solana CLI for `devnet`.
2. Create or select a deploy wallet and fund it with devnet SOL.
3. Confirm the program keypair is in `target/deploy/deathclock-keypair.json` and keep it outside version control if it is replaced.
4. Run:

```bash
CLUSTER=devnet bash scripts/deploy.sh
```

The script intentionally does not rewrite `Anchor.toml` or `declare_id!` after deployment. Generate and review a fresh program keypair deliberately when a new deployment identity is required.

## Verification

```bash
PROGRAM_ID=$(solana address -k target/deploy/deathclock-keypair.json)
solana program show "$PROGRAM_ID" --url https://api.devnet.solana.com
solana program logs "$PROGRAM_ID" --url https://api.devnet.solana.com
```

## Frontend

Set the public RPC URL before building:

```bash
export NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
cd app
npm run build
npm run start
```

The current UI surface is verified as a production build. Live transaction wiring remains a release task until a deployed program ID and wallet integration are configured.
