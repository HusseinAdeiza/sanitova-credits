# SanitovaCredits — Idea summary

SanitovaCredits is a compliance workflow for water and sanitation inspection
records, built for the case where a record changes hands between an operator,
an inspector, and a new custodian and every one of those steps needs an
explicit, recorded consent.

## The problem

When an inspection record moves between parties during normal operations,
"who changed this status, and who accepted the handoff" is answered today by
exporting logs from one organization's application database. That works inside
a single system. It gets expensive and fragile once an operator, an external
inspection provider, and an oversight reviewer all need to agree on the same
record without trusting one party to keep the books.

## The workflow

1. An operator issues a record tied to a specific facility inspection. The
   ledger returns real contract and update references.
2. The assigned inspector is the only party who can move the record's status.
3. A custody handoff is proposed by the issuer and must be accepted by the
   recipient. The issuer can cancel a pending proposal; neither party can
   reverse a transfer that has already been accepted.
4. An authorized reviewer reads the resulting contract and event history,
   scoped to their own party rather than the whole participant node.

## Why Canton

The Daml model puts these rules where they belong: the assigned inspector is
the status-update controller, the issuer controls proposal and cancellation,
and the recipient controls acceptance. Those constraints hold in the ledger
model itself instead of relying on application-level checks that one operator
administers. Alongside that, the application projects committed Canton events
into PostgreSQL with a durable checkpoint, so existing read paths and screens
keep working against a database while the agreement layer runs on Canton.

## Scope and status

Built for HackCanton Season 3, on the Real-World Asset & Business Workflows
track. The implementation runs against a local Canton sandbox with a real
Daml package, real command submission, and a real PostgreSQL projection.

The record is a compliance workflow artifact and the custody it tracks is
record custody. It is not a tradable environmental credit, a permit, or proof
that a physical inspection report was accurate. The customer framing and
pricing in [BUSINESS_BRIEF.md](BUSINESS_BRIEF.md) are hypotheses pending
partner interviews, and [PILOT_PLAN.md](PILOT_PLAN.md) describes the pilot
shape those interviews would validate.

## Where to look

- [BUSINESS_BRIEF.md](BUSINESS_BRIEF.md) — customer, use case, payer, Canton rationale
- [PILOT_PLAN.md](PILOT_PLAN.md) — proposed eight-week pilot and its entry gates
- [canton/README.md](canton/README.md) — Daml contracts, toolchain and test runner
- [canton/LIVE_WORKFLOW.md](canton/LIVE_WORKFLOW.md) — the end-to-end browser workflow
- [canton/PROJECTION.md](canton/PROJECTION.md) — the PostgreSQL read model and worker
