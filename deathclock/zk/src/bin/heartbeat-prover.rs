//! Two-phase heartbeat prover driver.
//!
//! RISC Zero's Groth16 step shells out to `docker run
//! risczero/risc0-groth16-prover`, passing `RISC0_WORK_DIR` as the inner
//! container's `-v` source. When that inner call is issued from inside a
//! build container, the HOST daemon resolves the path and cannot see the
//! build container's filesystem, so the prover aborts with
//! "unexpected end of input" / "invalid magic number" — the mount is empty.
//!
//! The fix is to drive the prover image from the host, in between the two
//! halves of proving:
//!
//! ```text
//!   phase1  (container)  STARK-prove  -> target/risc0-work/{seal.r0,input.json}
//!   groth16 (host)       run prover image -> target/risc0-work/proof.json
//!   phase2  (container)  proof.json -> router Seal + journal
//! ```
//!
//! The journal is not returned by phase 1 because the failed Groth16 wrap
//! discards the receipt; it is fully determined by the input, and the value
//! the receipt attests to is exactly `HeartbeatInput::expected_journal_outputs`.

use deathclock_zk::{groth16_from_proof_json, HeartbeatInput, JOURNAL_OUTPUT_LEN};
use std::{env, fs, path::PathBuf};

fn hex_to_bytes(hex: &str, len: usize, label: &str) -> Result<Vec<u8>, String> {
    if hex.len() != len * 2 {
        return Err(format!("{label} must be {len} bytes ({} hex chars)", len * 2));
    }
    (0..len)
        .map(|i| u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).map_err(|e| e.to_string()))
        .collect()
}

/// Phase 1 writes the input it actually proved to `input.json` in the work
/// dir. Phase 2 must recompute the identical journal, so it reads the values
/// back from there rather than re-deriving them from the environment: the
/// script deliberately picks a fresh timestamp right before proving, and an
/// env var read in a later container would no longer match.
fn input_from_env() -> Result<HeartbeatInput, String> {
    let work_dir = env::var("RISC0_WORK_DIR").unwrap_or_default();
    let persisted = if work_dir.is_empty() {
        None
    } else {
        let path = PathBuf::from(&work_dir).join("heartbeat-input.json");
        fs::read_to_string(&path).ok()
    };

    if let Some(raw) = persisted {
        let v: serde_json::Value =
            serde_json::from_str(&raw).map_err(|e| format!("{}: {e}", "heartbeat-input.json"))?;
        let field = |k: &str| -> Result<String, String> {
            v.get(k)
                .and_then(|x| x.as_str())
                .map(str::to_owned)
                .ok_or_else(|| format!("heartbeat-input.json missing {k}"))
        };
        let timestamp: u64 = field("timestamp")?
            .parse()
            .map_err(|e| format!("heartbeat-input.json timestamp: {e}"))?;
        return Ok(HeartbeatInput::new(
            hex_to_bytes(&field("owner")?, 32, "owner")?
                .try_into()
                .map_err(|_| "owner length")?,
            timestamp,
            hex_to_bytes(&field("nonce")?, 24, "nonce")?
                .try_into()
                .map_err(|_| "nonce length")?,
        ));
    }

    let owner = env::var("DEATHCLOCK_OWNER").map_err(|_| "DEATHCLOCK_OWNER (64 hex) is required")?;
    let nonce = env::var("DEATHCLOCK_NONCE").map_err(|_| "DEATHCLOCK_NONCE (48 hex) is required")?;
    let timestamp: u64 = env::var("DEATHCLOCK_TIMESTAMP")
        .map_err(|_| "DEATHCLOCK_TIMESTAMP is required")?
        .parse()
        .map_err(|e| format!("DEATHCLOCK_TIMESTAMP: {e}"))?;

    Ok(HeartbeatInput::new(
        hex_to_bytes(&owner, 32, "DEATHCLOCK_OWNER")?
            .try_into()
            .map_err(|_| "owner length")?,
        timestamp,
        hex_to_bytes(&nonce, 24, "DEATHCLOCK_NONCE")?
            .try_into()
            .map_err(|_| "nonce length")?,
    ))
}

/// STARK-proves the heartbeat, leaving the prover image's inputs on disk.
///
/// The Groth16 wrap is expected to fail here; what matters is that it has
/// already written `seal.r0` and `input.json` before invoking Docker.
fn phase1() -> Result<(), String> {
    let input = input_from_env()?;
    let work_dir =
        PathBuf::from(env::var("RISC0_WORK_DIR").map_err(|_| "RISC0_WORK_DIR is required")?);
    fs::create_dir_all(&work_dir).map_err(|e| e.to_string())?;

    // The journal the receipt commits to; identical to what phase 1 proves and
    // what the Solana program recomputes.
    let journal = input.expected_journal_outputs();
    assert_eq!(journal.len(), JOURNAL_OUTPUT_LEN);

    // Persist the exact input so phase 2 reproduces the identical journal even
    // though it runs in a later container with different env values.
    let persisted = serde_json::json!({
        "owner": hex::encode(input.owner),
        "timestamp": input.timestamp.to_string(),
        "nonce": hex::encode(input.nonce),
    });
    fs::write(
        work_dir.join("heartbeat-input.json"),
        format!("{persisted}\n"),
    )
    .map_err(|e| format!("writing heartbeat-input.json: {e}"))?;

    println!("owner     = {}", hex::encode(input.owner));
    println!("timestamp = {}", input.timestamp);
    println!("nonce     = {}", hex::encode(input.nonce));
    println!("journal   = {}", hex::encode(journal));
    println!("digest    = {}", hex::encode(deathclock_zk::journal_digest(&journal)));

    // Run the real proof with the p254 options and leave the Groth16 wrap's
    // inputs (seal.r0, input.json) in RISC0_WORK_DIR for the host to wrap.
    let proven_journal = deathclock_zk::write_groth16_inputs(input).map_err(|e| e.to_string())?;
    if proven_journal.as_slice() != journal {
        return Err("receipt journal does not match the expected journal".to_string());
    }
    println!("stark_proof = ok");

    let seal = work_dir.join("seal.r0");
    let witness = work_dir.join("input.json");
    println!("seal       = {} ({} bytes)", seal.display(), fs::metadata(&seal).map(|m| m.len()).unwrap_or(0));
    println!("witness    = {} ({} bytes)", witness.display(), fs::metadata(&witness).map(|m| m.len()).unwrap_or(0));

    println!("work_dir  = {}", work_dir.display());
    Ok(())
}

/// Turns the prover image's `proof.json` into the router seal.
fn phase2() -> Result<(), String> {
    let work_dir =
        PathBuf::from(env::var("RISC0_WORK_DIR").map_err(|_| "RISC0_WORK_DIR is required")?);
    let proof_path = work_dir.join("proof.json");
    let proof_json = fs::read_to_string(&proof_path)
        .map_err(|e| format!("reading {}: {e}", proof_path.display()))?;

    let seal = groth16_from_proof_json(&proof_json).map_err(|e| e.to_string())?;

    let input = input_from_env()?;
    let journal = input.expected_journal_outputs();

    println!("selector = {}", hex::encode(seal.selector));
    println!("pi_a     = {}", hex::encode(seal.pi_a));
    println!("pi_b     = {}", hex::encode(seal.pi_b));
    println!("pi_c     = {}", hex::encode(seal.pi_c));
    println!("journal  = {}", hex::encode(journal));
    println!("digest   = {}", hex::encode(deathclock_zk::journal_digest(&journal)));

    let out = work_dir.join("seal.json");
    let payload = serde_json::json!({
        "selector": hex::encode(seal.selector),
        "piA": hex::encode(seal.pi_a),
        "piB": hex::encode(seal.pi_b),
        "piC": hex::encode(seal.pi_c),
        "journal": hex::encode(journal),
        "imageId": deathclock_zk_methods::DEATHCLOCK_ZK_GUEST_ID
            .iter()
            .flat_map(|w| w.to_le_bytes())
            .map(|b| format!("{b:02x}"))
            .collect::<String>(),
    });
    fs::write(&out, format!("{payload:#}\n")).map_err(|e| e.to_string())?;
    println!("wrote {}", out.display());
    Ok(())
}

fn main() {
    let phase = env::args().nth(1).unwrap_or_default();
    let result = match phase.as_str() {
        "phase1" => phase1(),
        "phase2" => phase2(),
        other => Err(format!("usage: heartbeat-prover <phase1|phase2>, got {other:?}")),
    };

    if let Err(e) = result {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}
