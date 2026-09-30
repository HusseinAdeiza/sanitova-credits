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

The app is a standard Next.js 14 project, so Vercel needs no custom build
settings. For a local production check:

```bash
cd app
npm run build
npm run start
```

### Configuration

No environment variables are required: every value in
`src/utils/constants.ts` and `src/utils/verifier.ts` defaults to the verified
devnet deployment. `.env.example` documents each variable plus the localnet
overrides. Set them only when targeting another cluster:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_PROGRAM_ID` | DeathClock program address |
| `NEXT_PUBLIC_ROUTER_PROGRAM_ID` | RISC Zero `verifier_router` |
| `NEXT_PUBLIC_GROTH16_VERIFIER_PROGRAM_ID` | `groth_16_verifier` |
| `NEXT_PUBLIC_RPC_URL` | RPC endpoint |
| `NEXT_PUBLIC_NETWORK` | `devnet` or `localnet`, for explorer links |

None are secret. The app signs through Phantom and never handles a private
key, so nothing sensitive belongs in this project's environment.

### The URL

`https://deathclock.vercel.app` is **already taken** by an unrelated project
("100 Year Death Clock Wheel" — a literal countdown widget, not this
protocol). It cannot be claimed, and the Colosseum submission form lists it as
the project website, so it needs correcting there.

A subdomain is only reserved once a project claims it, so a 404 does not
guarantee availability until a deploy actually succeeds.

**The live site is https://deathclock-protocol.vercel.app** (team
`mabera-labs`, production, verified serving). Use that URL in the Colosseum
submission form in place of the taken one. Attaching a custom domain would
be better still.

### Deploying

```bash
cd app
npx vercel login      # or: npx vercel login --github
npx vercel --prod
```

### Verifying the deploy

Do not trust the deploy log: a successful build says nothing about whether the
page talks to a real program. Load the site, connect Phantom, and confirm the
vault address is one actually initialised on devnet and that its balance and
state load. A site pointed at the wrong program id still derives a plausible
PDA and reports "not initialised" forever, so only real vault state proves the
wiring.

### Heartbeats on the live site

The site submits real Groth16 seals and will not fabricate one. A heartbeat
needs a `seal.json` from the proving pipeline:

```bash
./scripts/prove-heartbeat.sh
```

Paste that file's contents into the heartbeat panel. The browser signs the
transaction; the prover does the cryptography. This is deliberate — the
program rejects anything that is not a real proof, so a browser-side "demo
proof" button would appear to work while producing nothing the chain accepts.
