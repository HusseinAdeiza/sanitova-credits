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

## Smaller ones worth recording

- **Anchor 0.31.1 could not generate the IDL** for a fixed-size array, so the repo was ported to Anchor 0.32.2 rather than hand-maintaining the IDL. A generated IDL is worth more than a hand-edited one.
- **Removing a program from `Anchor.toml` is not enough to exclude it.** Anchor still scans `programs/`. A fixture had to be moved to `disabled_programs/`.
- **A Docker image's entrypoint can swallow your arguments.** `solanalabs/solana:v1.18.26` ignored the validator flags entirely until invoked with `--entrypoint solana-test-validator`. Two runs failed with "no programs loaded" before that.
- **`--bpf-upgradeable-program` is obsolete.** The current form is `--upgradeable-program <keypair> <so> <upgrade-authority>`.
- **Changing a `declare_id!` silently invalidates every downstream binary.** Patching the router's program ID left a stale DeathClock binary CPI-ing to the old address, surfacing as `InvalidProgramId`. Rebuild all dependents after any program ID change.
- **An SSH tunnel needs both ports.** Forwarding only the RPC port gives you a client that connects and then expires on blockhash, because the WebSocket confirmation channel is missing. Forward 8899 and 8900 together, and prefer a reconnecting wrapper over a one-shot `ssh -L`.

---

## The throughline

Four of these five presented as a problem with the platform — a missing syscall, a rejected proof, a dead process, a slow filesystem. All four were misconfigurations or oversights on my side, and all four were diagnosable in minutes with the right check: is the point on the curve, which line is the error on, does the slot advance, is the ledger on a bind mount.

**When a cryptographic or infrastructure error is generic, verify the algebra and the liveness before you blame the version.** A validator version is the explanation you reach for last, not first.
