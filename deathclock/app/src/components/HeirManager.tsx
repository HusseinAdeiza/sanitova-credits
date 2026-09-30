"use client";

import { useMemo, useState } from "react";
import type { Heir } from "@/types";

export function HeirManager({ heirs, onChange }: { heirs: Heir[]; onChange: (heirs: Heir[]) => void }) {
  const [address, setAddress] = useState("");
  const [share, setShare] = useState(0);
  const total = useMemo(() => heirs.reduce((sum, heir) => sum + heir.share, 0), [heirs]);
  const valid = address.trim().length > 20 && share > 0 && total + share <= 100;

  function addHeir() {
    if (!valid) return;
    onChange([...heirs, { address: address.trim(), share }]);
    setAddress("");
    setShare(0);
  }

  return (
    <section className="rounded-[2rem] border border-ink/10 bg-white/50 p-6 sm:p-8">
      <div className="flex items-end justify-between gap-4"><div><p className="label">Beneficiaries</p><h3 className="mt-2 font-display text-2xl">Who inherits?</h3></div><span className={`text-sm font-semibold ${total === 100 ? "text-ink" : "text-ember"}`}>{total}% assigned</span></div>
      <div className="mt-6 space-y-2">
        {heirs.map((heir, index) => <div key={`${heir.address}-${index}`} className="flex items-center justify-between rounded-xl bg-paper px-4 py-3 text-sm"><span className="font-mono text-xs">{heir.address}</span><span className="font-semibold">{heir.share}%</span></div>)}
        {heirs.length === 0 && <p className="rounded-xl border border-dashed border-ink/15 p-4 text-sm text-ink/45">Add up to five Solana addresses. Shares must total 100%.</p>}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_100px_auto]"><input className="field" placeholder="Solana heir address" value={address} onChange={(event) => setAddress(event.target.value)} /><input className="field" type="number" min="1" max="100" placeholder="Share %" value={share || ""} onChange={(event) => setShare(Number(event.target.value))} /><button className="button-quiet" onClick={addHeir} disabled={!valid}>Add</button></div>
    </section>
  );
}
