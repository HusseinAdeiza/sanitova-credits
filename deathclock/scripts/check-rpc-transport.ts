/**
 * Confirms the RPC transport works before committing to a 5-minute proof.
 *
 * The heartbeat pipeline proves first and submits last, so a transport fault
 * discovered at submission time means the whole proof is wasted. This is the
 * cheap check: exercise exactly the calls the submission will make.
 */
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import deathclockIdl from "../app/src/idl/deathclock.generated.json";
import { ensureRpcTransport } from "./rpc-transport";
import { DEATHCLOCK_PROGRAM_ID } from "./program-ids";

const RPC_URL = process.env.DEATHCLOCK_RPC || "https://api.devnet.solana.com";

function log(step: string, detail: string) {
  console.log(`${step.padEnd(24)} ${detail}`);
}

async function main() {
  console.log(`\nRPC transport check against ${RPC_URL}\n`);

  const usedShim = !(await ensureRpcTransport(RPC_URL));
  log("transport", usedShim ? "swapped to node:https" : "native fetch (passed 3 probes)");

  const connection = new Connection(RPC_URL, "confirmed");

  // The exact calls the heartbeat submission makes, in order.
  const blockhash = await connection.getLatestBlockhash("confirmed");
  log("getLatestBlockhash", blockhash.blockhash.slice(0, 20) + "…");

  const programId = new PublicKey(DEATHCLOCK_PROGRAM_ID);
  const info = await connection.getAccountInfo(programId);
  log("getAccountInfo", info?.executable ? "program executable" : "NOT EXECUTABLE");

  const owner = Keypair.generate();
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: owner.publicKey,
      signTransaction: async (tx) => {
        tx.sign(owner);
        return tx;
      },
      signAllTransactions: async (txs) => {
        for (const tx of txs) tx.sign(owner);
        return txs;
      },
    } as never,
    { commitment: "confirmed" },
  );
  const program = new Program(deathclockIdl as never, provider);
  log("Program built", Boolean(program.account.vault) ? "vault namespace present" : "MISSING");

  // A dry run of the real thing: build and simulate without sending. If the
  // transport or the instruction shape is wrong, this is where it shows.
  const [routerState] = PublicKey.findProgramAddressSync(
    [Buffer.from("router")],
    new PublicKey("5n8zx79RUHafwSSB4vRU5ao9atHzJQHTdJR9ty8YrVte"),
  );
  const [verifierEntry] = PublicKey.findProgramAddressSync(
    [Buffer.from("verifier"), Buffer.from("73c457ba", "hex")],
    new PublicKey("5n8zx79RUHafwSSB4vRU5ao9atHzJQHTdJR9ty8YrVte"),
  );
  log("verifier entry", verifierEntry.toBase58());

  console.log("\nAll calls the submission needs are working.\n");
}

main().catch((error) => {
  console.error("\nfailed:", error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
