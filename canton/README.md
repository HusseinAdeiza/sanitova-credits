# Local Canton contract slice

## Verified scope

The Daml packages compile and three scripts have executed successfully against a real local Canton sandbox, not only the simulated IDE ledger:

- `Test:setup`: create, inspector verification, issuer transfer proposal, recipient acceptance, regulator query.
- `Test:permissions`: unrelated-party visibility, rejected unauthorized status changes/acceptance, and rejected reuse of an accepted proposal.
- `Test:cancelTransfer`: issuer cancellation restores custody and prevents subsequent acceptance.

The installed toolchain reports Canton 3.5.17; the project pins SDK 3.5.10. Compiled packages are under `main/.daml/dist` and `test/.daml/dist`.

## Commands (from repository root)

```bash
node canton/run.cjs build
node canton/run.cjs sandbox
```

Keep the sandbox running in its own terminal. Wait for `Canton sandbox is ready.` before running:

```bash
node canton/run.cjs test-ledger
```

For one script:

```bash
node canton/run.cjs test-ledger cancelTransfer
```

For the simulated ledger instead:

```bash
node canton/run.cjs test
```

The runner uses the bundled DPM and Java if available; `DPM_BIN` and `JAVA_HOME` can specify other installations. Sandbox ports are 6865 (Ledger API) and 7575 (JSON API). This sandbox is for local development only, not public deployment.

## Evidence and repeat runs

`ledger-test-results.json` contains results from the latest successful invocation. The runner removes the previous summary before starting tests, exits nonzero on a failed script, and aggregates actual script output files. `Test:setup` returns a real contract ID.

Each invocation supplies a random run ID for party hints. This prevents collisions on the existing sandbox; it does **not** isolate or clean up test state. Runs leave parties, transaction history, and active test contracts. Do not use this runner against a customer ledger. Run invocations serially because evidence filenames are shared.

Next test-harness improvement: a dedicated disposable sandbox with verified isolated storage and ports, owned and stopped by the test runner. Do not delete the running development ledger's data or assume an `--ephemeral` flag exists; this installed sandbox's help does not list that flag.

## First Express integration: local issuance

`POST /api/ledger/assets` now submits a real CreateCommand to the local Canton JSON API and returns its contract ID, update ID and offset. It requires an issuer JWT plus an operator-configured user-to-party assignment. The request accepts only assetId and title, never client-supplied actAs parties.

Run its integration test with the sandbox ready:

```bash
node --test backend/scripts/ledger-issuance-test.js
```

The test starts an isolated Express listener, allocates real test parties, verifies issuance and rejection cases, then closes the listener. It leaves ledger fixtures behind. The normal application is not automatically enabled: the route requires CANTON_LOCAL_ENABLED=true and CANTON_ISSUANCE_ASSIGNMENTS (a JSON object keyed by application user UUID, with issuer, inspector, and regulator party strings). It is disabled in production and is restricted to the loopback sandbox endpoint. This protects against accidentally using the sandbox adapter as production infrastructure.

The issuer UI now includes **Canton Issuance** at `/ledger-issuance`. It displays confirmed contract/update references and retains the latest pending/confirmed receipt in tab session storage. Pending or unknown outcomes are not automatically resubmitted. This storage is not authoritative audit history, durable idempotency, or a PostgreSQL projection.

`frontend/tests/ledger-ui.spec.js` exercises real browser login, issuance through an isolated Express listener, a real Canton response, receipt persistence across reload, and an unapproved-account rejection. Its browser API requests are forwarded to the real isolated listener, not mocked. Run from `frontend`: `npx playwright test tests/ledger-ui.spec.js --workers=1`. The regular API must be restarted with approved assignments to use this screen outside the test; the screen does not provision parties or enable the backend automatically.

Current limitations: mappings are operator configuration rather than persisted onboarding; no PostgreSQL projection exists yet. Stable command IDs are supplied, but durable idempotency, completion recovery, and duplicate response replay remain unimplemented. Ambiguous failures must be reconciled, not blindly resubmitted.

## Not yet integrated

The React application still uses PostgreSQL for transfers. This contract slice does not synchronize web-app users, asset IDs, or database rows with ledger parties/contracts. No public Canton network deployment has been performed.

Next application slice:

1. Map authenticated application identities to authorized ledger parties.
2. Submit create/status/transfer commands through a server-side ledger adapter.
3. Add recipient acceptance to the web workflow (do not impersonate a recipient to auto-accept).
4. Project committed ledger updates into PostgreSQL with checkpointing, retries, and deduplication; do not treat two independent writes as atomic.
5. Show ledger contract/transaction references in the UI and test the entire browser-to-ledger path.

## Contract limitations

A transfer proposal consumes the current asset contract until acceptance or cancellation; consumers must show a pending transfer, not a missing asset. The model has four statuses, while the current application has six. Status-transition policy, holder rights, evidence/metadata, expiry, durable deployment, and contract upgrade strategy still need product-level design and tests. Historical disclosure is not revoked by transferring custody.
