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

export type HeartbeatPayload = { seal: { selector: number[]; proof: { piA: number[]; piB: number[]; piC: number[] } }; journalOutputs: number[] };
