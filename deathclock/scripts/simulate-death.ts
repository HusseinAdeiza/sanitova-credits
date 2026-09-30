import { PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey(process.env.DEATHCLOCK_PROGRAM_ID || "BF1Y36xBRoQVB7z3gi5rSnciAHwbn5yMn8ToSnZ8Woo");
const OWNER = process.env.DEATHCLOCK_OWNER;
if (!OWNER) throw new Error("Set DEATHCLOCK_OWNER to the vault owner public key.");
const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), new PublicKey(OWNER).toBuffer()], PROGRAM_ID);
console.log(JSON.stringify({ program: PROGRAM_ID.toBase58(), owner: OWNER, vault: vault.toBase58(), steps: ["report_death", "initiate_challenge", "wait 48 hours", "resolve_challenge(false)", "release_inheritance"] }, null, 2));
