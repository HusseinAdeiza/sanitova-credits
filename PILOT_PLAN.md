# SanitovaCredits — Proposed Pilot Plan

Eight weeks, starting after a partner agreement and the entry gates below. No
organization, integration vendor, or regulator has committed yet, and the
current local MVP is not suitable for customer production data.

## Participants

- **Operator sponsor / payer** — one water or sanitation operator, two facilities.
- **Operator compliance lead** — owns the workflow definition, the baseline, and the acceptance decision.
- **Inspection partner** — nominates authorized inspectors and validates evidence requirements.
- **Receiving custodian** — accepts or disputes proposed handoffs.
- **Oversight reviewer** — a regulator representative if one is available; otherwise an internal reviewer identified as such, since internal review is not regulatory approval.
- **Product and engineering** — adapters, security controls, recovery, and support.

Scope is one inspection-record type, targeting 30 shadow records, 10 handoff
scenarios, and at least one cancellation. Those are proposed sample sizes, not
existing usage. Existing compliance systems stay authoritative. Permit
issuance, legally effective transfer, credit trading, and automated compliance
decisions are out of scope.

## Entry gates

Nothing touches external access or sensitive data until these are done:
reviewed user invitations and organization roles, revocation checks,
authenticated participant access, TLS with restricted origins, a
backup/restore exercise, monitored synchronization, a reviewed
data-sharing and retention agreement, and a named incident owner.

Alongside that, agree what each status means and who may change it, and
establish whether custody handoff carries legal weight in the chosen
jurisdiction — if not, treat it strictly as record custody. Until the gates
pass, run on synthetic records. The supported Canton network and onboarding
route still need confirmation from the organizers.

## Schedule

| Weeks | Work | Acceptance evidence |
|---|---|---|
| 1–2 | Interview the operator, inspector, receiver, and reviewer; map the current process; time five existing evidence-retrieval tasks; agree data fields and consent rules | Signed scope, baseline, data dictionary, accountable sponsor |
| 3–4 | Configure reviewed party mappings; build one EHS import and evidence-reference flow; validate access boundaries outside production | Import reconciliation sample, denied-access tests, approved data-sharing matrix |
| 5–6 | Run shadow issuance → inspection → propose → accept/cancel → audit; rehearse worker downtime, duplicate delivery, and ambiguous write outcomes | Expected contract transitions, no duplicate business action, documented recovery |
| 7–8 | Reviewer checks an evidence sample; repeat the timed retrieval tasks; assess usability, cost, and willingness to pay | Joint scorecard and a written continue/stop decision |

## Integrations

None of these exist yet; each row is the minimum interface worth building.

| System | Minimal pilot interface | Controls / owner |
|---|---|---|
| Operator EHS/ERP register | Approved CSV export first; authenticated API adapter only if the partner supplies documentation and access | Stable external facility/inspection IDs, validation and import reconciliation — operator IT |
| Inspection/laboratory system | Approved report identifier and evidence reference, with human inspector attestation | Originals stay in controlled storage; access and provenance checks — inspection lead |
| Enterprise identity provider | Reviewed invitations first, OIDC/SSO only if required | Organization membership, party provisioning, revocation, least privilege — operator IT + engineering |
| Reviewer portal | Reviewer access to party-scoped records; agree and build a required export format | No regulatory submission without explicit approval — reviewer + compliance lead |

No IoT feed or direct regulator-portal integration is promised. Evidence
hashes and references, SSO, and a Canton-specific audit export all still need
implementation. The legacy database audit export is not a ledger export.

## Success measures and stop rules

- Every agreed scenario matches its expected status, custody, and ledger references; cancellation never undoes an accepted transfer.
- Zero unauthorized contract or event disclosures across the agreed test matrix. Any disclosure pauses the pilot pending investigation.
- A worker restart reconciles every committed test update without duplicate events; ambiguous writes are resolved before resubmission.
- Target at least 30% lower median evidence-retrieval time against the five-task baseline, reported with raw timings and the sample-size caveat. That is a target, not a claimed saving.
- The sponsor names a budget owner and either approves a paid next phase or gives a documented reason to stop.

Rescope or stop if partners turn out not to need independent multi-party
control, if evidence cannot be shared lawfully, if the security gates fail, or
if integration cost outweighs measured benefit. At exit, return approved
exports, revoke access, and apply the agreed retention policy — ledger data
should not be assumed deletable on request.

## Commercial decision

Offer a scoped pilot agreement only after discovery, with responsibilities,
support hours, and costs negotiated explicitly. Subscription amount,
integration fee, and operating cost are all still unknown. Record willingness
to pay rather than treating free participation as validation.

Related: [business brief](BUSINESS_BRIEF.md) ·
[readiness blockers](PRODUCT_READINESS.md) ·
[projection boundaries](canton/PROJECTION.md)
