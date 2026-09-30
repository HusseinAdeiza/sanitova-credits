//! RISC Zero guest for a DeathClock heartbeat receipt.
//!
//! Reads one 64-byte input slice — owner public key (32) || timestamp (8, LE)
//! || nonce (24) — and commits the exact output bytes the Solana program
//! validates after the RISC Zero receipt verifies: a SHA-256 commitment over
//! that slice, followed by the timestamp and nonce.
//!
//! The guest commits plain owner/timestamp/nonce, so the output is public. The
//! value the ZK proof adds is not secrecy but attestation: only the committed
//! program running on the pinned image can have produced this journal, and the
//! on-chain check ties it to the vault owner and the live cluster clock.

use risc0_zkvm::guest::env;
use sha2::{Digest, Sha256};

const INPUT_LEN: usize = 64;

fn main() {
    let mut input = [0u8; INPUT_LEN];
    env::read_slice(&mut input);

    let commitment: [u8; 32] = Sha256::digest(input).into();
    env::commit_slice(&commitment);
    env::commit_slice(&input[32..40]);
    env::commit_slice(&input[40..INPUT_LEN]);
}
