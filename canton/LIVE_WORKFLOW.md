# Live local issuance and inspection

Start the Canton sandbox as documented in README.md, then run from the project root:

```bash
node backend/scripts/start-local-canton.js
```

Do not run another API on port 4000 simultaneously. Start the frontend with `npm run start:frontend`.

The explicit local launcher maps the existing active Alice issuer, Clara inspector, and David regulator accounts to actual sandbox parties. It saves non-secret party identifiers and user IDs in `canton/local-app-parties.json`. Do not edit those mappings casually or use this launcher with production/customer accounts. Production mode is refused. If the sandbox is reset, reconcile saved mappings before restarting; automatic reallocation/recovery is not implemented.

## Browser workflow

1. Sign in as Alice and choose **Canton Issuance**. Enter a title and issue. Copy the confirmed contract ID.
2. Sign out. Sign in as Clara and choose **Canton Inspection**.
3. Paste the current contract ID, select Verified, and submit. Canton executes UpdateStatus as Clara's configured party. Save the replacement contract ID and update ID.

4. Return to Alice, open **Canton Transfers**, paste the replacement asset contract ID, and select Bob from the approved recipients. Submit the proposal.
5. Sign in as Bob, open **Canton Transfers**, review the incoming proposal, check the custody consent box, and accept. Save the replacement asset contract and update IDs.

The launcher now also maps Bob's active holder account. Recipient party IDs and acting parties come from server configuration, never browser input. Proposing consumes the asset contract and locks inspection until acceptance or issuer cancellation. To withdraw a pending proposal, Alice opens **Canton Transfers**, saves/clears any previous receipt, refreshes the inbox, checks **I confirm withdrawal of this proposal**, and clicks **Cancel proposal**. Cancellation restores the previous holder and asset data under a new contract ID; it cannot undo an already accepted transfer. Save the replacement receipt before closing the tab.

These operations remain independent of the older PostgreSQL asset screens. A separate durable PostgreSQL projection worker is now available; see [PROJECTION.md](PROJECTION.md). The Canton Records screen exposes active contracts and party-scoped create/archive events. The older Audit Trail and dashboard remain database-only. There is no inspection inbox yet. Transfer inboxes query the actual ledger with party-scoped filters and snapshot pagination. Pending/confirmed transfer receipts survive a reload within the tab; uncertain submissions are not automatically retried. Receipts are not proof of current state forever; later updates can replace their contracts.

Transfer checks: `node --test backend/scripts/ledger-transfer-test.js` and, from frontend, `npx playwright test tests/ledger-transfer.spec.js --workers=1`. The transfer browser test uses server-generated authentication fixtures for existing Alice/Bob accounts, the running API, and real ledger writes; it does not test password login. Other browser tests cover real login. Tests leave development contracts behind.

## Verification

```bash
node --test backend/scripts/ledger-issuance-test.js
cd frontend
npx playwright test tests/ledger-live.spec.js --workers=1
```

The live browser test uses the regular Vite proxy and running API, with real logins and real ledger writes, not intercepted responses. It leaves test contracts on the development ledger. The API integration test checks role rejection, extra-party-field rejection, real replacement contract creation, and stale-contract rejection.

## Limitations

The local sandbox has no production ledger authentication. Server-side mappings restrict what this application submits, but deployment requires participant authentication and identity review. Permission and state rules are also enforced by the Daml contract. Unexpected ledger failures return an unconfirmed outcome; do not blindly retry. Durable command recovery, idempotent response replay, persistent inspection receipts and approved state transitions remain future work. Durable PostgreSQL synchronization is implemented for the local workflow; production operations remain a separate release gate.
