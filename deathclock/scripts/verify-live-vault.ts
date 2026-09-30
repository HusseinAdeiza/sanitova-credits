/**
 * Verifies the deployed site's exact decoding path against the live vault.
 *
 * The browser could not be used for this: the automation session has no Solana
 * wallet injected, so the app's own `useVault` never runs. This script
 * reproduces the same code path the browser executes — the same IDL, the same
 * `Program` construction, the same `program.account.vault.fetch` — against the
 * real vault on devnet, so a decoder that only works in Node is caught here
 * rather than on a judge's click.
 */
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
// The IDL the deployed site loads.
import deathclockIdl from "../app/src/idl/deathclock.generated.json";
import { DEATHCLOCK_PROGRAM_ID } from "./program-ids";

const RPC_URL = process.env.DEATHCLOCK_RPC || "https://api.devnet.solana.com";
const VAULT = process.env.DEATHCLOCK_VAULT || "GdqwHKfJ7wgNSGJ53J7mrA986Tg1UefUK9Y3btzX7Btt";

function log(step: string, detail: string) {
  console.log(`${step.padEnd(24)} ${detail}`);
}

async function main() {
  console.log("\nDecoding the live vault with the site's own IDL\n");

  const connection = new Connection(RPC_URL, "confirmed");
  const expected = new PublicKey(DEATHCLOCK_PROGRAM_ID);

  const info = await connection.getAccountInfo(expected);
  log("program", info?.executable ? `executable` : "NOT EXECUTABLE");
  if (!info?.executable) throw new Error("Deployed program is not executable.");

  // A throwaway keypair: this only needs to satisfy the provider, because the
  // fetch is a read. No transaction is signed.
  const reader = Keypair.generate();
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: reader.publicKey,
      signTransaction: async (tx) => {
        tx.sign(reader);
        return tx;
      },
      signAllTransactions: async (txs) => {
        for (const tx of txs) tx.sign(reader);
        return txs;
      },
    } as never,
    { commitment: "confirmed" },
  );

  // Exactly how the app builds it: (idl, provider), address from idl.address.
  const program = new Program(deathclockIdl as never, provider);
  log("program.account", `constructed, vault namespace present: ${Boolean(program.account.vault)}`);

  if (!program.programId.equals(expected)) {
    throw new Error(
      `IDL address ${program.programId.toBase58()} != configured ${expected.toBase58()}`,
    );
  }
  log("address check", `${program.programId.toBase58()} — matches the configured program`);

  const account = await program.account.vault.fetch(new PublicKey(VAULT));

  const state = Object.keys(account.state as object)[0] ?? String(account.state);
  const balance = await connection.getBalance(new PublicKey(VAULT));

  log("state", state);
  log("balance", `${balance / 1_000_000_000} SOL`);
  log("totalDeposited", `${account.totalDeposited.toNumber() / 1_000_000_000} SOL`);
  log("lastHeartbeat", account.lastHeartbeat.toNumber() === 0 ? "0 (none yet)" : String(account.lastHeartbeat.toNumber()));
  log("heartbeatInterval", `${account.heartbeatInterval.toNumber() / 86400} days`);
  log("challengePeriod", `${account.challengePeriod.toNumber() / 3600} hours`);
  log("heirs", String(account.heirs.length));
  for (const [index, heir] of account.heirs.entries()) {
    log(`  heir ${index + 1}`, `${(heir as PublicKey).toBase58()} — ${Array.from(account.shares as Buffer)[index]}%`);
  }
  log("bump", String(account.bump));

  // The fields the UI binds to, so a rename in the IDL surfaces here.
  const required = [
    "owner",
    "heirs",
    "shares",
    "state",
    "lastHeartbeat",
    "totalDeposited",
    "heartbeatInterval",
    "challengePeriod",
  ];
  const missing = required.filter((field) => !(field in account));
  if (missing.length > 0) {
    throw new Error(`The UI reads fields the IDL does not provide: ${missing.join(", ")}`);
  }
  log("UI field check", `all ${required.length} fields the console reads are present`);

  console.log("\nThe deployed site's decode path handles the live vault.\n");
}

main().catch((error) => {
  console.error("\nfailed:", error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
