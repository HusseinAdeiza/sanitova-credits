# SanitovaCredits — Business Brief
**HackCanton Season 3 · RWA & Business Workflows**  
**Status:** working local Canton MVP; customer and pricing hypotheses awaiting validation.

## Customer and problem hypothesis
Our proposed first customer is a water or sanitation operator managing several facilities and coordinating inspections with an external service provider. The buyer is its compliance/EHS lead; users include operations staff, inspectors and an authorized oversight reviewer. We hypothesize that reconciling inspection status and responsibility during operational handoffs creates avoidable audit-preparation work. Interviews and a timed baseline must establish whether this is a paid problem. No pilot customer or regulator endorsement is claimed.

## One focused use case
An operator issues a digital record for a facility inspection. The assigned inspector changes its status. During an operational handoff, the issuer proposes a new record custodian; the recipient explicitly accepts, or the issuer cancels the pending proposal. An authorized reviewer follows the resulting contract history.

**The asset represents a compliance workflow record—not a tradable environmental credit, a permit, or proof that a physical inspection was truthful.** Custody transfer does not automatically transfer a legal authorization or regulatory responsibility. Any such interpretation requires jurisdiction-specific review.

## Product and why Canton
The implemented Daml contracts make the assigned inspector the status-update controller, the issuer the proposal/cancellation controller and the recipient the acceptance controller. This puts cross-party consent in the ledger workflow rather than relying solely on an application database. PostgreSQL provides a durable read model with checkpointed recovery and replay-safe create/archive evidence.

The issuer, holder, inspector and regulator are stakeholders of the asset contract; the proposed recipient also observes the proposal. Stakeholders share the contract payload: this MVP does **not** implement field-level confidentiality between them. A centralized database remains a reasonable alternative if discovery finds no need for independently controlled cross-organization workflows.

## Payer and commercial hypothesis
The operator would pay an enterprise subscription, potentially tiered by facilities; inspector and reviewer access would be included in the pilot. Paid onboarding/integration is a possible additional service. No price, savings figure or market-size estimate has been validated. Purchase criteria to test: less time reconstructing evidence, fewer unresolved handoffs, acceptable integration cost and a named budget owner willing to sponsor a paid next phase.

## Evidence and next step
The local app supports issuance, inspection, recipient acceptance, issuer cancellation and party-scoped contract/event screens backed by Canton and PostgreSQL. It is not deployed on a public Canton network. Production identity, command-outcome recovery, evidence integrations and legal acceptance remain gates—not completed features.

Propose an eight-week, two-facility shadow pilot with one operator, one inspection partner and one oversight reviewer, using synthetic or approved non-sensitive records first. Continue only if agreed measures and security gates are met; see [PILOT_PLAN.md](PILOT_PLAN.md).

**Implementation evidence:** [Daml model](canton/main/daml/Main.daml) · [workflow](canton/LIVE_WORKFLOW.md) · [projection](canton/PROJECTION.md).
