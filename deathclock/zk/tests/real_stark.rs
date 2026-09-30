//! Real STARK proving, which works inside the build container.
//!
//! Run with:
//!   cargo test --release -p deathclock-zk --test real_stark -- --ignored --nocapture
//!
//! The Groth16 half is deliberately NOT here: RISC Zero wraps the STARK seal
//! into a BN254 proof inside a Docker image, and the host daemon cannot resolve
//! the inner container's mount from within this build container. That half runs
//! from the host via `scripts/prove-heartbeat.sh`, which produces a real,
//! on-chain-verifiable seal and checks the image ID against the program's pinned
//! `HEARTBEAT_IMAGE_ID`.

use deathclock_zk::{prove_heartbeat_stark, HeartbeatInput, JOURNAL_OUTPUT_LEN};

#[test]
#[ignore = "requires a full STARK proving run"]
fn proves_a_real_stark_receipt_with_the_expected_journal() {
    let input = HeartbeatInput::new([0x42u8; 32], 1_700_000_000, [0x17u8; 24]);

    let journal = prove_heartbeat_stark(input).expect("STARK proving should succeed");

    assert_eq!(journal.len(), JOURNAL_OUTPUT_LEN);
    // This is the exact byte string the Solana program hashes to
    // `journal_digest` and checks against the vault owner + live clock.
    assert_eq!(journal.as_slice(), input.expected_journal_outputs());
    assert_ne!(&journal[..32], &[0u8; 32][..], "journal commitment is non-zero");

    println!("journal = {}", hex::encode(&journal));
    println!(
        "digest  = {}",
        hex::encode(deathclock_zk::journal_digest(
            &journal.as_slice().try_into().expect("64 bytes")
        ))
    );
}
