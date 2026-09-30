import { PublicKey } from "@solana/web3.js";

export const shorten = (value: string, size = 4) =>
  value.length <= size * 2 ? value : `${value.slice(0, size)}…${value.slice(-size)}`;

export const formatSol = (lamports: number) => {
  const value = lamports / 1_000_000_000;
  return value >= 1 ? value.toFixed(2) : value.toFixed(4);
};

export const vaultAddress = (owner: PublicKey, programId: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("vault"), owner.toBuffer()], programId)[0];

export const stateLabel = (state: string) => {
  const labels: Record<string, string> = {
    active: "Alive / active",
    missed: "Heartbeat missed",
    challenged: "Challenge window",
    release: "Ready to release",
    released: "Distributed",
  };
  return labels[state] || state;
};
