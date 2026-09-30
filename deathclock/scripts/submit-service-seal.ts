/**
 * Submits a heartbeat using a seal from the proving service.
 *
 * This is the end of the loop the service exists to close: the browser asks
 * for a proof, waits, and submits what comes back. The service is verified
 * separately; this proves the returned seal is actually accepted on-chain, so
 * "the service returned a seal" is never mistaken for "the heartbeat works".
 *
 * Usage:
 *   npx tsx scripts/submit-service-seal.ts <jobId>
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import deathclockIdl from "../app/src/idl/deathclock.generated.json";
import { ensureRpcTransport } from "./rpc-transport";
import {
  DEATHCLOCK_PROGRAM_ID,
  ROUTER_PROGRAM_ID,
  GROTH16_VERIFIER_PROGRAM_ID,
} from "./program-ids";

const RPC_URL = process.env.DEATHCLOCK_RPC || "https://api.devnet.solana.com";
const PROOF_MAX_AGE_SECONDS = 300;

function log(step: string, detail: string) {
  console.log(`${step.padEnd(24)} ${detail}`);
}

function toByteArray(hex: string): number[] {
  return Array.from(Buffer.from(hex, "hex"));
}

async function main() {
  const jobId = process.argv[2];
  if (!jobId) throw new Error("usage: submit-service-seal.ts <jobId>");

  await ensureRpcTransport(RPC_URL);

  const job = JSON.parse(
    readFileSync(join("target", "prover-queue", `${jobId}.json`), "utf8"),
  ) as {
    status: string;
    owner: string;
    timestamp: number;
    seal?: {
      selector: string;
      piA: string;
      piB: string;
      piC: string;
      journal: string;
    };
    error?: string;
  };

  if (job.status !== "ready" || !job.seal) {
    throw new Error(`Job ${jobId} is ${job.status}: ${job.error ?? "no seal"}`);
  }
  log("job", `${jobId} ready`);

  const secret = JSON.parse(
    readFileSync(
      process.env.DEATHCLOCK_SOLANA_KEYPAIR || join(homedir(), ".config", "solana", "id.json"),
      "utf8",
    ),
  ) as number[];
  const owner = Keypair.fromSecretKey(Uint8Array.from(secret));

  const age = Math.floor(Date.now() / 1000) - job.timestamp;
  log("freshness", `${age}s old (limit ${PROOF_MAX_AGE_SECONDS}s)`);
  if (age > PROOF_MAX_AGE_SECONDS) {
    throw new Error(`Seal expired: ${age}s > ${PROOF_MAX_AGE_SECONDS}s. Request a new one.`);
  }

  const connection = new Connection(RPC_URL, "confirmed");
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
  const programId = new PublicKey(DEATHCLOCK_PROGRAM_ID);
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.publicKey.toBuffer()],
    programId,
  );

  const router = new PublicKey(ROUTER_PROGRAM_ID);
  const [routerState] = PublicKey.findProgramAddressSync([Buffer.from("router")], router);
  const [verifierEntry] = PublicKey.findProgramAddressSync(
    [Buffer.from("verifier"), Buffer.from(job.seal.selector, "hex")],
    router,
  );
  log("vault", vault.toBase58());

  const signature = await program.methods
    .heartbeat(
      {
        selector: toByteArray(job.seal.selector),
        // Nested under `proof`, per the Seal struct in the IDL.
        proof: {
          piA: toByteArray(job.seal.piA),
          piB: toByteArray(job.seal.piB),
          piC: toByteArray(job.seal.piC),
        },
      },
      Buffer.from(job.seal.journal, "hex"),
    )
    .accounts({
      owner: owner.publicKey,
      router,
      routerState,
      verifierEntry,
      verifierProgram: new PublicKey(GROTH16_VERIFIER_PROGRAM_ID),
      systemProgram: SystemProgram.programId,
    } as never)
    .rpc();

  log("heartbeat", signature);

  const after = await program.account.vault.fetch(vault);
  log("lastHeartbeat", `${after.lastHeartbeat.toNumber()} (was ${job.timestamp})`);
  log("state", Object.keys(after.state as object)[0] ?? String(after.state));

  console.log(
    `\n  https://explorer.solana.com/tx/${signature}?cluster=devnet\n` +
      "  A seal from the proving service, verified on-chain through the router.\n",
  );
}

main().catch((error) => {
  console.error("\nfailed:", error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
