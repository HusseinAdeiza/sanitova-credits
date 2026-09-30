// Single source of truth for the compiled program IDs and the PDAs derived
// from them. Every script and test imports from here so that changing a
// program's identity is a one-line edit rather than a hunt through the tree.
//
// These values are baked into the binaries at build time via declare_id!,
// and MUST also match:
//   - [programs.devnet] in Anchor.toml (which OVERRIDES declare_id!)
//   - [programs.devnet] in vendor/risc0-solana/solana-verifier/Anchor.toml
//   - the deployed keypairs in target/devnet/*-keypair.json
//
// Getting this wrong fails silently in a specific way: Anchor.toml wins, the
// build embeds the stale id, and the program deploys to the wrong address.
// Verify a build with the generated IDL's "address" field, never with the ELF.

import { PublicKey } from "@solana/web3.js";

/** Devnet deployment, verified on-chain (executable, BPFLoaderUpgradeab1). */
export const DEATHCLOCK_PROGRAM_ID =
  "C8unxtjoDZWy2GmwHUPuSve1BHT5TtRKpNaDofbMS5Vh";
export const ROUTER_PROGRAM_ID =
  "5n8zx79RUHafwSSB4vRU5ao9atHzJQHTdJR9ty8YrVte";
export const GROTH16_VERIFIER_PROGRAM_ID =
  "2iPoTWMXWJ6inLnBeGEZyiKkwEzaQvCX24Cp82UcWm8K";

// Derived from ROUTER_PROGRAM_ID with scripts/derive-pdas.ts.
export const ROUTER_STATE = "7NHg6MZbtSaxJ7DQzdFCXLd1ZCJgHiYA2epxbGYYcPpQ";
export const VERIFIER_ENTRY = "HFAWG7uYosXrfWHho4Q7Q3BqxcqqEAA8UsRUhjskHycF";

// Groth16ReceiptVerifierParameters::default().digest()[0..4]
export const SELECTOR = [0x73, 0xc4, 0x57, 0xba];

// The same addresses as ready-to-use keys, for callers that pass them straight
// into web3.js (PDA derivation, Anchor `.accounts({...})`). Anchor also accepts
// a base58 string there, but `PublicKey.findProgramAddressSync` requires a
// real PublicKey, so exporting only the strings silently broke that.
export const DEATHCLOCK_PROGRAM = new PublicKey(DEATHCLOCK_PROGRAM_ID);
export const ROUTER_PROGRAM = new PublicKey(ROUTER_PROGRAM_ID);
export const GROTH16_VERIFIER_PROGRAM = new PublicKey(GROTH16_VERIFIER_PROGRAM_ID);
export const ROUTER_STATE_PDA = new PublicKey(ROUTER_STATE);
export const VERIFIER_ENTRY_PDA = new PublicKey(VERIFIER_ENTRY);
