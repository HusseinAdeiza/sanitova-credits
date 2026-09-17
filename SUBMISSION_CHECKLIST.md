# Submission readiness checklist

## Written materials

- [x] [Business brief](BUSINESS_BRIEF.md): customer, use case, payer, Canton rationale and explicit validation gaps.
- [x] [Pilot plan](PILOT_PLAN.md): proposed participants, integrations, timeline, entry gates, measures and stop rules.
- [x] [Pitch](PITCH.md): local implementation claims separated from commercial hypotheses.
- [x] [Demo script](DEMO.md): actual Canton screens, consent, receipts and durable records.
- [x] README distinguishes the local Canton workflow from legacy PostgreSQL assets.
- [ ] Render the business brief into the organizer's required submission format and verify it fits one page; Markdown length alone does not prove pagination.

## Technical evidence

Existing session evidence: seven backend tests and nine browser tests passed in the preceding engineering run. During this documentation pass, `tests/ledger-live.spec.js` passed again: one browser test, real issuance and inspection. This is not a fresh-machine setup verification or proof of production security.

Reproduce backend checks from the root with the local API, PostgreSQL and Canton running:

```bash
node --test backend/scripts/ledger-records-test.js backend/scripts/ledger-projection-test.js backend/scripts/ledger-transfer-test.js backend/scripts/ledger-issuance-test.js backend/scripts/workflow-test.js
```

From `frontend/`:

```bash
npm run build
npx playwright test tests/ledger-records.spec.js tests/ledger-transfer.spec.js tests/ledger-live.spec.js tests/ledger-ui.spec.js tests/workflow.spec.js --workers=1 --reporter=list
```

Run only against development data. Tests leave local ledger/database records. Existing coverage comprises multiple scenarios; record a single continuous asset lifecycle for submission evidence rather than treating separate test passes as a continuous filmed run.

## Still required before submission

- [ ] Confirm registration, current organizer requirements, deadlines, network eligibility and submission fields directly with organizers.
- [ ] Complete a clean-machine install using only documented prerequisites; capture any missing steps. Do not erase the current development ledger to simulate this.
- [ ] Record the narrated workflow and review it for secrets, readable evidence and accurate local-network labeling.
- [ ] Publish or package the source as required, with credential/artifact review; no repository has been initialized or uploaded by this documentation pass.
- [ ] Verify the final video/source URLs and upload attachments; no submission has been sent.
- [ ] Obtain partner feedback or explicitly state that customer validation is pending.

## Claims not to make

No production deployment, signed customer, regulator endorsement, measured savings, public-network operation, field-level contract privacy, legally transferable permits or cryptographic proof of inspection truth. Legacy database export is not a Canton audit export. Review [PRODUCT_READINESS.md](PRODUCT_READINESS.md) before any external deployment.
