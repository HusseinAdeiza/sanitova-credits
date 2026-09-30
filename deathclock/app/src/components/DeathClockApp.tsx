"use client";

import { useState } from "react";
import { usePhantom } from "@/hooks/usePhantom";
import { useVault } from "@/hooks/useVault";
import { VaultCard } from "./VaultCard";
import { HeirManager } from "./HeirManager";
import { HeartbeatButton } from "./HeartbeatButton";
import { InheritanceStatus } from "./InheritanceStatus";
import type { Heir, VaultSnapshot } from "@/types";

const demo: VaultSnapshot = {
  address: "Awaiting wallet connection",
  initialized: false,
  state: "active",
  balanceSol: 0,
  totalDepositedSol: 0,
  lastHeartbeat: 0,
  deathReportedAt: 0,
  challengeStartedAt: 0,
  heartbeatInterval: 2592000,
  challengePeriod: 172800,
  heirs: [],
};

export function DeathClockApp() {
  const { publicKey, connected, connect, provider } = usePhantom();
  const { snapshot, loading, busy, message, initializeVault, deposit, reportDeath, initiateChallenge, resolveChallenge, releaseInheritance, refresh } = useVault(publicKey, provider);
  const [heirs, setHeirs] = useState<Heir[]>([]);
  const [notice, setNotice] = useState("Connect your wallet to inspect or create a vault.");
  const [lastSignature, setLastSignature] = useState<string | null>(null);
  const active = snapshot || { ...demo, heirs };
  const isDemo = !snapshot;
  const run = async (label: string, operation: () => Promise<unknown>) => { try { const result = await operation(); if (typeof result === "string") setLastSignature(result); setNotice(`${label} confirmed on Solana.`); return result; } catch (error) { setNotice(error instanceof Error ? error.message : `${label} failed.`); } };
  const onHeartbeat = async (payload: { timestamp: number; journalOutputs: number[] }) => { setNotice("Client journal built. A Groth16 prover seal is required before the transaction can be submitted."); void payload; };
  const onCreate = async () => { if (heirs.length === 0 || heirs.reduce((sum, heir) => sum + heir.share, 0) !== 100) { setNotice("Add heirs whose shares total 100% before creating the vault."); return; } await run("Vault creation", () => initializeVault(heirs)); };
  const onDeposit = async () => { const amount = Number(window.prompt("How much SOL would you like to deposit?", "1")); if (Number.isFinite(amount) && amount > 0) await run("Deposit", () => deposit(amount)); };
  const status = snapshot ? { ...snapshot, heirs: snapshot.heirs.length ? snapshot.heirs : heirs } : active;

  return <main className="min-h-screen overflow-hidden bg-paper"><div className="pointer-events-none fixed inset-0 opacity-50" style={{ backgroundImage: "linear-gradient(rgba(13,16,23,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(13,16,23,.045) 1px, transparent 1px)", backgroundSize: "40px 40px" }} /><div className="relative mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-10"><header className="flex items-center justify-between border-b border-ink/10 pb-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-ember text-lg font-bold text-white">◒</span><div><p className="font-display text-xl leading-none">DeathClock</p><p className="label mt-1">Your will, on-chain.</p></div></div><button className="button-quiet" onClick={connected ? refresh : connect}>{connected ? `${publicKey?.slice(0, 5)}…${publicKey?.slice(-4)}` : "Connect Phantom"}</button></header><section className="grid gap-12 py-14 lg:grid-cols-[1.15fr_.85fr] lg:items-end"><div><p className="label text-ember">Crypto inheritance / protocol 001</p><h1 className="mt-5 max-w-4xl font-display text-6xl leading-[.9] tracking-[-0.05em] sm:text-8xl">Love outlives your <em className="text-ember">last block.</em></h1><p className="mt-7 max-w-xl text-lg leading-8 text-ink/65">A trustless Solana vault that releases your estate to the people you choose—after a verifiable heartbeat goes quiet.</p><div className="mt-8 flex flex-wrap gap-3"><button className="button-primary" onClick={onCreate} disabled={busy || (isDemo && !connected)}>Create a vault <span className="ml-2">↗</span></button><button className="button-quiet" onClick={() => setNotice("Deposit SOL, then send a monthly heartbeat. A missed proof starts the 48-hour challenge window.")}>How it works</button></div></div><div className="hidden justify-self-end text-right lg:block"><p className="font-display text-8xl leading-none text-ink/10">48h</p><p className="label mt-2">challenge window</p></div></section><section className="grid gap-5"><VaultCard snapshot={active} onDeposit={onDeposit} disabled={busy || !connected} /><div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]"><HeirManager heirs={heirs} onChange={setHeirs} /><InheritanceStatus snapshot={status} busy={busy} onReportDeath={() => run("Death report", reportDeath)} onInitiateChallenge={() => run("Challenge", initiateChallenge)} onResolveChallenge={(alive) => run(alive ? "Recovery" : "Challenge resolution", () => resolveChallenge(alive))} onRelease={() => run("Inheritance release", releaseInheritance)} /></div></section><footer className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-ink/10 py-6 text-xs text-ink/50"><p>{loading ? "Syncing vault state…" : message || notice}{lastSignature && <a className="ml-2 underline" href={`https://explorer.solana.com/tx/${lastSignature}?cluster=devnet`} target="_blank" rel="noreferrer">View transaction ↗</a>}</p><HeartbeatButton owner={publicKey} onSubmit={onHeartbeat} disabled={busy || !connected} /></footer></div></main>;
}
