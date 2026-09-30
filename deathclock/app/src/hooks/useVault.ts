"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { deathclockIdl } from "@/idl/deathclock";
import { GROTH16_VERIFIER_PROGRAM_ID, ROUTER_PROGRAM_ID, routerStateAddress, verifierEntryAddress } from "@/utils/verifier";
import { HEARTBEAT_INTERVAL, CHALLENGE_PERIOD, RPC_URL } from "@/utils/constants";
import { programId } from "@/utils/anchor";
import { vaultAddress } from "@/utils/helpers";
import type { Heir, HeartbeatPayload, VaultSnapshot, VaultState } from "@/types";

const connection = new Connection(RPC_URL, "confirmed");
const stateName = (state: unknown): VaultState => {
  if (state && typeof state === "object") {
    const key = Object.keys(state)[0]?.toLowerCase();
    if (key === "missed" || key === "challenged" || key === "release" || key === "released") return key;
    return "active";
  }
  return "active";
};

export function useVault(owner: string | null, walletProvider: any) {
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSignature, setLastSignature] = useState<string | null>(null);
  const ownerKey = useMemo(() => owner ? new PublicKey(owner) : null, [owner]);
  const provider = useMemo(() => {
    if (!ownerKey || !walletProvider) return null;
    const wallet = { publicKey: ownerKey, signTransaction: (tx: any) => walletProvider.signTransaction(tx), signAllTransactions: (txs: any[]) => walletProvider.signAllTransactions(txs) };
    return new AnchorProvider(connection, wallet as any);
  }, [ownerKey, walletProvider]);
  const program = useMemo(() => provider ? new Program(deathclockIdl as any, provider) as any : null, [provider]);
  const vault = useMemo(() => ownerKey ? vaultAddress(ownerKey, programId) : null, [ownerKey]);

  const refresh = useCallback(async () => {
    if (!ownerKey || !vault) { setSnapshot(null); return; }
    setLoading(true); setMessage(null);
    try {
      const balanceSol = (await connection.getBalance(vault)) / 1_000_000_000;
      const account = await connection.getAccountInfo(vault);
      if (!account) {
        setSnapshot({ address: vault.toBase58(), initialized: false, state: "active", balanceSol, totalDepositedSol: 0, lastHeartbeat: 0, deathReportedAt: 0, challengeStartedAt: 0, heartbeatInterval: HEARTBEAT_INTERVAL, challengePeriod: CHALLENGE_PERIOD, heirs: [] });
        return;
      }
      if (!program) return;
      const data = await program.account.vault.fetch(vault);
      const shares = Buffer.from(data.shares);
      setSnapshot({ address: vault.toBase58(), initialized: true, state: stateName(data.state), balanceSol, totalDepositedSol: data.totalDeposited.toNumber() / 1_000_000_000, lastHeartbeat: data.lastHeartbeat.toNumber(), deathReportedAt: data.deathReportedAt.toNumber(), challengeStartedAt: data.challengeStartedAt.toNumber(), heartbeatInterval: data.heartbeatInterval.toNumber(), challengePeriod: data.challengePeriod.toNumber(), heirs: data.heirs.map((heir: PublicKey, index: number) => ({ address: heir.toBase58(), share: shares[index] ?? 0 })) });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load vault."); }
    finally { setLoading(false); }
  }, [ownerKey, program, vault]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function run<T>(operation: () => Promise<T>) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await operation();
      // Anchor's .rpc() resolves to a signature string; capture it so the UI
      // can link the confirmed transaction to Explorer.
      if (typeof result === "string") setLastSignature(result);
      await refresh();
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Transaction failed.");
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function initializeVault(heirs: Heir[]) { if (!program || !ownerKey) throw new Error("Connect a wallet first."); const keys = heirs.map((heir) => new PublicKey(heir.address)); const shares = heirs.map((heir) => heir.share); return run(() => program.methods.initializeVault(keys, Buffer.from(shares), new BN(HEARTBEAT_INTERVAL), new BN(CHALLENGE_PERIOD)).accounts({ owner: ownerKey }).rpc()); }
  async function deposit(sol: number) { if (!program || !ownerKey || !vault) throw new Error("Connect a wallet first."); return run(() => program.methods.deposit(new BN(Math.round(sol * 1_000_000_000))).accounts({ owner: ownerKey, vault } as any).rpc()); }
  async function heartbeat(payload: HeartbeatPayload) {
    if (!program || !ownerKey) throw new Error("Connect a wallet first.");
    return run(() => program.methods
      .heartbeat(payload.seal, Buffer.from(payload.journalOutputs))
      .accounts({
        owner: ownerKey,
        router: ROUTER_PROGRAM_ID,
        routerState: routerStateAddress(),
        verifierEntry: verifierEntryAddress(payload.seal.selector),
        verifierProgram: GROTH16_VERIFIER_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc());
  }
  async function reportDeath() { if (!program || !vault) throw new Error("Connect a wallet first."); return run(() => program.methods.reportDeath().accounts({ vault } as any).rpc()); }
  async function initiateChallenge() { if (!program || !vault) throw new Error("Connect a wallet first."); return run(() => program.methods.initiateChallenge().accounts({ vault } as any).rpc()); }
  async function resolveChallenge(isAlive: boolean) { if (!program || !vault) throw new Error("Connect a wallet first."); return run(() => program.methods.resolveChallenge(isAlive).accounts({ vault } as any).rpc()); }
  async function releaseInheritance() { if (!program || !vault || !snapshot) throw new Error("Connect a wallet first."); const [treasury, treasuryBump] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], programId); return run(() => program.methods.releaseInheritance(treasuryBump).accounts({ vault, treasury, systemProgram: SystemProgram.programId } as any).remainingAccounts(snapshot.heirs.map((heir) => ({ pubkey: new PublicKey(heir.address), isSigner: false, isWritable: true }))).rpc()); }

  return {
    snapshot,
    loading,
    busy,
    message,
    /** Lets the UI report its own validation errors through the same channel. */
    setMessage,
    /** Last confirmed signature, so a caller can link to it on Explorer. */
    lastSignature,
    refresh,
    initializeVault,
    deposit,
    heartbeat,
    reportDeath,
    initiateChallenge,
    resolveChallenge,
    releaseInheritance,
  };
}
