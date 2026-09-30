/**
 * Devnet end-to-end check.
 *
 * Creates a real vault for the deploy authority's keypair, deposits real devnet
 * SOL into it, and reads the account back from the cluster. This is the script
 * that proves the deployed program is reachable and that the client wiring in
 * the browser matches what the chain accepts — the frontend's own button calls
 * exactly these instructions.
 *
 * The vault PDA is keyed to the wallet that signs, so this reuses the existing
 * devnet authority keypair rather than a throwaway one. That means the vault
 * created here is the one the deployed site will show when the same wallet
 * connects, which is what makes it useful for a demo.
 *
 * Usage:
 *   npx tsx scripts/devnet-e2e.ts
 *
 * Env:
 *   DEATHCLOCK_RPC     default https://api.devnet.solana.com
 *   DEATHCLOCK_SOLANA_KEYPAIR  default ~/.config/solana/id.json
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
// Import the generated IDL directly rather than through the app shim: this
// script runs under scripts/tsconfig.json, and the shim's JSON re-export is
// resolved differently there, which made `new Program()` fail with an opaque
// "Cannot read properties of undefined" from the accounts coder.
import deathclockIdlJson from "../app/src/idl/deathclock.generated.json";

const deathclockIdl = deathclockIdlJson as never;
import {
  DEATHCLOCK_PROGRAM_ID,
  ROUTER_PROGRAM_ID,
  GROTH16_VERIFIER_PROGRAM_ID,
  ROUTER_STATE_PDA,
  VERIFIER_ENTRY_PDA,
  SELECTOR,
} from "./program-ids";

const RPC_URL = process.env.DEATHCLOCK_RPC || "https://api.devnet.solana.com";
const KEYPAIR_PATH =
  process.env.DEATHCLOCK_SOLANA_KEYPAIR || join(homedir(), ".config", "solana", "id.json");

const HEARTBEAT_INTERVAL = new BN(30 * 24 * 60 * 60);
const CHALLENGE_PERIOD = new BN(48 * 60 * 60);
const DEPOSIT_SOL = 0.4;

const LAMPORTS_PER_SOL = 1_000_000_000;

function log(step: string, detail: string) {
  console.log(`${step.padEnd(26)} ${detail}`);
}

async function main() {
  const secret = JSON.parse(readFileSync(KEYPAIR_PATH, "utf8")) as number[];
  const owner = Keypair.fromSecretKey(Uint8Array.from(secret));
  const programId = new PublicKey(DEATHCLOCK_PROGRAM_ID);
  const connection = new Connection(RPC_URL, "confirmed");

  console.log(`\nDeathClock devnet E2E\n  rpc     ${RPC_URL}\n  program ${DEATHCLOCK_PROGRAM_ID}\n`);

  const balance = await connection.getBalance(owner.publicKey);
  log("wallet", `${owner.publicKey.toBase58()} — ${balance / LAMPORTS_PER_SOL} SOL`);
  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    throw new Error("Not enough devnet SOL to create a vault and deposit.");
  }

  // Confirm the program is really deployed before doing anything else, so a
  // failure here is unambiguous.
  const info = await connection.getAccountInfo(programId);
  if (!info?.executable) {
    throw new Error(`${DEATHCLOCK_PROGRAM_ID} is not executable on this cluster.`);
  }
  log("program", `executable, owner ${info.owner.toBase58()}`);

  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.publicKey.toBuffer()],
    programId,
  );
  log("vault PDA", vault.toBase58());

  const existing = await connection.getAccountInfo(vault);
  if (existing) {
    log("vault", "already initialised — skipping create, will only deposit");
  }

  // Two heirs so the split is meaningful in a demo. Generated from real
  // keypairs rather than typed by hand: a hand-written base58 string decodes
  // to 32 bytes only by luck, and a wrong-length address fails with
  // "Non-base58 character" long after the vault is already created.
  const heirs = [
    { keypair: Keypair.generate(), share: 60 },
    { keypair: Keypair.generate(), share: 40 },
  ];

  // web3.js 1.99 `Keypair` exposes only `publicKey` and `secretKey`; signing
  // is a method on the Transaction, not the keypair. Anchor hands us a legacy
  // `Transaction` here, so `tx.sign(owner)` is the supported path. Calling
  // owner.sign(...) fails with "owner.sign is not a function".
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: owner.publicKey,
      // `Transaction.sign()` mutates and returns undefined, but Anchor reads
      // the return value and then calls `.serialize()` on it — so returning
      // undefined fails with "Cannot read properties of undefined (reading
      // 'serialize')". Sign, then hand the transaction back.
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

  // Anchor 0.32 takes (idl, provider): the program address lives in
  // idl.address. The older (idl, programId, provider) form is still accepted
  // but mis-binds its arguments and builds the account client with an
  // undefined coder, which surfaces as the opaque
  // "Cannot read properties of undefined (reading 'size')".
  const program = new Program(deathclockIdl, provider);

  if (!program.programId.equals(programId)) {
    throw new Error(
      `IDL address ${program.programId.toBase58()} does not match expected ${programId.toBase58()}.`,
    );
  }

  if (!existing) {
    const signature = await program.methods
      .initializeVault(
        heirs.map((heir) => heir.keypair.publicKey),
        Buffer.from(heirs.map((heir) => heir.share)),
        HEARTBEAT_INTERVAL,
        CHALLENGE_PERIOD,
      )
      .accounts({ owner: owner.publicKey })
      .rpc();
    log("initializeVault", signature);
  }

  const state = await program.account.vault.fetch(vault);
  log("state", JSON.stringify(Object.keys(state.state)[0] ?? state.state));
  log("heirs", `${state.heirs.length} — ${state.heirs.map((h: PublicKey) => h.toBase58().slice(0, 6) + "…").join(", ")}`);
  log("shares", `Σ ${Array.from(state.shares as Buffer).join("+")}%`);
  log("heir keys", heirs.map((h) => h.keypair.publicKey.toBase58()).join("  "));

  const signature = await program.methods
    .deposit(new BN(Math.round(DEPOSIT_SOL * LAMPORTS_PER_SOL)))
    .accounts({ owner: owner.publicKey, vault } as never)
    .rpc();
  log("deposit", `${DEPOSIT_SOL} SOL — ${signature}`);

  const after = await program.account.vault.fetch(vault);
  const vaultBalance = await connection.getBalance(vault);
  log("totalDeposited", `${after.totalDeposited.toNumber() / LAMPORTS_PER_SOL} SOL`);
  log("vault balance", `${vaultBalance / LAMPORTS_PER_SOL} SOL`);

  // The fee arithmetic, using the same integers the program uses.
  const distributable = vaultBalance - Math.floor((vaultBalance * 5) / 10_000);
  const fee = vaultBalance - distributable;
  const shares = Array.from(after.shares as Buffer);
  log(
    "release preview",
    `fee ${(fee / LAMPORTS_PER_SOL).toFixed(6)} SOL → ` +
      shares
        .map((s, i) => {
          const amount = Math.floor((distributable * s) / 100);
          return `${heirs[i].keypair.publicKey.toBase58().slice(0, 6)}… ${(amount / LAMPORTS_PER_SOL).toFixed(4)} SOL`;
        })
        .join(" + "),
  );

  const cluster = process.env.DEATHCLOCK_RPC?.includes("127.0.0.1") ? "" : "?cluster=devnet";
  console.log(`\n  vault       https://explorer.solana.com/address/${vault.toBase58()}${cluster}`);
  console.log(`  deposit tx  https://explorer.solana.com/tx/${signature}${cluster}\n`);

  // Confirms the values the browser needs in order to submit a real heartbeat.
  // The values the browser needs to submit a real heartbeat, echoed so they
  // can be compared against what the deployed site is configured with.
  log("router", ROUTER_PROGRAM_ID);
  log("router state", ROUTER_STATE_PDA);
  log("verifier entry", VERIFIER_ENTRY_PDA);
  log("selector", Buffer.from(SELECTOR).toString("hex"));

  console.log("\nE2E complete. Connect the same wallet on the site to see this vault.\n");
}

main().catch((error) => {
  // The full stack matters here: Anchor's client throws bare property errors
  // ("Cannot read properties of undefined") with no indication of which call
  // failed, so the trace is the only useful diagnostic.
  console.error("\nE2E failed:", error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
