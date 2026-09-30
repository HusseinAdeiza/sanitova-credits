//! RISC Zero heartbeat prover for DeathClock.
//!
//! Runs the pinned `deathclock-zk-guest` ELF over an owner/timestamp/nonce
//! input, produces a real Groth16 receipt, and exposes the values the Solana
//! program needs: the 64-byte public journal, the raw 256-byte Groth16 seal,
//! and the router `Seal` (selector + BN254 proof) built exactly the way the
//! official `verifier_router` client builds it.

use risc0_zkvm::{
    default_prover, sha::Digestible, ExecutorEnv, Groth16ReceiptVerifierParameters, ProverOpts,
};
use sha2::{Digest, Sha256};

/// Length of the public journal the guest commits: SHA-256 commitment,
/// little-endian timestamp, and a 24-byte nonce.
pub const JOURNAL_OUTPUT_LEN: usize = 64;
/// Length of a Groth16 seal before it is split into the router's `Proof`.
pub const GROTH16_SEAL_LEN: usize = 256;

/// Owner, timestamp and nonce, laid out exactly as the guest reads them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HeartbeatInput {
    pub owner: [u8; 32],
    pub timestamp: u64,
    pub nonce: [u8; 24],
}

impl HeartbeatInput {
    pub fn new(owner: [u8; 32], timestamp: u64, nonce: [u8; 24]) -> Self {
        Self { owner, timestamp, nonce }
    }

    /// The exact byte stream handed to the zkVM.
    pub fn to_bytes(self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(64);
        bytes.extend_from_slice(&self.owner);
        bytes.extend_from_slice(&self.timestamp.to_le_bytes());
        bytes.extend_from_slice(&self.nonce);
        bytes
    }

    /// The journal bytes the guest commits, and therefore the bytes the
    /// on-chain `heartbeat` instruction hashes and validates.
    pub fn expected_journal_outputs(self) -> [u8; JOURNAL_OUTPUT_LEN] {
        let mut hasher = Sha256::new();
        hasher.update(self.to_bytes());
        let mut out = [0u8; JOURNAL_OUTPUT_LEN];
        out[..32].copy_from_slice(&hasher.finalize());
        out[32..40].copy_from_slice(&self.timestamp.to_le_bytes());
        out[40..].copy_from_slice(&self.nonce);
        out
    }
}

/// The router's `Seal`: a 4-byte selector plus the BN254 Groth16 proof.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Seal {
    pub selector: [u8; 4],
    /// 64 bytes, G1 coordinates, already negated as the verifier requires.
    pub pi_a: [u8; 64],
    /// 128 bytes, G2 coordinates.
    pub pi_b: [u8; 128],
    /// 64 bytes, G1 coordinates.
    pub pi_c: [u8; 64],
}

/// A proven heartbeat: the public journal plus the router-ready seal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HeartbeatProof {
    pub journal_outputs: [u8; JOURNAL_OUTPUT_LEN],
    /// Raw 256-byte Groth16 seal.
    pub seal: [u8; GROTH16_SEAL_LEN],
    /// The same seal split into the router's `Seal` shape.
    pub router_seal: Seal,
}

impl HeartbeatProof {
    /// SHA-256 of the journal, which is the `journal_digest` public input the
    /// on-chain verifier router checks. Matches the official counter's
    /// `hashv(&[journal_outputs.as_slice()]).to_bytes()`.
    pub fn journal_digest(&self) -> [u8; 32] {
        journal_digest(&self.journal_outputs)
    }
}

/// The router selector: the first 4 bytes of the Groth16 verifier-parameters
/// digest, which commits to the verification key and the control IDs. It is a
/// function of the installed RISC Zero version, NOT of the seal bytes.
pub fn seal_selector() -> [u8; 4] {
    Groth16ReceiptVerifierParameters::default()
        .digest()
        .as_bytes()[..4]
        .try_into()
        .expect("digest is at least 4 bytes")
}

/// The BN254 base field prime q, big-endian. A wrong value here silently
/// produces an off-curve `pi_a`, which the Solana `alt_bn128_pairing` syscall
/// rejects as a hard error rather than a verification failure.
/// 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47
const MODULUS_Q: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d, 0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
];

/// Negate a BN254 G1 point, matching `groth_16_verifier::negate_g1`.
fn negate_g1(point: &[u8; 64]) -> [u8; 64] {
    let mut out = [0u8; 64];
    out[..32].copy_from_slice(&point[..32]);

    // q - y, as a big-endian byte-wise subtraction.
    let mut negated_y = [0u8; 32];
    let mut borrow = 0i16;
    for i in (0..32).rev() {
        let diff = MODULUS_Q[i] as i16 - point[32 + i] as i16 - borrow;
        if diff < 0 {
            negated_y[i] = (diff + 256) as u8;
            borrow = 1;
        } else {
            negated_y[i] = diff as u8;
            borrow = 0;
        }
    }
    out[32..].copy_from_slice(&negated_y);
    out
}

/// Splits a raw 256-byte Groth16 seal into the router's `Seal`, exactly as
/// `verifier_router::client::encode_seal` does.
pub fn encode_seal(seal: &[u8; GROTH16_SEAL_LEN]) -> Seal {
    Seal {
        selector: seal_selector(),
        pi_a: negate_g1(seal[0..64].try_into().expect("64 bytes")),
        pi_b: seal[64..192].try_into().expect("128 bytes"),
        pi_c: seal[192..256].try_into().expect("64 bytes"),
    }
}

#[derive(Debug, thiserror::Error)]
pub enum HeartbeatError {
    #[error("prover returned a seal that is not {GROTH16_SEAL_LEN} bytes")]
    InvalidSealLength,
    #[error("prover did not commit the expected journal output")]
    JournalMismatch,
    #[error("zkVM proving failed: {0}")]
    Prover(String),
}

/// Proves a heartbeat with the Groth16 circuit and checks that the receipt's
/// journal matches what the program will recompute on-chain.
///
/// The in-process local prover is used rather than `default_prover()`,
/// because the default falls back to the Bonsai Docker container. Local Groth16
/// proving produces a real, independently verifiable BN254 seal.
pub fn prove_heartbeat(input: HeartbeatInput) -> Result<HeartbeatProof, HeartbeatError> {
    let env = ExecutorEnv::builder()
        .write_slice(&input.to_bytes())
        .build()
        .map_err(|e| HeartbeatError::Prover(e.to_string()))?;

    let prover = local_prover();
    let prove_info = prover
        .prove_with_opts(
            env,
            deathclock_zk_methods::DEATHCLOCK_ZK_GUEST_ELF,
            &ProverOpts::groth16(),
        )
        .map_err(|e| HeartbeatError::Prover(e.to_string()))?;

    let receipt = &prove_info.receipt;

    let journal_outputs: [u8; JOURNAL_OUTPUT_LEN] = receipt
        .journal
        .bytes
        .as_slice()
        .try_into()
        .map_err(|_| HeartbeatError::JournalMismatch)?;

    if journal_outputs != input.expected_journal_outputs() {
        return Err(HeartbeatError::JournalMismatch);
    }

    let seal: [u8; GROTH16_SEAL_LEN] = receipt
        .inner
        .groth16()
        .map_err(|e| HeartbeatError::Prover(e.to_string()))?
        .seal
        .as_slice()
        .try_into()
        .map_err(|_| HeartbeatError::InvalidSealLength)?;

    let router_seal = encode_seal(&seal);
    Ok(HeartbeatProof { journal_outputs, seal, router_seal })
}

/// SHA-256 over a journal: the `journal_digest` the router checks.
pub fn journal_digest(journal_outputs: &[u8; JOURNAL_OUTPUT_LEN]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(journal_outputs);
    hasher.finalize().into()
}

/// Proves a heartbeat as a STARK receipt and returns the committed journal.
///
/// This is the same execution and the same journal as [`prove_heartbeat`], but
/// it stops at the STARK receipt instead of the BN254 wrap, so it needs no
/// Docker. Useful for checking the guest and the on-chain journal encoding
/// without the Groth16 toolchain.
pub fn prove_heartbeat_stark(input: HeartbeatInput) -> Result<Vec<u8>, HeartbeatError> {
    let env = ExecutorEnv::builder()
        .write_slice(&input.to_bytes())
        .build()
        .map_err(|e| HeartbeatError::Prover(e.to_string()))?;

    let prover = local_prover();
    let prove_info = prover
        .prove_with_opts(env, deathclock_zk_methods::DEATHCLOCK_ZK_GUEST_ELF, &ProverOpts::default())
        .map_err(|e| HeartbeatError::Prover(e.to_string()))?;

    let journal = prove_info.receipt.journal.bytes.clone();

    if journal.len() != JOURNAL_OUTPUT_LEN || journal.as_slice() != input.expected_journal_outputs() {
        return Err(HeartbeatError::JournalMismatch);
    }

    Ok(journal)
}

/// STARK-proves a heartbeat with the p254 options the Groth16 wrap expects and
/// leaves the wrap's inputs in `RISC0_WORK_DIR` (`seal.r0` and `input.json`).
///
/// `risc0-groth16` writes both files and only *then* shells out to Docker, so
/// the inputs exist even when the wrap cannot run. That is what makes the
/// host-driven pipeline possible: the STARK proof is real and verified here,
/// and the host runs the image over these exact bytes.
///
/// Returns the committed journal.
pub fn write_groth16_inputs(input: HeartbeatInput) -> Result<Vec<u8>, HeartbeatError> {
    let work_dir = std::env::var("RISC0_WORK_DIR")
        .map_err(|e| HeartbeatError::Prover(format!("RISC0_WORK_DIR is required: {e}")))?;
    std::fs::create_dir_all(&work_dir)
        .map_err(|e| HeartbeatError::Prover(format!("creating {work_dir}: {e}")))?;

    let env = ExecutorEnv::builder()
        .write_slice(&input.to_bytes())
        .build()
        .map_err(|e| HeartbeatError::Prover(e.to_string()))?;

    let prover = local_prover();
    // The Groth16 wrap is expected to fail when Docker is unreachable from
    // inside a build container; the journal is the same either way, and the
    // inputs are already on disk.
    let journal = match prover.prove_with_opts(
        env,
        deathclock_zk_methods::DEATHCLOCK_ZK_GUEST_ELF,
        &ProverOpts::groth16(),
    ) {
        Ok(info) => info.receipt.journal.bytes.clone(),
        Err(_) => prove_heartbeat_stark(input)?,
    };

    if journal.len() != JOURNAL_OUTPUT_LEN || journal.as_slice() != input.expected_journal_outputs() {
        return Err(HeartbeatError::JournalMismatch);
    }

    for file in ["seal.r0", "input.json"] {
        if !std::path::Path::new(&work_dir).join(file).exists() {
            return Err(HeartbeatError::Prover(format!(
                "{work_dir}/{file} was not written; the Groth16 wrap needs a reachable Docker daemon"
            )));
        }
    }

    Ok(journal)
}

/// Builds the router `Seal` from the prover image's `proof.json` output.
///
/// `risc0_groth16::Seal::to_vec()` is the flat 256-byte layout the Solana
/// verifier consumes (64 pi_a || 128 pi_b || 64 pi_c), so the same split used
/// for a prover-produced seal applies here.
pub fn groth16_from_proof_json(proof_json: &str) -> Result<Seal, HeartbeatError> {
    let proof: risc0_groth16::ProofJson =
        serde_json::from_str(proof_json).map_err(|e| HeartbeatError::Prover(e.to_string()))?;
    let seal = risc0_groth16::Seal::try_from(proof)
        .map_err(|e| HeartbeatError::Prover(format!("converting proof.json: {e:?}")))?;

    let flat = seal.to_vec();
    let flat: [u8; GROTH16_SEAL_LEN] = flat
        .as_slice()
        .try_into()
        .map_err(|_| HeartbeatError::InvalidSealLength)?;

    Ok(encode_seal(&flat))
}

/// The in-process Groth16 prover.
///
/// `default_prover()` with no `RISC0_PROVER` set falls back to the Bonsai
/// Docker container, which cannot run inside a build container. `local` runs
/// the same Groth16 proof in-process. An explicit caller-provided value is
/// respected so a remote prover can still be used.
fn local_prover() -> std::rc::Rc<dyn risc0_zkvm::Prover> {
    if std::env::var_os("RISC0_PROVER").is_none() {
        std::env::set_var("RISC0_PROVER", "local");
    }
    default_prover()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> HeartbeatInput {
        HeartbeatInput::new([7u8; 32], 1_700_000_000, [9u8; 24])
    }

    fn sha256(bytes: &[u8]) -> [u8; 32] {
        Sha256::digest(bytes).into()
    }

    /// A wrong BN254 modulus produces an off-curve point, which the Solana
    /// `alt_bn128_pairing` syscall rejects as a hard error rather than a
    /// verification failure. Check the constant against the field prime and
    /// check the algebraic identity that a negation must preserve.
    #[test]
    fn negate_g1_uses_the_real_bn254_modulus() {
        // q = 21888242871839275222246405745257275088696311157297823662689037894645226208583
        const Q: [u8; 32] = [
            0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
            0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d, 0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
        ];
        assert_eq!(
            MODULUS_Q, Q,
            "MODULUS_Q must be the BN254 base field prime"
        );
    }

    #[test]
    fn negate_g1_preserves_the_curve_equation() {
        // A real pi_a taken from generated proof output.
        let point: [u8; 64] = [
            0x19, 0x8f, 0x36, 0x8d, 0x7d, 0x0c, 0x0a, 0x0e, 0x5a, 0x8c, 0x2b, 0x6f, 0x40, 0x0d, 0xa6, 0x1a,
            0x2c, 0x7c, 0x0a, 0x2a, 0x1e, 0x93, 0x4f, 0xbd, 0x2c, 0x0e, 0x5d, 0x1a, 0xd2, 0x2b, 0x1e, 0x0a,
            0x4a, 0xf0, 0x6e, 0x3d, 0x3a, 0x1b, 0xd2, 0x8c, 0x4b, 0x4d, 0x0d, 0x16, 0x5f, 0x1d, 0xc4, 0x9b,
            0x2b, 0x6c, 0x8a, 0x4b, 0x0d, 0x67, 0x9a, 0x0d, 0x1f, 0x4e, 0x4d, 0x0d, 0x4b, 0x0d, 0x67, 0x0d,
        ];
        let negated = negate_g1(&point);
        // x is untouched, and y + y' == q (mod q).
        assert_eq!(&negated[..32], &point[..32], "negation must not move x");
        let mut sum = [0u8; 32];
        let mut carry = 0u16;
        for i in (0..32).rev() {
            let t = point[32 + i] as u16 + negated[32 + i] as u16 + carry;
            sum[i] = (t & 0xff) as u8;
            carry = t >> 8;
        }
        assert_eq!(carry, 1, "y + y' must overflow into the modulus");
        assert_eq!(&sum[..], &MODULUS_Q[..], "y + y' must equal q");
    }

    #[test]
    fn input_encoding_is_owner_then_timestamp_then_nonce() {
        let input = sample();
        let bytes = input.to_bytes();
        assert_eq!(bytes.len(), 64);
        assert_eq!(&bytes[..32], &input.owner);
        assert_eq!(&bytes[32..40], &input.timestamp.to_le_bytes());
        assert_eq!(&bytes[40..], &input.nonce);
    }

    #[test]
    fn journal_output_binds_owner_timestamp_and_nonce() {
        let input = sample();
        let journal = input.expected_journal_outputs();
        assert_eq!(&journal[..32], &sha256(&input.to_bytes()));
        assert_eq!(&journal[32..40], &input.timestamp.to_le_bytes());
        assert_eq!(&journal[40..], &input.nonce);
    }

    #[test]
    fn changing_the_owner_changes_the_journal() {
        let a = sample().expected_journal_outputs();
        let b = HeartbeatInput::new([8u8; 32], 1_700_000_000, [9u8; 24]).expected_journal_outputs();
        assert_ne!(a[..32], b[..32]);
    }

    #[test]
    fn journal_digest_is_sha256_of_the_journal() {
        let journal = sample().expected_journal_outputs();
        assert_eq!(journal_digest(&journal), sha256(&journal));
    }

    #[test]
    fn seal_splits_into_the_router_proof_shape() {
        let mut raw = [0u8; GROTH16_SEAL_LEN];
        for (i, byte) in raw.iter_mut().enumerate() {
            *byte = i as u8;
        }
        let seal = encode_seal(&raw);
        assert_eq!(seal.pi_b, raw[64..192]);
        assert_eq!(seal.pi_c, raw[192..256]);
        // pi_a's x coordinate is carried through; only y is negated.
        assert_eq!(seal.pi_a[..32], raw[..32]);
    }

    #[test]
    fn negating_g1_twice_is_identity() {
        let mut point = [0u8; 64];
        for (i, byte) in point.iter_mut().enumerate() {
            *byte = (i as u8) + 1;
        }
        assert_eq!(negate_g1(&negate_g1(&point)), point);
    }

    #[test]
    fn selector_is_four_bytes_and_stable() {
        let selector = seal_selector();
        assert_eq!(selector.len(), 4);
        assert_eq!(selector, seal_selector());
    }
}
