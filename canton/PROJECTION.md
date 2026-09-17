# Local Canton PostgreSQL projection

Apply additive migrations from the project root with `node backend/src/db/init.js`.
Start the worker with `node backend/scripts/sync-canton.js`. Use `--once` to process one bounded page and exit normally. The worker is separate from the API; starting the API alone does not start synchronization.

The default `local-app` source reads approved parties from `canton/local-app-parties.json`. For an isolated source, set both `CANTON_PROJECTION_SOURCE` and `CANTON_PROJECTION_PARTIES` (a JSON array of party identifiers). Production mode is refused. This is an unauthenticated local sandbox adapter, not a production deployment.

## Stored records

- `canton_projection_sources`: participant identity, immutable party scope, committed offset and last successful sync time.
- `canton_contracts`: contract payloads, creation references and archive offsets. An unarchived record represents active state at the checkpoint, not necessarily at the current ledger end.
- `canton_events`: ledger create/archive evidence keyed by source, update ID and node ID. These are ACS events, not human-readable business action labels.

Each page uses a PostgreSQL transaction and per-source lock. Event writes, archive changes and the checkpoint commit together. Duplicate replay does not create duplicate events or resurrect archived contracts. A fresh worker resumes from the stored checkpoint, including changes committed while the worker was down. It does not depend on HTTP command receipts.

The worker queries ascending bounded ledger update pages for ComplianceAsset and TransferProposal only. It polls every three seconds once caught up. Errors stop the worker with a nonzero exit; fix the cause and restart. It does not silently reset checkpoints. Participant changes, party-scope changes, pruning beyond the checkpoint and a ledger end behind the checkpoint are rejected.

## Records API

`GET /api/ledger/records` and `GET /api/ledger/records/events` expose this read model to authenticated accounts. Visibility is scoped to the account's server-assigned party (row witnesses), never a client-supplied party or source. Responses carry the checkpoint offset, sync time and a `stale` flag (checkpoint older than 30 seconds). Uninitialized or stale-scope projections return 503 rather than an empty 200. The Canton Records screen renders both views; PostgreSQL BIGINT offsets arrive as strings end to end.

## Verification

`node --test --test-timeout=15000 backend/scripts/ledger-projection-test.js`

This integration test writes real development ledger contracts and uses an isolated PostgreSQL source. It checks fresh-process recovery, archive/create transitions, duplicate replay, scope-change rejection and atomic rollback after a forced database failure. The failure test temporarily installs a constraint restricted to its unique source and removes it afterward. Run on development databases only; ledger test contracts remain behind.

## Boundaries

This read model is not yet exposed through the browser or legacy audit routes. Legacy PostgreSQL assets remain separate. Do not expose raw projection tables as a public API: queries must enforce the authenticated user's approved party and event visibility, and report checkpoint freshness.

Cross-synchronizer reassignment, schema/package upgrades, pruning recovery, fully reliable ledger-reset detection when participant identity is reused, production authentication, process supervision and write-command reconciliation remain unsupported. Party onboarding requires a reviewed new projection source/backfill rather than mutating an existing source's scope.
