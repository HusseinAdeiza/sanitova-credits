"use client";

import { useState } from "react";
import { parseProverSeal } from "@/utils/seal";
import type { HeartbeatPayload } from "@/utils/seal";

/**
 * Heartbeat submission.
 *
 * A heartbeat needs a genuine Groth16 seal, and a browser cannot produce one:
 * the proving pipeline is the RISC Zero Groth16 prover in Docker, which writes
 * a `seal.json`. So this component takes that file's contents and submits them.
 * It deliberately does not offer a "demo" or "mock" shortcut — the program
 * rejects anything that is not a real proof, and a button that appears to work
 * while producing nothing accepted would be worse than an honest one.
 */
export function HeartbeatButton({
  onSubmit,
  disabled = false,
}: {
  onSubmit: (payload: HeartbeatPayload) => Promise<void>;
  disabled?: boolean;
}) {
  const [sealJson, setSealJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    let payload: HeartbeatPayload;
    try {
      payload = parseProverSeal(sealJson);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read that seal.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(payload);
      setSealJson("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The transaction was rejected.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-ink/10 bg-white/50 p-6 sm:p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="label">Prove life</p>
          <h3 className="mt-2 font-display text-2xl">Send a heartbeat</h3>
        </div>
        <span className="text-sm font-semibold text-ink/45">ZK · Groth16</span>
      </div>

      <p className="mt-4 max-w-prose text-sm text-ink/60">
        Paste the <code className="font-mono text-xs">seal.json</code> produced by the
        prover. Your wallet signs the transaction; the proof itself is generated off-browser,
        so a heartbeat can never be faked from this page.
      </p>

      <textarea
        className="field mt-5 min-h-[8rem] font-mono text-xs"
        placeholder={'{ "selector": "73c457ba", "piA": "…", "piB": "…", "piC": "…", "journal": "…" }'}
        value={sealJson}
        onChange={(event) => setSealJson(event.target.value)}
        spellCheck={false}
      />

      {error && (
        <p className="mt-3 rounded-xl border border-ember/30 bg-ember/5 px-4 py-3 text-sm text-ember">
          {error}
        </p>
      )}

      <button
        className="button-primary mt-5 bg-ember text-white"
        onClick={submit}
        disabled={disabled || busy || sealJson.trim().length === 0}
      >
        {busy ? "Submitting…" : "Submit heartbeat"}
        <span className="ml-2">⌁</span>
      </button>
    </section>
  );
}
