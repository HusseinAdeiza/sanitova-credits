# SanitovaCredits — Four-minute pitch

**Status:** local Canton MVP, seeking discovery and pilot partners. No public-network deployment or customer traction claimed.

## 0:00–0:35 — Problem hypothesis

“When an inspection record passes between an operator, an inspector and a new custodian, who controls its status—and who explicitly accepted the handoff? SanitovaCredits makes those actions a shared workflow with ledger references. Our initial customer hypothesis is a multi-facility water or sanitation operator. We still need partner interviews to validate the cost of the problem.”

## 0:35–1:00 — Product definition

“We represent inspection workflow records, not tradeable environmental credits. An inspector's attestation is still a human assertion: a ledger cannot prove water quality or make a certificate legally transferable. What we can demonstrate is who can update a record, who must consent to custody and how to recover its recorded history.”

## 1:00–2:30 — Show the actual Canton flow

Follow [DEMO.md](DEMO.md), using the Canton screens rather than the older database-only screens:

1. Alice issues a titled contract and receives actual contract/update IDs.
2. Clara changes its status under the assigned inspector party.
3. Alice proposes a transfer. The proposal does not change custody.
4. Bob explicitly accepts. A replacement contract records Bob as holder.
5. David opens **Canton Records → Ledger events** and sees visible create/archive references from the durable projection.

Explain that a pending proposal can instead be cancelled by the issuer; an accepted transfer cannot be undone with that choice. Show a prepared second example only if time permits.

## 2:30–3:10 — Why Canton, and the boundary

“The Daml model defines distinct controllers for inspection, proposal, acceptance and cancellation. Stakeholders share the contract payload; this version does not hide different fields from each stakeholder. PostgreSQL serves the application read model and commits events with its synchronization checkpoint. Restart and replay tests exercise recovery independently of browser receipts.”

“This runs on a local unauthenticated Canton sandbox. It is not yet a production participant integration or a public-network deployment. A centralized database may be sufficient for customers who do not need independently controlled cross-organization workflows.”

## 3:10–3:40 — Business and pilot

“The proposed payer is the operator's compliance organization, through a subscription with facilities-based tiers to test. We propose an eight-week shadow pilot: one operator, two facilities, one inspection partner and an oversight reviewer. We will measure evidence-retrieval time, unresolved handoffs, recovery and willingness to pay. No savings or pricing is validated yet.”

## 3:40–4:00 — Ask

“We are seeking introductions to an operator compliance lead and an inspection partner, plus mentor guidance on supported Canton network onboarding. The next step is a gated shadow pilot—not a claim that a local demo is ready to issue regulatory approvals.”

## Presenter guardrails

- No unsourced market-size, growth-rate or competitor-capability claims.
- Say **record custody**, not legal ownership of a permit.
- Canton Records shows ledger create/archive evidence, not yet a human-readable, timestamped business-action export.
- The legacy **Audit Trail → Export JSON** is database-only; do not present it as a Canton export.
- A fresh checkpoint is a recent worker check, not a guarantee that every external system is current.
- Exact verification commands and limitations: [submission checklist](SUBMISSION_CHECKLIST.md), [business brief](BUSINESS_BRIEF.md), [pilot plan](PILOT_PLAN.md).
