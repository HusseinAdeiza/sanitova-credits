# SanitovaCredits — Proposed Pilot Plan

**Proposal, not a signed engagement.** Eight weeks after partner agreement and entry-gate approval. No organization, integration vendor or regulator has committed. The existing local MVP is not suitable for customer production data.

## Scope and participants

- **Operator sponsor / payer:** one water or sanitation operator, two facilities; names to be recruited.
- **Operator compliance lead:** owns workflow definitions, baseline and acceptance decision.
- **Inspection partner:** nominates authorized inspectors and validates evidence requirements.
- **Receiving operator/custodian:** accepts or disputes proposed handoffs.
- **Oversight reviewer:** regulator representative if available; otherwise an internal reviewer clearly identified as such. Internal review is not regulatory approval.
- **Product/engineering team:** implements adapters, security controls, recovery and support.

Use one inspection-record type and target 30 shadow records, 10 handoff scenarios and at least one cancellation. These are proposed sample sizes, not existing usage. Existing compliance systems remain authoritative; no permit issuance, legally effective transfer, credit trading or automated compliance decision is in scope.

## Entry gates

Before any external access or sensitive data: reviewed user invitations and organization roles; revocation checks; authenticated participant access; TLS and restricted origins; backup/restore exercise; monitored synchronization; reviewed data-sharing/retention agreement; documented incident owner. Confirm with organizers the supported Canton network and onboarding route. Public DevNet/MainNet deployment is not yet verified.

Agree what a status means and who can change it. Verify whether custody handoff is legally meaningful in the selected jurisdiction; otherwise treat it strictly as record custody. Use synthetic records until these gates pass.

## Delivery schedule

| Weeks | Work | Acceptance evidence |
|---|---|---|
| 1–2 | Interview operator, inspector, receiver and reviewer; map the current process; time five existing evidence-retrieval tasks; agree data fields and consent rules | Signed scope, baseline, data dictionary and accountable sponsor |
| 3–4 | Configure reviewed party mappings; implement one EHS import and evidence reference flow; validate access boundaries in a non-production environment | Sample import reconciliation, denied-access tests and approved data-sharing matrix |
| 5–6 | Run shadow issuance → inspection → propose → accept/cancel → audit; rehearse worker downtime, duplicate delivery and ambiguous write outcomes | Expected contract transitions, no duplicate business action, successful recovery and issue log |
| 7–8 | Reviewer checks an evidence sample; repeat timed retrieval tasks; assess usability, cost and willingness to pay | Joint scorecard and written continue/stop decision |

## Integration plan — proposed, not implemented

| System | Minimal pilot interface | Controls / owner |
|---|---|---|
| Operator EHS/ERP register | Approved CSV export first; authenticated API adapter only if partner supplies documentation and access | Stable external facility/inspection IDs; validation and import reconciliation; operator IT |
| Inspection/laboratory system | Approved report identifier and evidence reference, with human inspector attestation | Keep original reports in controlled storage; check access and provenance; inspection lead |
| Enterprise identity provider | Reviewed invitations initially, then OIDC/SSO if required | Organization membership, party provisioning, revocation and least privilege; operator IT + engineering |
| Reviewer portal/reporting | Reviewer access to party-scoped records; agree and build a required export format | No regulatory submission without explicit approval; reviewer + compliance lead |

No IoT feed or direct regulator-portal integration is promised. Evidence hashes/references, SSO and Canton-specific audit export need implementation; legacy database audit export is not a ledger export.

## Proposed success measures and stop rules

- Every agreed scenario matches expected status/custody and ledger references; cancellation never undoes an accepted transfer.
- Zero unauthorized contract/event disclosures in the agreed test matrix. Any disclosure pauses the pilot pending investigation.
- Worker restart reconciles every committed test update without duplicate events; ambiguous writes are resolved before resubmission.
- Target at least 30% less median evidence-retrieval time versus the five-task baseline, reported with raw timings and sample-size limitations. This is a target, not a claimed saving.
- Sponsor identifies a budget owner and either approves a paid next phase or gives a documented reason to stop.

Stop or rescope if partners do not need independent multi-party control, evidence cannot be shared lawfully, safety/security gates fail, or integration cost outweighs measured benefit. At exit, return approved exports, revoke access and apply the agreed retention policy; do not assume ledger data can simply be deleted.

## Commercial decision

Offer a scoped pilot agreement only after discovery, with responsibilities, support hours and costs explicitly negotiated. Subscription amount, integration fee and operating cost are unknown. Record willingness to pay rather than treating free participation as validation.

Related: [business brief](BUSINESS_BRIEF.md) · [readiness blockers](PRODUCT_READINESS.md) · [local projection boundaries](canton/PROJECTION.md).
