/**
 * Reports the current upgrade authority of the deployed devnet programs.
 *
 * The heartbeat cannot complete on a public cluster unless the router PDA owns
 * the verifier's upgrade authority, because that is what makes revocation real.
 * This reads the ProgramData accounts directly rather than shelling out to
 * `solana program show`, which prints nothing useful under this shell.
 */
import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL = process.env.DEATHCLOCK_RPC || "https://api.devnet.solana.com";
const LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const ROUTER_PDA = new PublicKey("62PvmsCfYiaytGSR6tT9sxJrW1WMhxNrPMN6DVx3SeB6");

const PROGRAMS: [string, string][] = [
  ["DeathClock", "C8unxtjoDZWy2GmwHUPuSve1BHT5TtRKpNaDofbMS5Vh"],
  ["verifier_router", "5n8zx79RUHafwSSB4vRU5ao9atHzJQHTdJR9ty8YrVte"],
  ["groth_16_verifier", "2iPoTWMXWJ6inLnBeGEZyiKkwEzaQvCX24Cp82UcWm8K"],
];

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  console.log(`\nUpgrade authorities on ${RPC_URL}\n`);

  for (const [name, address] of PROGRAMS) {
    const programId = new PublicKey(address);
    const [programDataAddress] = PublicKey.findProgramAddressSync(
      [programId.toBuffer()],
      LOADER,
    );

    const info = await connection.getAccountInfo(programDataAddress);
    if (!info) {
      console.log(`${name.padEnd(18)} ProgramData missing — not an upgradeable program`);
      continue;
    }

    // ProgramData layout: u32 enum (=2) | u64 last_deployed_slot | Option<Pubkey>
    // The Option tag is one byte, then the 32-byte authority when present.
    const data = info.data;
    const lastDeployedSlot = Number(data.readBigUInt64LE(4));
    const hasAuthority = data[12] === 1;
    const authority = hasAuthority ? new PublicKey(data.subarray(13, 45)).toBase58() : null;

    console.log(`${name}`);
    console.log(`  program     ${address}`);
    console.log(`  slot        ${lastDeployedSlot}`);
    console.log(`  authority   ${authority ?? "(none — immutable)"}`);
    if (authority) {
      console.log(`  === router PDA? ${authority === ROUTER_PDA.toBase58()}`);
    }
    console.log();
  }
}

main().catch((error) => {
  console.error("failed:", error);
  process.exitCode = 1;
});
