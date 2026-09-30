# Postmortem: what broke while building DeathClock

This records the failures that actually happened during the build, what caused each one, and the generalisable lesson. Five of them cost real time, and two of those five were my own mistakes that looked like platform bugs.

Documenting failure modes is explicitly part of the hackathon's bonus criteria. More importantly, each of these is a trap the next person building on RISC Zero + Solana will hit too.

---

## 1. `PairingError` with no diagnostic — my own constant was wrong

**Symptom.** The router dispatched correctly to `groth_16_verifier`, which returned `PairingError. Error Number: 6003`. No detail, no point index, nothing.

**What I assumed.** That the runtime syscall had been removed. Agave 4.2.2 vs Solana 1.18.26 became the theory, and I spent a long time on validator-version archaeology — including pinning a 1.18.26 image — without ever confirming the syscall was missing.

**Actual cause.** The BN254 base field prime `q` in `zk/src/lib.rs` was correct in its first 8 bytes and wrong after:

```
first 8 bytes:  correct  (0x30644e72e131a029)
remainder:      diverged (b6773a305d761193… instead of b85045b68181585d…)
```

Groth16 needs `pi_a` negated when the point is encoded for the verifier. Negating `y` against a wrong modulus produces a point that is **not on the curve**. `alt_bn128_pairing` rejects an off-curve input as a hard syscall failure, indistinguishable from "the syscall does not exist."

**The lesson.** I spent hours on an environment theory while the bug was a hex literal in my own source. When a ZK syscall fails with a generic error, **check the algebra before the runtime.** A G1 point is on the curve iff `y² == x³ + 3 mod q`; a G2 point follows the analogous check in Fp2. Two lines of Python, and it would have ended the investigation in the first ten minutes.

There is now a regression test for exactly this (`negate_g1_preserves_the_curve_equation`), plus one asserting the constant is the true prime.

---

## 2. `InvalidProof` did not mean the proof was invalid

**Symptom.** After fixing the modulus, submission failed at `lib.rs:254` with `InvalidProof. Error Number: 6009`.

**What I concluded, wrongly.** That pairing was failing again. I wrote this down explicitly and it was incorrect: `validate_heartbeat_journal(...)` runs at line 354, *before* `verify_risc0_receipt(...)` at line 356. Line 254 is inside the freshness check.

**Actual cause.** The receipt's timestamp was more than 300 seconds old — the proving pipeline itself consumed the freshness window.

**The lesson.** **An error code tells you where a check failed, not which check mattered.** Read the line number before drawing a conclusion, and re-read it when a conclusion starts looking convenient. This one cost a full re-run.

---

## 3. The proving pipeline was eating its own freshness window

**Symptom.** Every run took ~7 minutes against a 300-second budget. The receipt was always stale on arrival.

**Two independent causes.**

*The prover recompiled on every phase.* `in_container` invoked `cargo build` each time. The zk build script calls `risc0_build::embed_methods()`, which re-runs the guest build on **every** invocation — invalidating `deathclock-zk-methods` and forcing a ~60s recompile of `deathclock-zk`. Twice per run. Fixed by `exec`ing the already-built binary from the persistent volume.

*Setup consumed the window too.* Vault initialization and the deposit used the same freshness window as the proof. Moved into the `before` hook.

**The lesson.** **Take the timestamp after the build is warm, not when the script starts.** The clock must begin when proving begins. Phase 1 now persists its exact owner/timestamp/nonce so phase 2 reproduces an identical journal.

Note what this avoided: the tempting fix was to widen `PROOF_MAX_AGE_SECONDS`. That would have worked and would have been a real security regression — the program sets `last_heartbeat = now()` on success, so a replayed-but-in-window proof refreshes the clock. Making the pipeline fit inside the window was the honest fix.

---

## 4. A validator that looked alive while being frozen

**Symptom.** `pgrep` showed the process. RPC answered. Transactions confirmed nothing.

**What I did wrong, twice.** First I assumed memory pressure — the local Docker validator was genuinely being OOM-killed by the Groth16 wrap, and I added `--memory 4g` plus a post-proving health check. That fixed the OOM but not this.

Then, on the VPS, I launched the validator with `setsid nohup … & disown` from inside an SSH command and assumed that detached it. It did not: **the validator remained a child of that shell.** When the connection later stalled, the process was still there while frozen. It survived a full 27 hours in that state.

**Actual cause.** The log's last line read `Processed Slot: 66555` while the RPC reported slot `66523`. **A log and the RPC disagreeing about the slot is a process frozen mid-slot** — it cannot be both. That was the signal, and I read it as a tunnel problem first.

**The fix.** A systemd unit with `Restart=always` and an explicit `PATH` (the Solana binary is only on `PATH` for interactive shells, which cost me one confusing restart). See `scripts/deathclock-validator.service`.

**The lesson.** **Check that the slot advances; never check that the process exists.** Reachability is not liveness — a validator with a corrupt ledger will happily answer RPC forever. And `setsid` inside an SSH command is not a supervision strategy; if the process must outlive the session, give it an init system.

---

## 5. Windows bind mounts break two things at once

Two separate failures, same root cause.

*RocksDB cannot mmap a Docker Desktop bind mount from Windows.* The validator accepted RPC requests but never produced a single block. Fix: keep the ledger on the container's own filesystem (`--ledger /tmp/…`), never on a bind mount.

*Compilation through a bind mount is slow enough to break a deadline.* Building the zk crates against `/workspace/target` took ~3.5 minutes and consumed the entire 300-second window on its own. Fix: a named Docker volume for the build cache.

**The lesson.** **On Windows, keep compiler output and database files off the bind mount.** Both symptoms looked like something else entirely — one like a networking problem, one like a performance mystery.

---

## 6. Deploying to a public cluster: four mistakes, then a real wall

Getting the three programs onto public devnet took four wrong approaches
before it worked. All four failed *silently enough* to be worth writing down,
because in every case a transaction signature was printed and the program
account stayed empty.

**`Anchor.toml` overrides `declare_id!`.** The vendored
`solana-verifier/Anchor.toml` still carried upstream's program IDs. Editing
the `declare_id!` literal in `lib.rs` changed the generated IDL but not the
binary, and `anchor build` skipped the rebuild entirely when a stale
fingerprint matched. Verify a build with the IDL's `address` field. Do not
try to grep the ELF: SBPF does not store the program ID as bytes or a symbol,
so that check can only mislead.

**The toolchain's CLI is a major version ahead of the validator.** The image
ships `solana-cli 4.2.2`, whose signature is

    solana program deploy [FLAGS] [OPTIONS] [PROGRAM_FILEPATH]

There is no positional program-keypair argument, and `--keypair` is the *fee
payer*. Passing the program keypair there made the CLI mint a throwaway
keypair and deploy to a random address, which it then reported as
`Program Id: <something unrelated>`. Every symptom followed from that: IDs
that matched no keypair, "insufficient funds" against accounts never funded,
and `Program <old id> has been closed` for IDs that were not in the build at
all. The working form is

    solana program deploy --url devnet \
        --keypair <fee-payer> --program-id <path/to/keypair.json> <so>

where `--program-id` takes a **keypair path**, not a pubkey.

**Never fund a program keypair before deploying.** Any transfer creates the
account, and an existing account can never become a program account — even a
0-byte account owes the rent-exempt minimum, so the loader rejects it with
`not an upgradeable program or already in use`. Rent is charged to the fee
payer during the deploy. This cost three sets of keypairs.

**A signature is not proof of deployment.** The funding transfer and the
deploy each print one, and several runs printed `Signature:` while
`getAccountInfo` still showed `executable: false` under the System Program.
`scripts/deploy-devnet.sh` now gates on `getAccountInfo` and only reports
success when the account is `executable` and owned by `BPFLoaderUpgradeab1`.

### The wall, and how it actually fell

With the programs deployed, `add_verifier` failed:

    AnchorError caused by account: verifier_program_data.
    Error Code: VerifierInvalidAuthority.
    Attempted to add a verifier contract that the router contract does not own
    and thus cannot delete.

That constraint is load-bearing and worth keeping: the router must be able to
revoke a verifier that turns out to be broken or compromised. It works on
localnet because `solana-test-validator --upgradeable-program` assigns the
authority at genesis. On a public cluster there is no genesis, so the router
PDA has to be handed the authority after the fact -- and three routes looked
closed.

The router cannot take it itself. LoaderV3 forbids `SetAuthority` as an inner
instruction, so an `invoke_signed` CPI is refused with

    Program BPFLoaderUpgradeab1e11111111111111111111111 not supported by
    inner instructions

This one is real: it is a runtime restriction on CPI of `SetAuthority`,
`Upgrade`, `Close` and `Deploy`, not a bug in how the instruction was built.
I confirmed it against the Solana docs and upstream Agave discussion.

A plain client cannot take it either. `solana program set-upgrade-authority`
defaults to the loader's `SetAuthorityChecked`, which requires the **new**
authority to co-sign -- and a PDA cannot sign a top-level transaction.

**The fourth route is the one that works.** The same CLI subcommand has a flag
for exactly this case:

    solana program set-upgrade-authority <verifier> \
      --new-upgrade-authority <router PDA> \
      --skip-new-upgrade-authority-signer-check

That drops the new-authority signature requirement, leaving only the current
authority's -- which the deploy wallet can provide. `scripts/claim-verifier-authority.ts`
does this, and `add_verifier` then succeeds.

    registered groth16 verifier:
    2n96CPsM6Ga8BPjAGtHMyriNGxm2QHm36jqQvVoX2ubSs7wzP1nfuWErNqrdsW9gUQCro3ftZcjLHGmScGVfrWhS

Confirmed by reading the entry account back rather than trusting the log:
selector `73c457ba`, verifier `2iPoTWMXWJ6inLnBeGEZyiKkwEzaQvCX24Cp82UcWm8K`,
`estopped: false`. The router logs `Instruction: AddVerifier` and succeeds.

Worth being precise about what this does and does not give up. The deployer
still cannot upgrade the verifier afterwards, because authority now belongs to
the router PDA and only the router can exercise it -- so the revocation
property the constraint protects is fully intact. The flag changes *who may
install* a verifier, not whether the router can *remove* one.

#### Two dead ends on the way, both instructive

**Hand-building the loader instruction in a client is a trap.** Constructing
`SetAuthority` manually and submitting it failed with

    Error processing Instruction 0: An account required by the instruction is
    missing

which reads like a policy refusal and is not one. It was a missing account in
the instruction, and the real problem was that the CLI's own encoding is the
thing worth using. Reached the correct answer only by reading
`solana program set-upgrade-authority --help` inside the toolchain image,
where the flag's description is right there.

**A failed hand-rolled experiment is not evidence of a platform limit.** I had
recorded the CPI wall as a hard stop and written it into this document. The
instruction-shape failure above is a good reminder of the inverse: an error
that says "missing", "invalid" or "not supported" is a statement about the
bytes you sent, not about what the runtime permits.

---

## Smaller ones worth recording

- **web3.js 1.99 uses global `fetch`, and `fetch` cannot reach public Solana RPC from this host.** Every RPC call failed with `TypeError: fetch failed` while `node:https` returned 200 from the same endpoint. The undici stack behind `fetch` is the culprit, not the network. `scripts/rpc-transport.ts` probes once and swaps in a `node:https` implementation of the subset web3.js uses. This one cost real time because it masqueraded as devnet rate-limiting, and the retry logic I added first made it look like a persistence problem.
- **A `solana program show` that prints nothing is not a clean bill of health.** Under this shell it exits 0 with empty output. Read the ProgramData account directly: the upgrade authority is a `Option<Pubkey>` at byte 12 of `4-byte enum | u64 slot | 1-byte tag | 32-byte authority`. `scripts/show-authorities.ts` does this.
- **Anchor 0.31.1 could not generate the IDL** for a fixed-size array, so the repo was ported to Anchor 0.32.2 rather than hand-maintaining the IDL. A generated IDL is worth more than a hand-edited one.
- **Removing a program from `Anchor.toml` is not enough to exclude it.** Anchor still scans `programs/`. A fixture had to be moved to `disabled_programs/`.
- **A Docker image's entrypoint can swallow your arguments.** `solanalabs/solana:v1.18.26` ignored the validator flags entirely until invoked with `--entrypoint solana-test-validator`. Two runs failed with "no programs loaded" before that.
- **`--bpf-upgradeable-program` is obsolete.** The current form is `--upgradeable-program <keypair> <so> <upgrade-authority>`.
- **Changing a `declare_id!` silently invalidates every downstream binary.** Patching the router's program ID left a stale DeathClock binary CPI-ing to the old address, surfacing as `InvalidProgramId`. Rebuild all dependents after any program ID change.
- **An SSH tunnel needs both ports.** Forwarding only the RPC port gives you a client that connects and then expires on blockhash, because the WebSocket confirmation channel is missing. Forward 8899 and 8900 together, and prefer a reconnecting wrapper over a one-shot `ssh -L`.

---

## The throughline

Most of these presented as a problem with the platform — a missing syscall, a
rejected proof, a dead process, a slow filesystem, a "closed" program. Nearly
all were misconfigurations or oversights on my side, and all were diagnosable
in minutes with the right check: is the point on the curve, which line is the
error on, does the slot advance, is the ledger on a bind mount, what does
`getAccountInfo` say.

The verifier registration wall in §6 was the one I was most confident was
permanent, and it was not: the runtime restriction on CPI is real, but I had
generalised from it to "impossible on a public cluster" without checking
whether the CLI offered a third path. It did. Being sure a limit is a limit
is worth verifying too, and the check is usually one `--help` away.

**When a cryptographic or infrastructure error is generic, verify the algebra
and the liveness before you blame the version.** A validator version is the
explanation you reach for last, not first. **And when you have exhausted your
own explanations, check whether the platform is actually asking for
something impossible** — but prove that from the runtime's own error and the
documentation, not from a plausible theory.
