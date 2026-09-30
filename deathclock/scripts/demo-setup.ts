import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

const RPC_URL = process.env.DEATHCLOCK_RPC || "http://127.0.0.1:8899";
const PROGRAM_ID = new PublicKey(process.env.DEATHCLOCK_PROGRAM_ID || "BF1Y36xBRoQVB7z3gi5rSnciAHwbn5yMn8ToSnZ8Woo");

async function main() {
  const owner = Keypair.generate();
  const heirs = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), owner.publicKey.toBuffer()], PROGRAM_ID);
  console.log(JSON.stringify({ owner: owner.publicKey.toBase58(), vault: vault.toBase58(), heirs: heirs.map((h) => h.publicKey.toBase58()) }, null, 2));
  console.log("Demo setup is intentionally transaction-ready; connect a funded wallet to submit initialize_vault and deposit.");
  console.log(JSON.stringify({ program: PROGRAM_ID.toBase58(), rpc: RPC_URL, feeBps: 5, depositSol: new BN(10_000_000_000).toString() }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
