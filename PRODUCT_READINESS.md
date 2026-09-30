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
- Client-side title and metadata validation (not a replacement for server validation).
- Browser coverage for create/transfer/verify/read, mobile navigation, empty search, and network recovery.

## Release blockers — do not deploy publicly yet

1. **Identity and authorization:** replace self-selected privileged registration roles with reviewed invitations; establish organization membership and assignment rules. Enforce consistent record-level scope on every detail/event/update path, not just list views. Review account revocation and session expiry handling.
2. **Write integrity:** make asset changes and audit/history writes one database transaction; handle concurrent edits and repeated submissions safely. Enforce field-level permissions and validation on the server. Define valid status transitions and approval policy with domain owners.
3. **Deployment configuration:** require production secrets, remove development credentials from public surfaces, use HTTPS, explicit allowed origins, appropriate request limits, and a supported authentication/session strategy. Isolate sample data from customer databases.
4. **Operations:** versioned migrations, tested backup/restore, database readiness checks, graceful shutdown, structured redacted logs, monitoring and alerts, and repeatable deployment/rollback.
5. **Testing and scale:** isolated test database with disposable fixtures; pagination and bounded export design; CI for frontend build, API regression checks, and browser tests; accessibility and cross-browser checks. Current smoke/browser tests leave records in the local database.
6. **Compliance and ledger claims:** document retention, data ownership, inspection evidence, audit access, and legal requirements. PostgreSQL events are not immutable ledger records. Local Canton integration and a durable projection are implemented. Public-network deployment, production participant authentication, legal acceptance and write-command recovery remain unverified or incomplete.

## Next implementation slice

Prioritize server-side access boundaries and transactional asset/audit writes before adding more presentation features. Follow with organization onboarding and deployment safeguards. Keep completed and unimplemented capabilities explicitly separated in the README and product UI.

## Current local verification

Run the API and frontend first, then from the project root:

```bash
node backend/scripts/smoke-test.js
node --test backend/scripts/workflow-test.js
npm run build --prefix frontend
cd frontend
npx playwright test tests/workflow.spec.js --workers=1
```

These checks validate local behavior only. They do not certify security, regulatory compliance, backups, or production operations.
