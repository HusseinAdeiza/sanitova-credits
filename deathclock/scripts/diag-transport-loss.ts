/**
 * Tests whether the proving pipeline disturbs the patched fetch global.
 *
 * The heartbeat run installs the node:https shim, shells out to the proving
 * pipeline via execFileSync, and then fails at submission with undici's
 * "TypeError: fetch failed" -- as if the swap never happened. This isolates
 * whether the child process is what loses it, without spending six minutes on
 * a real proof.
 */
import { execFileSync } from "node:child_process";
import { Connection } from "@solana/web3.js";
import { ensureRpcTransport } from "./rpc-transport";

const RPC_URL = process.env.DEATHCLOCK_RPC || "https://api.devnet.solana.com";

const isShim = () =>
  /node:https|viaHttps/.test(globalThis.fetch.toString()) ? "shim" : "undici";

async function probe(label: string) {
  const connection = new Connection(RPC_URL, "confirmed");
  try {
    const bh = await connection.getLatestBlockhash("confirmed");
    console.log(`${label.padEnd(34)} fetch=${isShim().padEnd(7)} OK   ${bh.blockhash.slice(0, 12)}…`);
    return true;
  } catch (error) {
    console.log(
      `${label.padEnd(34)} fetch=${isShim().padEnd(7)} FAIL ${error instanceof Error ? error.message : error}`,
    );
    return false;
  }
}

async function main() {
  console.log("\nDoes execFileSync disturb the patched fetch?\n");

  await ensureRpcTransport(RPC_URL);
  await probe("after ensureRpcTransport");

  // A trivial child process: no Docker, no proving.
  execFileSync(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
  await probe("after trivial execFileSync");

  // A child that does real work and takes a moment, closer to the real thing.
  const started = Date.now();
  execFileSync(process.execPath, ["-e", "const t=Date.now();while(Date.now()-t<2000){}"], {
    stdio: "ignore",
  });
  await probe(`after 2s-blocking execFileSync (${Math.round((Date.now() - started) / 1000)}s)`);

  // The proving script is bash; check that path too.
  try {
    execFileSync("bash", ["-c", "sleep 2"], { stdio: "ignore" });
    await probe("after bash execFileSync");
  } catch {
    console.log("bash execFileSync unavailable; skipped");
  }

  console.log();
}

main().catch((error) => {
  console.error("failed:", error);
  process.exitCode = 1;
});
