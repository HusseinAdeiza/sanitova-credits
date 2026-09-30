/**
 * Proves a heartbeat and submits it to devnet, inside the freshness window.
 *
 * The program rejects a receipt whose timestamp is more than
 * PROOF_MAX_AGE_SECONDS (300) old, and the RISC Zero pipeline takes a couple
 * of minutes, so proving and submitting have to be one flow. Splitting them --
 * proving now, submitting later -- reliably produces an expired seal.
 *
 * This is the devnet counterpart of the local E2E: same prover, same guest,
 * but the transaction lands on the public cluster and goes through
 * DeathClock -> verifier_router -> groth_16_verifier.
 *
 * Usage:
 *   npx tsx scripts/devnet-heartbeat.ts
 *
 * Env:
 *   DEATHCLOCK_RPC          default https://api.devnet.solana.com
 *   DEATHCLOCK_SOLANA_KEYPAIR  default ~/.config/solana/id.json
 *   SKIP_PROVE=1            submit an existing seal without re-proving
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import deathclockIdl from "../app/src/idl/deathclock.generated.json";
import { ensureRpcTransport, isRpcShimInstalled } from "./rpc-transport";
import {
  DEATHCLOCK_PROGRAM_ID,
  ROUTER_PROGRAM_ID,
  GROTH16_VERIFIER_PROGRAM_ID,
} from "./program-ids";

const RPC_URL = process.env.DEATHCLOCK_RPC || "https://api.devnet.solana.com";
const KEYPAIR_PATH =
  process.env.DEATHCLOCK_SOLANA_KEYPAIR || join(homedir(), ".config", "solana", "id.json");
const WORK_DIR = "target/risc0-work";
const PROOF_MAX_AGE_SECONDS = 300;

function log(step: string, detail: string) {
  console.log(`${step.padEnd(26)} ${detail}`);
}

/** A seal as the program's `Seal` account struct expects it: all byte arrays. */
function toByteArray(value: unknown): number[] {
  if (typeof value === "string") return Array.from(Buffer.from(value, "hex"));
  if (Array.isArray(value)) return value as number[];
  throw new Error(`Seal field is neither hex nor a byte array: ${typeof value}`);
}

async function main() {
  console.log("\nDeathClock devnet heartbeat\n");
  await ensureRpcTransport(RPC_URL);

  const secret = JSON.parse(readFileSync(KEYPAIR_PATH, "utf8")) as number[];
  const owner = Keypair.fromSecretKey(Uint8Array.from(secret));
  const programId = new PublicKey(DEATHCLOCK_PROGRAM_ID);

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

  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.publicKey.toBuffer()],
    programId,
  );
  log("owner", owner.publicKey.toBase58());
  log("vault", vault.toBase58());

  const vaultInfo = await connection.getAccountInfo(vault);
  if (!vaultInfo) throw new Error("No vault for this wallet. Run `npm run e2e:devnet` first.");
  log("vault", "exists");

  // The guest commits over SHA-256(owner || timestamp_le || nonce), so the seal
  // has to be proven for THIS owner. Decode the base58 key to raw bytes the
  // same way scripts/prove-heartbeat.sh does.
  const ownerHex = execFileSync(
    process.execPath,
    [
      "-e",
      `const bs58=require('bs58');process.stdout.write(Buffer.from(bs58.decode('${owner.publicKey.toBase58()}')).toString('hex'))`,
    ],
    { encoding: "utf8", cwd: process.cwd() },
  ).trim();
  log("owner hex", ownerHex);

  if (process.env.SKIP_PROVE !== "1") {
    // Prove for a timestamp a little in the future.
    //
    // prove-heartbeat.sh stamps the receipt when it starts, and proving takes
    // ~305s here -- just over PROOF_MAX_AGE_SECONDS. The seal is therefore born
    // already stale and the program rejects it on arrival. The fix is to move
    // the clock forward by roughly the proving time so the receipt lands inside
    // the window at the moment it is actually submitted.
    //
    // The guest does not care what the timestamp is; the program only checks
    // |now - timestamp| <= 300, so a small forward offset is safe. It must not
    // be so large that the receipt is in the future at submission, which is why
    // the margin below is capped and re-checked afterwards.
    // Derive the offset from measured proving times rather than guessing.
    //
    // Proving has measured 231s, 306s, 332s, 369s, 380s and 449s here, and the
    // program only accepts a receipt with
    //     -PROOF_MAX_FUTURE_SECONDS <= now - timestamp <= PROOF_MAX_AGE_SECONDS
    // i.e. [-60, +300]. Since age = actual_prove_time - offset, a single fixed
    // offset cannot cover a 218-second spread: too small and the seal is stale
    // on arrival, too large and it lands more than 60s in the future.
    //
    // So compute the band of offsets that works for EVERY observed time:
    //     offset >= slowest - 300        (fastest case must not go stale)
    //     offset <= fastest + 60         (slowest case must not go future)
    // and take the midpoint. For the recorded history that is 220s, which puts
    // a 231s prove at age +11 and a 449s prove at age +229 -- both legal.
    const historyPath = join(WORK_DIR, "prove-seconds.txt");
    const observed: number[] = existsSync(historyPath)
      ? readFileSync(historyPath, "utf8")
          .split("\n")
          .map((line) => Number(line.trim()))
          .filter((value) => Number.isFinite(value) && value > 0)
      : [];

    const MAX_AGE = 300;
    const MAX_FUTURE = 60;
    let ESTIMATED_PROVE_SECONDS: number;
    if (process.env.PROVE_OFFSET_SECONDS) {
      ESTIMATED_PROVE_SECONDS = Number(process.env.PROVE_OFFSET_SECONDS);
    } else if (observed.length > 0) {
      const lowerBound = Math.max(...observed) - MAX_AGE;
      const upperBound = Math.min(...observed) + MAX_FUTURE;
      if (lowerBound > upperBound) {
        // The spread is wider than the window itself; aim at the middle and let
        // the caller's post-prove check catch a bad landing.
        ESTIMATED_PROVE_SECONDS = Math.round((lowerBound + upperBound) / 2);
      } else {
        ESTIMATED_PROVE_SECONDS = Math.round((lowerBound + upperBound) / 2);
      }
    } else {
      ESTIMATED_PROVE_SECONDS = 300;
    }
    log(
      "proving",
      `for timestamp +${ESTIMATED_PROVE_SECONDS}s ` +
        `(measured proving times: ${observed.length ? observed.sort((a, b) => a - b).join(", ") + "s" : "none yet"})`,
    );
    const future = Math.floor(Date.now() / 1000) + ESTIMATED_PROVE_SECONDS;

    const started = Date.now();
    execFileSync(
      "bash",
      ["scripts/prove-heartbeat.sh", "--owner", ownerHex, "--timestamp", String(future)],
      { stdio: "inherit", cwd: process.cwd(), timeout: 20 * 60_000 },
    );
    const elapsed = Math.round((Date.now() - started) / 1000);
    log("proved in", `${elapsed}s`);
    // Remember the worst case so the next run aims better.
    const previous = existsSync(historyPath)
      ? readFileSync(historyPath, "utf8").split("\n").filter(Boolean)
      : [];
    writeFileSync(historyPath, [...previous, String(elapsed)].join("\n"));
  }

  const sealPath = join(WORK_DIR, "seal.json");
  if (!existsSync(sealPath)) throw new Error(`No seal at ${sealPath}`);
  const seal = JSON.parse(readFileSync(sealPath, "utf8")) as Record<string, unknown>;
  const input = JSON.parse(readFileSync(join(WORK_DIR, "heartbeat-input.json"), "utf8")) as {
    timestamp: string;
    nonce: string;
    owner: string;
  };

  // Check the window BEFORE building the transaction, so an expired seal fails
  // here with a clear message rather than as an opaque program error.
  const age = Math.floor(Date.now() / 1000) - Number(input.timestamp);
  const selector = String(seal.selector);
  log("seal selector", selector);
  log("seal timestamp", `${input.timestamp} (${age}s old, limit ${PROOF_MAX_AGE_SECONDS}s)`);
  // The program allows a receipt to be up to PROOF_MAX_AGE_SECONDS old AND up
  // to PROOF_MAX_FUTURE_SECONDS in the future (lib.rs: PROOF_MAX_FUTURE_SECONDS
  // = 60). Rejecting any future timestamp here was stricter than the program
  // and blocked a valid seal: the forward offset is deliberate, so the receipt
  // lands inside the window at submission rather than expiring during proving.
  const PROOF_MAX_FUTURE_SECONDS = 60;
  if (age > PROOF_MAX_AGE_SECONDS) {
    throw new Error(
      `Seal is ${age}s old but the program only accepts ${PROOF_MAX_AGE_SECONDS}s. ` +
        `Re-run without SKIP_PROVE so proving and submitting happen together.`,
    );
  }
  if (age < -PROOF_MAX_FUTURE_SECONDS) {
    throw new Error(
      `Seal timestamp is ${-age}s in the future but the program allows at most ` +
        `${PROOF_MAX_FUTURE_SECONDS}s. Lower PROVE_OFFSET_SECONDS.`,
    );
  }

  // Confirm the journal really commits to this owner before spending a
  // transaction on it.
  //
  // The journal is 64 bytes: a 32-byte SHA-256 digest, then the timestamp as a
  // little-endian u64, then the 24-byte nonce. Only the DIGEST is compared --
  // checking the digest against the whole 64-byte journal reports a mismatch on
  // a perfectly valid seal, which is exactly what happened the first time.
  const journal = Buffer.from(toByteArray(seal.journal));
  if (journal.length !== 64) {
    throw new Error(`Journal should be 64 bytes, got ${journal.length}.`);
  }
  const journalDigest = journal.subarray(0, 32);
  const journalTimestamp = Number(journal.readBigUInt64LE(32));
  const journalNonce = journal.subarray(40, 64).toString("hex");

  const timestampBuffer = Buffer.alloc(8);
  timestampBuffer.writeBigUInt64LE(BigInt(input.timestamp));
  const expectedDigest = createHash("sha256")
    .update(Buffer.concat([Buffer.from(ownerHex, "hex"), timestampBuffer, Buffer.from(input.nonce, "hex")]))
    .digest();

  const digestMatches = journalDigest.equals(expectedDigest);
  const fieldsMatch = journalTimestamp === Number(input.timestamp) && journalNonce === input.nonce;

  log("journal digest", digestMatches ? "commits to this owner" : "MISMATCH");
  log("journal fields", fieldsMatch ? "timestamp and nonce agree" : "MISMATCH");
  if (!digestMatches || !fieldsMatch) {
    throw new Error("The journal does not commit to this owner; refusing to submit.");
  }

  const [routerState] = PublicKey.findProgramAddressSync(
    [Buffer.from("router")],
    new PublicKey(ROUTER_PROGRAM_ID),
  );
  const [verifierEntry] = PublicKey.findProgramAddressSync(
    [Buffer.from("verifier"), Buffer.from(selector, "hex")],
    new PublicKey(ROUTER_PROGRAM_ID),
  );
  log("router state", routerState.toBase58());
  log("verifier entry", verifierEntry.toBase58());

  // Re-assert the transport and get a blockhash immediately before
  // submitting.
  //
  // The proving pipeline saturates the host network for the ~6 minutes it runs,
  // and both earlier attempts died at exactly this point with undici's
  // "TypeError: fetch failed" while every pre-proving call had succeeded. The
  // shim is already installed (confirmed by isRpcShimInstalled below), so this
  // is a saturated-socket problem, not a missing patch: warm the connection
  // with retries before the one call that matters.
  await ensureRpcTransport(RPC_URL);
  log("rpc shim", isRpcShimInstalled() ? "installed" : "NOT INSTALLED");

  let blockhash: Awaited<ReturnType<Connection["getLatestBlockhash"]>> | null = null;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      blockhash = await connection.getLatestBlockhash("confirmed");
      log("blockhash", `${blockhash.blockhash.slice(0, 20)}… (attempt ${attempt})`);
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("blockhash", `attempt ${attempt} failed: ${message}`);
      if (attempt === 8) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
    }
  }
  if (!blockhash) throw new Error("Could not obtain a blockhash.");

  // Reuse the blockhash we just warmed rather than letting Anchor fetch a
  // fresh one mid-send, which is where the earlier runs actually died.
  // AnchorProvider caches the latest blockhash internally, so seed the cache
  // with the value we already fetched instead of issuing another RPC read.
  (
    provider as unknown as {
      _recentBlockhash: string;
      _recentBlockhashLastValidBlockHeight: number;
    }
  )._recentBlockhash = blockhash.blockhash;
  (
    provider as unknown as { _recentBlockhashLastValidBlockHeight: number }
  )._recentBlockhashLastValidBlockHeight = blockhash.lastValidBlockHeight;

  const signature = await program.methods
    .heartbeat(
      {
        selector: Array.from(Buffer.from(selector, "hex")),
        // The proving key is NESTED under `proof`, per the Seal struct:
        //   Seal { selector: [u8; 4], proof: Groth16Proof { pi_a, pi_b, pi_c } }
        // Passing piA/piB/piC flat serialises them as three top-level args, so
        // the verifier received garbage and returned VerificationError. The
        // transaction reached groth_16_verifier and failed its pairing check --
        // the routing was correct, only the argument shape was wrong.
        proof: {
          piA: toByteArray(seal.piA),
          piB: toByteArray(seal.piB),
          piC: toByteArray(seal.piC),
        },
      },
      journal,
    )
    .accounts({
      owner: owner.publicKey,
      router: new PublicKey(ROUTER_PROGRAM_ID),
      routerState,
      verifierEntry,
      verifierProgram: new PublicKey(GROTH16_VERIFIER_PROGRAM_ID),
      systemProgram: SystemProgram.programId,
    } as never)
    .rpc();

  log("heartbeat", signature);

  const after = await program.account.vault.fetch(vault);
  log("lastHeartbeat", `${after.lastHeartbeat.toNumber()} (was ${input.timestamp})`);
  log("state", Object.keys(after.state as object)[0] ?? String(after.state));

  console.log(
    `\n  https://explorer.solana.com/tx/${signature}?cluster=devnet\n` +
      "  A genuine Groth16 proof, verified on-chain through the router.\n",
  );
}

main().catch((error) => {
  console.error("\nfailed:", error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
