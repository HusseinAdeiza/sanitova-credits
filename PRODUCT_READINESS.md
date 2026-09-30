# Product readiness

## Delivery target

Build SanitovaCredits as a maintained compliance product, not a disposable hackathon demo. Preserve working workflows while making security, reliability, accessibility, and operations release criteria. A successful frontend build is not proof of production readiness.

## Implemented and exercised

- Persistent PostgreSQL asset creation, transfer, inspection status, and audit views.
- Numeric dashboard aggregates and role display sourced from authenticated user context.
- Real holder selection from a restricted API directory.
- Mobile navigation with expanded state, Escape dismissal, overlay dismissal, and hidden collapsed links.
- Keyboard-accessible asset links and labeled creation fields.
- Search empty state without a runtime crash; retry after asset-fetch failures.
- Cancelled obsolete filter requests; creation controls disabled during loading and successful submission.
- Client-side title and metadata validation, which does not replace server-side validation.
- Browser coverage for create/transfer/verify/read, mobile navigation, empty search, and network recovery.
- Canton issuance, inspector status updates, transfer proposal, recipient acceptance, issuer cancellation, and party-scoped contract/event screens.
- A checkpointed PostgreSQL projection over committed ledger updates, with replay-safe archive/create evidence.

## Release blockers

Not for public deployment yet.

1. **Identity and authorization.** Replace self-selected privileged registration roles with reviewed invitations, and establish organization membership and assignment rules. Enforce consistent record-level scope on every detail, event, and update path, not only on list views. Review account revocation and session expiry.
2. **Write integrity.** Make asset changes and audit/history writes a single database transaction, and handle concurrent edits and repeated submissions safely. Enforce field-level permissions and validation on the server. Define valid status transitions and the approval policy with domain owners.
3. **Deployment configuration.** Require production secrets, remove development credentials from any public surface, use HTTPS with explicit allowed origins and request limits, and settle on a supported authentication and session strategy. Keep sample data isolated from customer databases.
4. **Operations.** Versioned migrations, tested backup and restore, database readiness checks, graceful shutdown, structured redacted logs, monitoring and alerts, and a repeatable deployment and rollback path.
5. **Testing and scale.** An isolated test database with disposable fixtures; pagination and bounded export design; CI covering the frontend build, API regression checks, and browser tests; accessibility and cross-browser checks. Current smoke and browser tests leave records in the local database.
6. **Compliance and ledger claims.** Document retention, data ownership, inspection evidence, audit access, and legal requirements. PostgreSQL events are not immutable ledger records. Public-network deployment, production participant authentication, legal acceptance, and write-command recovery remain unverified or incomplete.

## Next slice

Prioritize server-side access boundaries and transactional asset/audit writes
ahead of any further presentation features. Then organization onboarding and
deployment safeguards. Completed and unimplemented capabilities stay
explicitly separated in the README and in the product UI.

## Local verification

Run the API and frontend first, then from the project root:

```bash
node backend/scripts/smoke-test.js
node --test backend/scripts/workflow-test.js
node --test backend/scripts/ledger-issuance-test.js
node --test backend/scripts/ledger-transfer-test.js
node --test --test-timeout=15000 backend/scripts/ledger-projection-test.js
node --test backend/scripts/ledger-records-test.js
npm run build --prefix frontend
cd frontend
npx playwright test tests/workflow.spec.js tests/ledger-ui.spec.js tests/ledger-live.spec.js tests/ledger-transfer.spec.js tests/ledger-records.spec.js --workers=1
```

The ledger suites need the Canton sandbox and the local launcher running; see
[canton/README.md](canton/README.md) and
[canton/LIVE_WORKFLOW.md](canton/LIVE_WORKFLOW.md). These checks cover local
behavior only. They do not certify security, regulatory compliance, backups,
or production operations.
