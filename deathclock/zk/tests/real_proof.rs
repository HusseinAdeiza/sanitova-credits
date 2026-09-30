//! Verifies a REAL Groth16 seal produced by `scripts/prove-heartbeat.sh`.
//!
//! Groth16 proving cannot run inside this build container: RISC Zero wraps the
//! STARK seal into a BN254 proof inside a Docker image, and the host daemon
//! resolves the inner container's `-v` mount, which it cannot see from here.
//! `scripts/prove-heartbeat.sh` therefore runs the image from the host between
//! the two halves and writes `target/risc0-work/{proof.json,seal.json}`.
//!
//! This test validates that output: it parses the prover image's `proof.json`
//! into the router seal and checks every property the on-chain verifier relies
//! on. Run it after the script:
//!
//!   cargo test --release -p deathclock-zk --test real_proof -- --nocapture
//!
//! It is NOT `#[ignore]`d, but it skips (rather than fails) when the proving
//! artifacts are absent, so the unit suite still runs without a GPU-scale
//! proving step.

use deathclock_zk::{groth16_from_proof_json, journal_digest, HeartbeatInput, GROTH16_SEAL_LEN};
use std::{env, fs, path::PathBuf};

/// BN254 base field modulus q, big-endian.
const MODULUS_Q_HEX: &str = "30644e72e131a029b6773a305d761193cafe622860f5baff099600938776056c";

fn work_dir() -> PathBuf {
    env::var("RISC0_WORK_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("target/risc0-work"))
}

#[test]
fn real_groth16_proof_is_a_valid_router_seal() {
    let proof_path = work_dir().join("proof.json");
    if !proof_path.exists() {
        eprintln!(
            "skipping: {} not found. Run scripts/prove-heartbeat.sh first.",
            proof_path.display()
        );
        return;
    }

    let proof_json = fs::read_to_string(&proof_path).expect("reading proof.json");
    let seal = groth16_from_proof_json(&proof_json).expect("proof.json should convert to a router seal");

    // The verifier's `Proof` layout: 64-byte G1, 128-byte G2, 64-byte G1.
    assert_eq!(seal.pi_a.len(), 64);
    assert_eq!(seal.pi_b.len(), 128);
    assert_eq!(seal.pi_c.len(), 64);
    assert_eq!(seal.pi_a.len() + seal.pi_b.len() + seal.pi_c.len(), GROTH16_SEAL_LEN);

    // The selector is 4 bytes of the verifier-parameter digest, not seal bytes.
    assert_eq!(seal.selector.len(), 4);
    assert_ne!(seal.selector, [0, 0, 0, 0], "selector should not be zero");

    // A real proof is not mostly zeroes.
    let non_zero = seal
        .pi_a
        .iter()
        .chain(seal.pi_b.iter())
        .chain(seal.pi_c.iter())
        .filter(|b| **b != 0)
        .count();
    assert!(non_zero > 200, "proof looks empty: only {non_zero} non-zero bytes");

    // pi_a was negated (q - y); check the y coordinate is below q.
    let modulus: [u8; 32] = hex::decode(MODULUS_Q_HEX)
        .expect("modulus hex")
        .try_into()
        .expect("32-byte modulus");
    let y: [u8; 32] = seal.pi_a[32..].try_into().expect("32-byte y coordinate");
    assert!(
        y <= modulus,
        "pi_a y coordinate should be reduced below the base field modulus"
    );

    println!("selector = {}", hex::encode(seal.selector));
    println!("pi_a     = {}", hex::encode(seal.pi_a));
    println!("pi_b     = {}", hex::encode(seal.pi_b));
    println!("pi_c     = {}", hex::encode(seal.pi_c));

    // seal.json is written by phase2 alongside this proof, so its journal is
    // the one this proof actually commits to. Prefer it over anything
    // recomputed from ambient env vars, which may describe a different run.
    let seal_json_path = work_dir().join("seal.json");
    if let Ok(raw) = fs::read_to_string(&seal_json_path) {
        let recorded: serde_json::Value =
            serde_json::from_str(&raw).expect("seal.json should be valid JSON");

        let recorded_journal = hex::decode(recorded["journal"].as_str().expect("journal field"))
            .expect("journal hex");
        let journal: [u8; 64] = recorded_journal.try_into().expect("64-byte journal");
        println!("journal  = {}", hex::encode(journal));
        println!("digest   = {}", hex::encode(journal_digest(&journal)));

        // The image ID the seal was produced against must equal the constant the
        // Solana program pins, or the on-chain verification will revert.
        let image_id = recorded["imageId"].as_str().expect("imageId field");
        let expected = hex::encode(crate_pinned_image_id());
        assert_eq!(
            image_id, expected,
            "seal.json imageId does not match the program's pinned HEARTBEAT_IMAGE_ID"
        );
        println!("image_id = {image_id} (matches pinned HEARTBEAT_IMAGE_ID)");

        // And the journal must be the one the program recomputes from the
        // proving input, when that input is known.
        if let (Some(owner), Some(timestamp), Some(nonce)) = (
            env::var("DEATHCLOCK_OWNER").ok(),
            env::var("DEATHCLOCK_TIMESTAMP").ok().and_then(|t| t.parse::<u64>().ok()),
            env::var("DEATHCLOCK_NONCE").ok(),
        ) {
            let input = HeartbeatInput::new(
                hex::decode(&owner).expect("owner hex").try_into().expect("32 bytes"),
                timestamp,
                hex::decode(&nonce).expect("nonce hex").try_into().expect("24 bytes"),
            );
            assert_eq!(
                journal,
                input.expected_journal_outputs(),
                "journal does not match the proving input"
            );
        }
    }
}

/// The image ID the Solana program pins, mirrored here so a drift between the
/// rebuilt guest and the on-chain constant fails loudly in the prover tests.
fn crate_pinned_image_id() -> [u8; 32] {
    deathclock_zk_methods::DEATHCLOCK_ZK_GUEST_ID
        .iter()
        .flat_map(|word| word.to_le_bytes())
        .collect::<Vec<u8>>()
        .try_into()
        .expect("image ID is 32 bytes")
}
