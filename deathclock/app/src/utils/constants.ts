// Cluster configuration.
//
// Every value is overridable at build time so one codebase serves localnet
// (`npm run dev` against the Docker validator) and the public demo without a
// code edit. The defaults are the DEVNET deployment, because that is what the
// hosted site must talk to; localnet is opt-in via the environment.
//
// Program ids are NOT secrets and are safe to inline. The values here are the
// devnet addresses verified on-chain (executable, owned by BPFLoaderUpgradeab1)
// and kept in sync with scripts/program-ids.ts, which is the single source of
// truth. A stale id here is the failure mode that makes a live site silently
// query a program that is not there, so the two files must agree.

const DEVNET_PROGRAM_ID = "C8unxtjoDZWy2GmwHUPuSve1BHT5TtRKpNaDofbMS5Vh";

export const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID || DEVNET_PROGRAM_ID;

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

/** `devnet` | `localnet`, used only for explorer links. */
export const NETWORK = process.env.NEXT_PUBLIC_NETWORK || "devnet";

export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL || "https://explorer.solana.com";

export const HEARTBEAT_INTERVAL = 30 * 24 * 60 * 60;
export const CHALLENGE_PERIOD = 48 * 60 * 60;
export const FEE_BPS = 5;

/** Explorer deep link for an address or signature on the configured cluster. */
export function explorerLink(kind: "address" | "tx", value: string): string {
  const cluster = NETWORK === "localnet" ? "" : `?cluster=${NETWORK}`;
  return `${EXPLORER_URL}/${kind}/${value}${cluster}`;
}
