// Checks that the shared program-id module still satisfies both kinds of
// caller: code that wants the raw base58 string, and code that passes the
// value straight into web3.js (which is what broke when the exports became
// plain strings).
import { PublicKey } from "@solana/web3.js";
import {
  ROUTER_PROGRAM,
  GROTH16_VERIFIER_PROGRAM,
  ROUTER_STATE_PDA,
  VERIFIER_ENTRY_PDA,
  ROUTER_PROGRAM_ID,
  GROTH16_VERIFIER_PROGRAM_ID,
  SELECTOR,
} from "../scripts/program-ids";

const routerState = PublicKey.findProgramAddressSync(
  [Buffer.from("router")],
  ROUTER_PROGRAM,
)[0];
const entry = PublicKey.findProgramAddressSync(
  [Buffer.from("verifier"), Buffer.from(SELECTOR)],
  ROUTER_PROGRAM,
)[0];

const checks: [string, boolean][] = [
  ["ROUTER_PROGRAM is a PublicKey", ROUTER_PROGRAM instanceof PublicKey],
  ["GROTH16_VERIFIER_PROGRAM is a PublicKey", GROTH16_VERIFIER_PROGRAM instanceof PublicKey],
  [
    "router PDA re-derives to the recorded constant",
    routerState.equals(ROUTER_STATE_PDA),
  ],
  [
    "verifier entry re-derives to the recorded constant",
    entry.equals(VERIFIER_ENTRY_PDA),
  ],
  [
    "string export still usable as an address",
    new PublicKey(ROUTER_PROGRAM_ID).toBase58() === ROUTER_PROGRAM_ID,
  ],
  [
    "string and key agree",
    ROUTER_PROGRAM.toBase58() === ROUTER_PROGRAM_ID &&
      GROTH16_VERIFIER_PROGRAM.toBase58() === GROTH16_VERIFIER_PROGRAM_ID,
  ],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
}
console.log(failed === 0 ? "\nall program-id checks passed" : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
