"use client";

import { useZkProof } from "@/hooks/useZkProof";

export function HeartbeatButton({ owner, onSubmit, disabled = false }: { owner: string | null; onSubmit: (payload: { timestamp: number; journalOutputs: number[] }) => Promise<void>; disabled?: boolean }) {
  const { generate, generating } = useZkProof();
  async function submit() {
    if (!owner) throw new Error("Connect a wallet before generating a heartbeat.");
    const payload = await generate(owner);
    await onSubmit(payload);
  }
  return <button className="button-primary bg-ember text-white" onClick={submit} disabled={disabled || generating || !owner}>{generating ? "Building proof…" : "Send heartbeat"}<span className="ml-2">⌁</span></button>;
}
