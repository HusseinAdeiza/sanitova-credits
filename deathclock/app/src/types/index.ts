export type VaultState = "active" | "missed" | "challenged" | "release" | "released";

export type Heir = { address: string; share: number };

export type VaultSnapshot = {
  address: string;
  initialized: boolean;
  state: VaultState;
  balanceSol: number;
  totalDepositedSol: number;
  lastHeartbeat: number;
  deathReportedAt: number;
  challengeStartedAt: number;
  heartbeatInterval: number;
  challengePeriod: number;
  heirs: Heir[];
  error?: string;
};

// Re-exported from utils/seal, which owns the shape and its parser. Keeping it
// here as well preserves the existing `@/types` import path.
export type { HeartbeatPayload, HeartbeatSeal } from "@/utils/seal";
