// Brings the RISC Zero verifier router up on localnet:
//   1. initializes the router PDA (authority must be the baked-in INITIAL_OWNER)
//   2. points the groth_16_verifier's LoaderV3 upgrade authority at the router
//   3. registers the Groth16 verifier under its selector
//
// Step 2 is done at genesis: scripts/localnet-e2e.sh passes the router PDA as
// the upgrade authority argument to --upgradeable-program, so by the time this
// runs the verifier already reports the router as its authority.
import * as anchor from "@coral-xyz/anchor";
import { Idl, Program } from "@coral-xyz/anchor";
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

// Point at the VPS validator through an SSH tunnel:
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

const IDL_PATH = "vendor/risc0-solana/solana-verifier/target/idl/verifier_router.json";
const WALLET = process.env.HOME + "/.config/solana/id.json";

const connection = new Connection(RPC, "confirmed");

const authority = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(WALLET, "utf8")) as number[]),
);

const routerState = PublicKey.findProgramAddressSync(
  [Buffer.from("router")],
  ROUTER_PROGRAM_ID,
)[0];
const verifierEntry = PublicKey.findProgramAddressSync(
  [Buffer.from("verifier"), Buffer.from(SELECTOR)],
  ROUTER_PROGRAM_ID,
)[0];

async function main() {
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

  console.log(`authority      ${authority.publicKey.toBase58()}`);
  console.log(`router state   ${routerState.toBase58()}`);
  console.log(`verifier entry ${verifierEntry.toBase58()}`);

  // Only top up if we are actually short. `requestAirdrop` is heavily
  // rate-limited on devnet and throws on failure, so never call it
  // speculatively -- check the balance first.
  // `getBalance` resolves to a lamport count, not a context object.
  const lamports = await connection.getBalance(authority.publicKey);
  const MIN_AUTHORITY_LAMPORTS = 0.5 * 1_000_000_000;
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
    console.log(
      `authority balance ${lamports / 1e9} SOL, enough for rent and fees`,
    );
  }

  // 1. initialize the router
  if (await connection.getAccountInfo(routerState)) {
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

  if (await connection.getAccountInfo(verifierEntry)) {
    console.log("verifier already registered, nothing to do");
    return;
  }

  // 2. Register the verifier under the Groth16 selector.
  //
  // NOTE: this requires the router PDA to already be the verifier's LoaderV3
  // upgrade authority, which add_verifier checks so the router can delete a
  // broken or compromised verifier.
  //
  // That works on a local validator because `solana-test-validator
  // --bpf-program` assigns the authority at genesis. It cannot be done on a
  // public cluster, and this is a platform limit rather than a deployment
  // mistake:
  //
  //   * A client cannot do it, because `solana program set-upgrade-authority`
  //     uses the loader's SetAuthorityChecked, which requires the NEW
  //     authority to sign -- and the new authority is a PDA.
  //   * A program cannot do it either. Having the router perform the transfer
  //     with invoke_signed as the PDA looks right, but the runtime rejects it:
  //     "Program BPFLoaderUpgradeab1e... not supported by inner instructions".
  //     Loader-v3 forbids CPI of SetAuthority/Upgrade/Close/Deploy entirely.
  //
  // So on devnet this call is expected to fail with VerifierInvalidAuthority
  // until the verifier is deployed by a validator operator. See
  // docs/POSTMORTEM.md.
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
