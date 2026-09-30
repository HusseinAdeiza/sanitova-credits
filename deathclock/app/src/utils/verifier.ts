// Addresses and selector needed to route a heartbeat proof through RISC Zero's
// verifier router.
//
// IMPORTANT: these are the addresses from the official risc0-solana
// `solana-verifier/Anchor.toml` `[programs.localnet]` table, i.e. the LOCALNET
// deployments. Devnet uses different addresses, because the same program binary
// is deployed per-cluster. Do not present these as devnet addresses without
// deploying the router and the Groth16 verifier there and reading the resulting
// IDs back off-chain.
//
// The router PDA and verifier-entry PDA are derived, not constants: the
// verifier entry depends on the seal's 4-byte selector, which only a prover
// knows.
import { PublicKey } from "@solana/web3.js";

/** `verifier_router` — the CPI entrypoint that routes to a verifier. */
export const ROUTER_PROGRAM_ID = new PublicKey("6JvFfBrvCcWgANKh1Eae9xDq4RC6cfJuBcf71rp2k9Y7");

/** `groth_16_verifier` — the BN254 verifier the router dispatches to. */
export const GROTH16_VERIFIER_PROGRAM_ID = new PublicKey("THq1qFYQoh7zgcjXoMXduDBqiZRCPeg3PvvMbrVQUge");

/**
 * First 4 bytes of the Groth16 verifier-parameter digest for RISC Zero 3.0.5,
 * which is what the vendored verifier and the `deathclock-zk` prover agree on.
 * It commits to the verification key and the control IDs, so it is a property
 * of the installed RISC Zero version rather than of any particular proof.
 *
 * The prover prints the authoritative value; see `scripts/prove-heartbeat.sh`
 * and `zk/src/lib.rs::seal_selector`.
 */
export const SEAL_SELECTOR = Uint8Array.from([0x73, 0xc4, 0x57, 0xba]);

/** Router state PDA: `["router"]` under the router program. */
export function routerStateAddress(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("router")], ROUTER_PROGRAM_ID)[0];
}

/** Verifier entry PDA: `["verifier", selector]` under the router program. */
export function verifierEntryAddress(selector: number[] | Uint8Array): PublicKey {
  const bytes = Uint8Array.from(selector);
  if (bytes.length !== 4) {
    throw new Error(`RISC Zero selector must be 4 bytes, got ${bytes.length}.`);
  }
  return PublicKey.findProgramAddressSync(
    [Buffer.from("verifier"), Buffer.from(bytes)],
    ROUTER_PROGRAM_ID,
  )[0];
}
