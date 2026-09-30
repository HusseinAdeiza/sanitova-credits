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
const ROUTER_PROGRAM_ID = new PublicKey("2CYCBtLHLrd13S9AvvZ73SS691bfzNM7uQoayRtmeFT3");
const GROTH16_PROGRAM_ID = new PublicKey("Cct3GAKER29JFHJTMgcgNkiGTzza9y4sEdBceiuRfBGj");
const SELECTOR = [0x73, 0xc4, 0x57, 0xba];

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

  const sig = await connection.requestAirdrop(authority.publicKey, 10 * 1_000_000_000);
  const bh = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");

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

  // 2. The verifier's LoaderV3 upgrade authority is already the router PDA:
  // it is supplied as the third --upgradeable-program argument at genesis, so
  // there is no authority transfer to perform here.

  // 3. register the verifier under the Groth16 selector
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
