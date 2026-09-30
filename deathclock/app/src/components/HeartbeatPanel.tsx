"use client";

import { useState } from "react";
import { parseProverSeal } from "@/utils/seal";
import type { HeartbeatPayload } from "@/utils/seal";
import { Pill, Footnote } from "@/components/ui";

/**
 * Heartbeat submission.
 *
 * A heartbeat requires a genuine Groth16 seal, and a browser cannot produce
 * one: the proof comes from the RISC Zero Groth16 prover running in Docker,
 * which writes a `seal.json`. This panel takes that file and submits it, so
 * the wallet signs the transaction while the prover does the cryptography.
 *
 * There is deliberately no "demo proof" path. The program rejects anything
 * that is not a real receipt, so a shortcut here would produce a button that
 * looks functional and a transaction the chain refuses.
 */
export function HeartbeatPanel({
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

  const trimmed = sealJson.trim();

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="label">Prove life</p>
        <Pill tone="neutral">Groth16</Pill>
      </div>

      <h3 className="mt-2.5 font-display text-display-sm text-ink">Send a heartbeat</h3>

      <p className="pretty mt-2.5 text-sm leading-relaxed text-muted">
        Paste the <span className="font-mono text-xs">seal.json</span> written by{" "}
        <span className="font-mono text-xs">scripts/prove-heartbeat.sh</span>. It commits to your
        public key, a timestamp and a nonce — proof of life without revealing your location or
        device.
      </p>

      <textarea
        className="field mt-4 min-h-[7.5rem] resize-y font-mono text-xs leading-relaxed"
        placeholder={'{\n  "selector": "73c457ba",\n  "piA": "…64 bytes hex…",\n  "piB": "…128 bytes hex…",\n  "piC": "…64 bytes hex…",\n  "journal": "…64 bytes hex…"\n}'}
        value={sealJson}
        onChange={(event) => setSealJson(event.target.value)}
        spellCheck={false}
        aria-label="Prover seal JSON"
      />

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-critical/30 bg-critical/10 px-3.5 py-2.5 text-xs leading-relaxed text-critical"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="btn-ember btn-md mt-4 w-full"
        onClick={submit}
        disabled={disabled || busy || trimmed.length === 0}
      >
        {busy ? "Submitting…" : "Submit heartbeat"}
      </button>

      <div className="mt-3.5">
        <Footnote>
          The program checks the journal against the live cluster clock inside a 300-second
          freshness window, so a proof cannot be generated ahead of time or replayed later.
        </Footnote>
      </div>
    </div>
  );
}
