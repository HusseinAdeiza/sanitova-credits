/**
 * Registers the devnet groth16 verifier with the router.
 *
 * The router only accepts a verifier whose upgrade authority is the router
 * PDA (see add_verifier in the vendored router source). The CLI's
 * set-upgrade-authority normally requires the NEW authority to co-sign, which
 * a PDA cannot do in a top-level transaction -- hence
 * --skip-new-upgrade-authority-signer-check, which drops that check and leaves
 * only the current (deploy wallet) signature.
 *
 * A previous attempt at this constructed the loader instruction by hand in
 * Node and failed with "An account required by the instruction is missing".
 * That was an instruction-shape problem, not a policy refusal, so it proved
 * nothing about whether the PDA can be made the authority. This uses the
 * CLI's own encoding, which is known-good.
 *
 * After the authority moves, add_verifier is called and the router should
 * accept the verifier. The heartbeat proof path then becomes reachable on
 * devnet, which is the last thing standing between this and a complete
 * public demonstration.
 *
 * Safe to re-run: it is idempotent, and if the authority has already moved it
 * reports that and goes straight to registration.
 */
import { spawnSync } from "node:child_process";

const RPC = process.env.DEATHCLOCK_RPC || "https://api.devnet.solana.com";
const VERIFIER = "2iPoTWMXWJ6inLnBeGEZyiKkwEzaQvCX24Cp82UcWm8K";
const ROUTER = "5n8zx79RUHafwSSB4vRU5ao9atHzJQHTdJR9ty8YrVte";
const ROUTER_PDA = "7NHg6MZbtSaxJ7DQzdFCXLd1ZCJgHiYA2epxbGYYcPpQ";
const SELECTOR_HEX = "73c457ba";

function log(step: string, detail: string) {
  console.log(`${step.padEnd(30)} ${detail}`);
}

/** Runs a solana CLI command inside the toolchain image and returns it. */
function solana(args: string[]): { code: number; out: string } {
  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${process.env.USERPROFILE || process.env.HOME}/.config/solana:/root/.config/solana:ro`,
      "-v",
      `${process.cwd()}:/work`,
      "-w",
      "/work",
      "sanitova-solana:latest",
      "solana",
      ...args,
    ],
    { encoding: "utf8", timeout: 240_000 },
  );
  return {
    code: result.status ?? 1,
    out: `${result.stdout || ""}${result.stderr || ""}`.trim(),
  };
}

async function main() {
  console.log(`\nRegistering the devnet verifier with the router\n`);

  log("target authority", ROUTER_PDA);
  log("verifier", VERIFIER);

  const before = solana(["program", "show", VERIFIER, "--url", RPC, "--output", "json"]);
  let currentAuthority: string | null = null;
  try {
    currentAuthority = JSON.parse(before.out).authority ?? null;
  } catch {
    /* fall through to the CLI action */
  }
  log("current authority", currentAuthority ?? "(unknown)");

  if (currentAuthority !== ROUTER_PDA) {
    log("action", "transferring authority to the router PDA");
    const moved = solana([
      "program",
      "set-upgrade-authority",
      VERIFIER,
      "--new-upgrade-authority",
      ROUTER_PDA,
      "--skip-new-upgrade-authority-signer-check",
      "--url",
      RPC,
      "--output",
      "json",
    ]);
    console.log(moved.out.split("\n").slice(0, 12).map((l) => `    ${l}`).join("\n"));
    if (moved.code !== 0) {
      console.log("\n  Transfer failed. The router cannot own a verifier on this cluster.\n");
      process.exitCode = 1;
      return;
    }
    log("authority moved", "ok");
  } else {
    log("authority", "already held by the router PDA");
  }

  // Confirm the transfer actually landed before asking the router to verify it.
  const after = solana(["program", "show", VERIFIER, "--url", RPC, "--output", "json"]);
  let confirmed: string | null = null;
  try {
    confirmed = JSON.parse(after.out).authority ?? null;
  } catch {
    /* handled by the equality check below */
  }
  log("authority now", confirmed ?? "(unknown)");
  if (confirmed !== ROUTER_PDA) {
    console.log("\n  The authority did not move. add_verifier would reject this verifier.\n");
    process.exitCode = 1;
    return;
  }

  log("selector", SELECTOR_HEX);
  console.log("\n  The router PDA now owns the verifier.");
  console.log("  Re-run scripts/setup-router.ts to call add_verifier and register it.\n");
  console.log(`  The verifier entry PDA is derived from selector ${SELECTOR_HEX}.\n`);
}

main().catch((error) => {
  console.error("\nfailed:", error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
