// Addresses needed to route a heartbeat proof through RISC Zero's verifier
// router: DeathClock CPIs into `verifier_router`, which dispatches to the
// Groth16 verifier selected by the seal's 4-byte selector.
//
// The same program binaries are deployed per-cluster, so each cluster has its
// own addresses. Defaults are the DEVNET deployment (see scripts/program-ids.ts,
// which is the single source of truth); localnet values are opt-in overrides.
// Hardcoding one cluster's ids while pointing the RPC at another produces a
// site that loads and then fails on the first proof, so these follow the same
// env-driven pattern as constants.ts.
import { PublicKey } from "@solana/web3.js";

const DEVNET_ROUTER_PROGRAM_ID = "5n8zx79RUHafwSSB4vRU5ao9atHzJQHTdJR9ty8YrVte";
const DEVNET_GROTH16_VERIFIER_PROGRAM_ID = "2iPoTWMXWJ6inLnBeGEZyiKkwEzaQvCX24Cp82UcWm8K";

/** `verifier_router` — the CPI entrypoint that routes to a verifier. */
export const ROUTER_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_ROUTER_PROGRAM_ID || DEVNET_ROUTER_PROGRAM_ID,
);

/** `groth_16_verifier` — the BN254 verifier the router dispatches to. */
export const GROTH16_VERIFIER_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_GROTH16_VERIFIER_PROGRAM_ID || DEVNET_GROTH16_VERIFIER_PROGRAM_ID,
);

/**
 * First 4 bytes of the Groth16 verifier-parameter digest for RISC Zero 3.0.5,
 * which is what the vendored verifier and the `deathclock-zk` prover agree on.
 * It commits to the verification key and the control IDs, so it is a property
 * of the installed RISC Zero version rather than of any particular proof.
 *
 * The prover prints the authoritative value; see `scripts/prove-heartbeat.sh`
 * and `zk/src/lib.rs::seal_selector`. It is only a client-side convenience for
 * deriving the verifier-entry PDA — the program derives and checks the real
 * value, so a wrong constant here cannot forge an accepted proof.
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
