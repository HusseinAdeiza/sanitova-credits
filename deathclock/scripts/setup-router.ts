// Brings the RISC Zero verifier router up on a cluster:
//   1. initializes the router PDA
//   2. points the groth_16_verifier's LoaderV3 upgrade authority at the router
//   3. registers the Groth16 verifier under its selector
//
// Step 2 cannot be done from a client or from inside the router -- see the
// comment on the registration call below. Run scripts/claim-verifier-authority.ts
// once first, which uses the CLI's --skip-new-upgrade-authority-signer-check.
//
// On localnet, step 2 is unnecessary: scripts/localnet-e2e.sh passes the router
// PDA straight to --upgradeable-program, so the verifier reports the router as
// its authority from genesis.
import * as anchor from "@coral-xyz/anchor";
import { Idl, Program } from "@coral-xyz/anchor";
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { ensureRpcTransport } from "./rpc-transport";

// Local validator by default; set DEATHCLOCK_RPC for a public cluster.
//   ssh -L 8899:127.0.0.1:8899 root@161.97.139.15
const RPC = process.env.DEATHCLOCK_RPC ?? "http://127.0.0.1:8899";
const {
  ROUTER_PROGRAM_ID: _ROUTER,
  GROTH16_VERIFIER_PROGRAM_ID: _GROTH,
  SELECTOR: _SELECTOR,
} = require("./program-ids");
const ROUTER_PROGRAM_ID = new PublicKey(_ROUTER);
const GROTH16_PROGRAM_ID = new PublicKey(_GROTH);
const SELECTOR = _SELECTOR;

// The vendored risc0-solana workspace is a single Cargo workspace, so its IDL
// lands in the workspace-level target dir rather than under programs/.
const IDL_PATH = "vendor/risc0-solana/solana-verifier/target/idl/verifier_router.json";

/**
 * Retries an RPC read that failed on transport grounds.
 *
 * Only `fetch failed`-class errors are retried: a rejected promise from a
 * program (bad authority, wrong account) means the call will fail again, so
 * retrying it would just delay the real error.
 */
async function withRetry<T>(operation: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const transient = /fetch failed|ECONNRESET|ETIMEDOUT|socket|network/i.test(message);
      if (!transient || attempt === attempts) break;
      console.log(`  rpc read failed (${message}); retry ${attempt}/${attempts - 1}`);
      await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
    }
  }
  throw lastError;
}

async function main() {
  // Swap in a node:https transport if this host's `fetch` cannot reach the RPC.
  await ensureRpcTransport(RPC);

  const authority = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(
        readFileSync(
          process.env.DEATHCLOCK_SOLANA_KEYPAIR ||
            `${process.env.USERPROFILE || process.env.HOME}/.config/solana/id.json`,
          "utf8",
        ),
      ) as number[],
    ),
  );
  const connection = new Connection(RPC, "confirmed");

  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(authority), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // The verifier programs are not part of this project's Anchor.toml, so the
  // router Program is built from the IDL generated in the vendored
  // risc0-solana workspace.
  const router = new Program(
    JSON.parse(readFileSync(IDL_PATH, "utf8")) as Idl,
    provider,
  );

  // Seeds per the vendored router source: router state is [b"router"], and a
  // verifier entry is [b"verifier", selector].
  const [routerState] = PublicKey.findProgramAddressSync(
    [Buffer.from("router")],
    ROUTER_PROGRAM_ID,
  );
  const [verifierEntry] = PublicKey.findProgramAddressSync(
    [Buffer.from("verifier"), Buffer.from(SELECTOR)],
    ROUTER_PROGRAM_ID,
  );
  console.log(`authority      ${authority.publicKey.toBase58()}`);
  console.log(`router state   ${routerState.toBase58()}`);
  console.log(`verifier entry ${verifierEntry.toBase58()}`);

  // Only top up if we are actually short. `requestAirdrop` is heavily
  // rate-limited on devnet and throws on failure, so never call it
  // speculatively -- check the balance first.
  // `getBalance` resolves to a lamport count, not a context object.
  //
  // The public devnet RPC drops connections often enough that a single
  // `fetch failed` used to abort the run before any registration happened.
  // Retry the read rather than treating a transient network blip as fatal.
  //
  // This top-up is best-effort: registration does not need it, and the public
  // devnet RPC rate-limits hard enough that a failed balance read used to abort
  // the run before anything was registered. Warn and continue instead.
  const MIN_AUTHORITY_LAMPORTS = 0.5 * 1_000_000_000;
  try {
    const lamports = await withRetry(() => connection.getBalance(authority.publicKey), 3);
    if (lamports < MIN_AUTHORITY_LAMPORTS) {
      console.log(
        `authority balance ${lamports / 1e9} SOL is below ${MIN_AUTHORITY_LAMPORTS / 1e9}: requesting an airdrop`,
      );
      const sig = await connection.requestAirdrop(
        authority.publicKey,
        MIN_AUTHORITY_LAMPORTS - lamports + 1_000_000,
      );
      const bh = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
    } else {
      console.log(`authority balance ${lamports / 1e9} SOL, enough for rent and fees`);
    }
  } catch (error) {
    console.log(
      `  could not read the authority balance (${error instanceof Error ? error.message : error}); continuing`,
    );
  }

  // 1. initialize the router
  if (await withRetry(() => connection.getAccountInfo(routerState), 5)) {
    console.log("router already initialized");
  } else {
    const s = await router.methods
      .initialize()
      .accounts({
        router: routerState,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`initialized router: ${s}`);
  }

  if (await withRetry(() => connection.getAccountInfo(verifierEntry), 5)) {
    console.log("verifier already registered, nothing to do");
    return;
  }

  // 2. Register the verifier under the Groth16 selector.
  //
  // This requires the router PDA to already be the verifier's LoaderV3
  // upgrade authority, which add_verifier checks so the router can revoke a
  // broken or compromised verifier.
  //
  // The router PDA cannot become the authority by itself: LoaderV3 forbids
  // SetAuthority as an inner instruction, so a CPI with invoke_signed is
  // refused with "not supported by inner instructions". It also cannot be
  // handed the authority the obvious way, because `solana program
  // set-upgrade-authority` defaults to SetAuthorityChecked, which requires the
  // NEW authority to co-sign and a PDA cannot sign a top-level transaction.
  //
  // The way through is the CLI's --skip-new-upgrade-authority-signer-check,
  // which drops the new-authority signature requirement and leaves only the
  // current authority's. That is a deliberate choice about who can deploy
  // verifiers, not a workaround: the deployer still cannot upgrade the
  // verifier afterwards, because authority now belongs to the router PDA and
  // only the router can exercise it. Run scripts/claim-verifier-authority.ts
  // once before this script on a fresh cluster.
  const s = await router.methods
    .addVerifier(SELECTOR)
    .accounts({
      router: routerState,
      verifierEntry,
      verifierProgramData: (await programDataAddress(GROTH16_PROGRAM_ID)),
      verifierProgram: GROTH16_PROGRAM_ID,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`registered groth16 verifier: ${s}`);
}

/** LoaderV3 stores program data in a PDA off the program id. */
async function programDataAddress(programId: PublicKey): Promise<PublicKey> {
  const [address] = await PublicKey.findProgramAddress(
    [programId.toBuffer()],
    new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
  );
  return address;
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
