# Commit conventions

DeathClock is a security-sensitive protocol, so a commit message is part of the
audit trail. This file records what we expect. It does not ask anyone to
manufacture a development history — a fake archaeology of `wip:` and `revert:`
commits is not only dishonest to reviewers, it is trivially detectable and
discredits the work it is meant to support.

What actually helps a reviewer: **the reasoning, especially the wrong turns.**

## Format

```
<scope>: <what changed, in the imperative>

<why it changed, and what you rejected>
```

Scopes in use: `vault`, `heartbeat`, `router`, `verifier`, `zk`, `guest`,
`release`, `frontend`, `tests`, `docs`, `infra`, `e2e`.

## The bar for a good message

A commit message earns its length when it records something a diff cannot: the
dead end, the constraint, or the failure that led here.

Good — records a rejected alternative and the reason:

```
router: pin the guest image ID instead of accepting any image

An attacker who can run a zkVM of their choosing could otherwise satisfy
the heartbeat with a guest that just returns 1. Binding the receipt to a
specific image ID means the proof asserts a specific program executed.

Rejected: verifying the journal inside the guest only. The journal is
already checked on-chain at lib.rs:354, so a second check inside the guest
buys nothing and costs 5.6M constraints.
```

Good — records a real bug and its cause:

```
zk: fix MODULUS_Q, which was correct for 8 bytes then diverged

Negating pi_a against a wrong modulus produced an off-curve point, and
alt_bn128_pairing rejects that as a hard syscall error indistinguishable
from the syscall being absent. This cost hours chasing a Solana version
theory when the bug was a hex literal in this file.

Regression test asserts both the prime value and y + y' = q mod q.
```

Bad — states the change, records nothing:

```
feat: add heartbeat verification
fix: bug
update: docs
chore: cleanup
```

## When a commit is exploratory

Genuine exploration is fine and worth recording — just label it honestly as
what it is, so a reviewer knows the code was later superseded:

```
wip: trying a custom oracle for death confirmation
```

If you revert it, say why in the revert commit. A `revert:` of your own
exploratory commit with a stated reason is real information; a manufactured
sequence of them is not.

## Security-relevant changes

Any change touching ownership, lamport movement, proof acceptance, or the
freshness window gets a body that answers:

1. What is the attack this could open?
2. What bounds it — a signature check, a PDA, a numeric ceiling, a state
   machine transition?
3. What test would fail if the bound were removed?

`PROOF_MAX_AGE_SECONDS`, `FEE_BPS`, the share-sum invariant, and the release
state machine all fall here. Widening a security constant requires saying in
the commit body why the old value was insufficient — "the demo was too slow"
is not a reason.

## Committing agent-assisted work

Much of this repository was built with AI assistance, and that is stated
plainly rather than hidden. What matters to a reviewer is that the code is
understood: if a change was machine-generated, the commit body should still
say what it does and why, and you should be able to defend it. We have
already written the commit body for a generated fix when the generated diff
itself explained nothing (see the `MODULUS_Q` example above).
