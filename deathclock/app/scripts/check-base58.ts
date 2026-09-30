// Checks the hand-rolled base58 decoder against a known-good conversion.
// The service takes the owner as hex, and a wrong decode would produce a seal
// for the wrong owner -- which the program rejects for a reason that has
// nothing to do with the proof.
import { publicKeyToBytes, toHex } from "../src/utils/prover";

const CASES: [string, string | null][] = [
  // deploy wallet; expected hex obtained independently via bs58
  ["86ab21NszLjrmiipVvWfwoKmhJQ7Drpn5w5TxDnXvWKv", "696fb05ca0264a295fce62dcf8eb948c002d8c2237168b521d4e9205dcf45725"],
  // a vault PDA, for a length check with no independent expectation
  ["GdqwHKfJ7wgNSGJ53J7mrA986Tg1UefUK9Y3btzX7Btt", null],
];

let failures = 0;
for (const [base58, expected] of CASES) {
  const hex = toHex(publicKeyToBytes(base58));
  const bytes = hex.length / 2;
  console.log(`${base58.slice(0, 14)}… -> ${bytes} bytes`);
  if (bytes !== 32) {
    console.log("  FAIL: not 32 bytes");
    failures += 1;
  }
  if (expected) {
    const match = hex === expected;
    console.log(`  ${match ? "PASS" : "FAIL"}: matches bs58 ground truth`);
    if (!match) {
      console.log(`    got      ${hex}`);
      console.log(`    expected ${expected}`);
      failures += 1;
    }
  }
}

// A leading-zero key is the classic base58 pitfall: short numeric values lose
// leading zero bytes, so the padding path must be exercised.
const padded = toHex(publicKeyToBytes("11111111111111111111111111111111"));
console.log(`\n1111… (all leading zeros) -> ${padded.length / 2} bytes: ${padded.slice(0, 16)}…`);
if (padded.length !== 64) {
  console.log("  FAIL: leading zeros were not padded to 32 bytes");
  failures += 1;
}

console.log(failures === 0 ? "\nAll base58 checks passed." : `\n${failures} check(s) FAILED.`);
process.exitCode = failures === 0 ? 0 : 1;
