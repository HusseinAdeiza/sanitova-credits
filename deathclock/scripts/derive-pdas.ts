// Derives the verifier_router PDAs for the currently-compiled program ID.
import { PublicKey } from "@solana/web3.js";

const ROUTER = new PublicKey(process.env.ROUTER_PROGRAM_ID!);
const SELECTOR = Buffer.from([0x73, 0xc4, 0x57, 0xba]);

const [state, stateBump] = PublicKey.findProgramAddressSync(
  [Buffer.from("router")],
  ROUTER,
);
const [entry, entryBump] = PublicKey.findProgramAddressSync(
  [Buffer.from("verifier"), SELECTOR],
  ROUTER,
);

console.log("router program :", ROUTER.toBase58());
console.log("router state   :", state.toBase58(), "bump", stateBump);
console.log("verifier entry :", entry.toBase58(), "bump", entryBump);
