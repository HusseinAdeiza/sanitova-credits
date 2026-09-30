# SanitovaCredits — Business Brief

**HackCanton Season 3 · Real-World Asset & Business Workflows**

## Customer

A water or sanitation operator running several facilities and coordinating
inspections with an external service provider. The buyer is the operator's
compliance or EHS lead. Day-to-day users are operations staff, the inspectors
who attest to conditions, and an oversight reviewer.

The problem worth testing: reconciling inspection status and responsibility
across operational handoffs creates avoidable audit-preparation work once more
than one organization has a stake in the same record. Whether that pain is
expensive enough to pay for is what discovery has to establish.

## Use case

An operator issues a digital record for a facility inspection. The assigned
inspector moves its status. During a handoff, the issuer proposes a new
custodian and the recipient explicitly accepts, or the issuer cancels the
pending proposal. An authorized reviewer follows the resulting history.

The asset is a compliance workflow record. It is not a tradable environmental
credit, a permit, or proof that a physical inspection was truthful. Custody
transfer does not by itself move a legal authorization or regulatory
responsibility, and any such reading would need jurisdiction-specific review.

## Why Canton

The Daml contracts put the consent rules in the ledger model itself: the
assigned inspector is the status-update controller, the issuer controls
proposal and cancellation, and the recipient controls acceptance. That matters
when no single party should be the one administering the checks. PostgreSQL
gives the application a durable read model with checkpointed recovery and
replay-safe create/archive evidence.

Every stakeholder of an asset contract shares its payload, so this version
does not implement field-level confidentiality between them. If discovery
finds no need for independently controlled cross-organization workflows, a
centralized database remains a reasonable and cheaper alternative.

## Payer

The operator would pay an enterprise subscription, plausibly tiered by
facility count, with inspector and reviewer access included during the pilot.
Paid onboarding and integration is a possible second revenue line. No price,
savings figure, or market size is validated yet.

The purchase criteria worth testing: less time reconstructing evidence, fewer
unresolved handoffs, tolerable integration cost, and a named budget owner
willing to sponsor a paid next phase.

## Next step

Propose an eight-week, two-facility shadow pilot with one operator, one
inspection partner, and one oversight reviewer, starting on synthetic or
approved non-sensitive records. Continue only if the agreed measures and
security gates are met; see [PILOT_PLAN.md](PILOT_PLAN.md).

**Implementation:** [Daml model](canton/main/daml/Main.daml) ·
[workflow](canton/LIVE_WORKFLOW.md) · [projection](canton/PROJECTION.md)
