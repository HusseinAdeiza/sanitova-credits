# SanitovaCredits — Canton demo and recording script

**Target:** 5–7 minutes. Use synthetic demonstration titles only. Recording not yet produced.

## Preparation

Use the sandbox instructions in [canton/README.md](canton/README.md). From the project root, apply migrations with `node backend/src/db/init.js`. Seed only a disposable development database if accounts are missing; do not reseed a populated environment for each recording.

In separate terminals:

```bash
node backend/scripts/start-local-canton.js
node backend/scripts/sync-canton.js
npm run start:frontend
```

Do not start a second API on port 4000 if one is running. Open `http://127.0.0.1:5173`. Use existing local Alice, Clara, Bob and David accounts; keep passwords and tokens out of the recording. Allow the worker to catch up before demonstrating Canton Records. Confirm the checkpoint is recent; reload the screen to refresh it.

## Recording sequence

| Time | On screen | Narration / evidence |
|---|---|---|
| 0:00–0:30 | Login / title | “This is a local Canton workflow for inspection-record custody, not a permit or environmental-credit trading system.” |
| 0:30–1:15 | Alice → Canton Issuance | Enter a unique synthetic title, e.g. `Pilot rehearsal — facility A — run 1`. Issue and show the confirmed asset contract ID and update ID. Copy the contract reference. |
| 1:15–2:00 | Clara → Canton Inspection | Paste the current contract ID, choose Verified, submit. Explain that only the assigned inspector controls this choice. Save the replacement ID; the original is consumed. |
| 2:00–2:45 | Alice → Canton Transfers | Paste the replacement asset ID, select approved Bob, propose. Show the proposal receipt. Custody has not changed yet; inspection is locked while the proposal is pending. |
| 2:45–3:30 | Bob → Canton Transfers | Refresh inbox, review the matching title, check custody consent, accept. Show the replacement asset ID and holder party. |
| 3:30–4:30 | David → Canton Records | Show Active contracts, then Ledger events. Point out the checkpoint and actual contract/update/offset references. Oversight access is scoped to David's party, not every contract on the participant. |
| 4:30–5:00 | Summary | “Ledger state is projected into PostgreSQL with a durable checkpoint. Production identity, write recovery and evidence integrations remain work.” |

Optional extra minute: issue a separate asset, propose to Bob, save/clear the proposal receipt, refresh Alice's inbox, confirm withdrawal and cancel. Save the restored asset ID. Never try to cancel the already accepted transfer.

## Evidence to capture

- Unique demonstration title and issuance asset ID.
- Issuance, inspection, proposal and acceptance contract/update references.
- Bob's explicit consent and the final holder.
- David's records screen with checkpoint freshness and ledger events.
- Raw test output saved alongside the submission, clearly distinguished from the recording.

For proposal events, the current audit UI may fall back to a contract ID where a nested title is not resolved. Create/archive events are not a full business-action narrative or evidence of inspection truth.

## Failure handling

If a write returns an unknown outcome, stop that scenario and reconcile its command/contract reference. Do not click repeatedly or edit receipts to make the demo look successful. If synchronization is stale, show the warning, inspect the worker and resume only after recovery. Do not use database-only screens as a silent fallback for a failed Canton step.

## Before publishing

Watch the entire recording; verify readable IDs, visible consent, no credentials/personal data, no unexplained cuts around failed writes, and accurate local-network labeling. Confirm the organizer's video duration, format and submission fields before uploading. No upload or submission is authorized by this document.
