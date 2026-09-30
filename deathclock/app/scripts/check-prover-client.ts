/**
 * Checks the browser-side proving-service client against the running service.
 *
 * The client ships to users and the service runs in a terminal, so the seam
 * between them is exactly where a typo becomes a broken button. This drives
 * the real functions against the real service: health, the owner encoding, and
 * the request/polley response shapes.
 *
 * It requests a proof but does not wait for it -- a full cycle is five
 * minutes. The point is that the request is accepted and the job is visible,
 * which is what a click in the browser depends on.
 */
import { fetchHealth, pollJob, publicKeyToBytes, requestProof, toHex } from "../src/utils/prover";

const SERVICE = process.env.PROVER_URL || "http://127.0.0.1:8787";
const OWNER_BASE58 = "86ab21NszLjrmiipVvWfwoKmhJQ7Drpn5w5TxDnXvWKv";
// Independently obtained via bs58; the guest commits over these exact bytes.
const OWNER_HEX = "696fb05ca0264a295fce62dcf8eb948c002d8c2237168b521d4e9205dcf45725";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  console.log(`\nProver client check against ${SERVICE}\n`);

  const health = await fetchHealth();
  check("GET /health", health.ok === true, `${health.provingTimes.length} timings, offset ${health.nextOffset}s`);

  const hex = toHex(publicKeyToBytes(OWNER_BASE58));
  check("owner encodes to raw key bytes", hex === OWNER_HEX, hex);

  const job = await requestProof(OWNER_BASE58);
  check("POST /prove accepted", typeof job.jobId === "string" && job.jobId.length === 16, job.jobId);
  check("service reports a forward offset", job.offsetSeconds > 0, `+${job.offsetSeconds}s`);
  check("timestamp is in the future by that offset", job.timestamp > Math.floor(Date.now() / 1000),
    `${job.timestamp - Math.floor(Date.now() / 1000)}s ahead`);

  const polled = await pollJob(job);
  check("GET /prove/:id returns a known status", ["queued", "proving", "ready", "failed"].includes(polled.status),
    `${polled.status} after ${polled.elapsedSeconds}s`);

  console.log(`\n  job ${job.jobId} is ${polled.status}; it will finish in ~5 minutes.`);
  console.log("  The service and the client agree on the shapes the browser depends on.\n");
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error("\nfailed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
