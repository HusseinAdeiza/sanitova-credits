import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, RPC_URL } from "./constants";

export const connectionConfig = {
  commitment: "confirmed" as const,
  endpoint: RPC_URL,
};

export const programId = new PublicKey(PROGRAM_ID);
