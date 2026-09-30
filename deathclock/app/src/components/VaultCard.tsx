"use client";

import { useMemo } from "react";
import type { Heir, VaultSnapshot } from "@/types";
import { formatSol, shorten, stateLabel } from "@/utils/helpers";

export function VaultCard({ snapshot, onDeposit, disabled = false }: { snapshot: VaultSnapshot; onDeposit: () => void; disabled?: boolean }) {
  const balance = useMemo(() => formatSol(snapshot.balanceSol), [snapshot.balanceSol]);
  return <article className="relative overflow-hidden rounded-[2rem] bg-ink p-6 text-paper shadow-editorial sm:p-8"><div className="absolute -right-8 -top-10 h-36 w-36 rounded-full border border-acid/30" /><div className="absolute -right-2 top-2 h-16 w-16 rounded-full border border-acid/20" /><div className="relative flex items-start justify-between gap-6"><div><p className="label text-paper/45">Your inheritance vault</p><h2 className="mt-3 max-w-sm font-display text-3xl leading-none tracking-tight">A promise that keeps its own time.</h2></div><span className="rounded-full border border-acid/40 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-acid">Trustless</span></div><div className="relative mt-12 grid grid-cols-2 gap-6 border-t border-paper/15 pt-5 sm:grid-cols-4"><div><p className="label text-paper/45">Balance</p><p className="mt-2 text-2xl font-semibold">{balance} <span className="text-sm text-paper/50">SOL</span></p></div><div><p className="label text-paper/45">Status</p><p className="mt-2 text-sm font-semibold text-acid">{stateLabel(snapshot.state)}</p></div><div><p className="label text-paper/45">Vault</p><p className="mt-2 font-mono text-xs text-paper/70">{shorten(snapshot.address, 6)}</p></div><div><p className="label text-paper/45">Last proof</p><p className="mt-2 text-sm font-semibold">{snapshot.lastHeartbeat ? new Date(snapshot.lastHeartbeat * 1000).toLocaleDateString() : "Not yet"}</p></div></div><button className="button-primary relative mt-8 bg-acid text-ink hover:bg-ember hover:text-white" onClick={onDeposit} disabled={disabled}>Deposit SOL <span className="ml-2">↗</span></button></article>;
}

export function VaultMiniCard({ state, amount }: { state: string; amount: string }) {
  return <div className="rounded-2xl border border-ink/10 bg-white/50 p-4"><p className="label">Estate value</p><p className="mt-2 text-2xl font-semibold">{amount}</p><p className="mt-1 text-xs text-ink/50">{stateLabel(state)}</p></div>;
}

export type { Heir };
