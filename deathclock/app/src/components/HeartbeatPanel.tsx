"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseProverSeal } from "@/utils/seal";
import type { HeartbeatPayload } from "@/utils/seal";
import {
  fetchHealth,
  isServiceConfigured,
  pollJob,
  requestProof,
  type ProveJob,
  type ServiceHealth,
  type ServiceSeal,
} from "@/utils/prover";
import { Pill, Footnote } from "@/components/ui";

/**
 * Heartbeat submission.
 *
 * A heartbeat needs a genuine Groth16 seal, and a browser cannot produce one:
 * the proof comes from the RISC Zero Groth16 prover, a multi-GB Docker pipeline
 * that takes 4-5 minutes. Two ways to get a seal, both real:
 *
 *   1. Ask the proving service. It proves for a forward-shifted timestamp and
 *      hands back a receipt with most of the 300-second window still open.
 *   2. Paste a `seal.json` produced out of band.
 *
 * There is deliberately no third path. The program rejects anything that is
 * not a real receipt, so a "demo proof" here would produce a button that looks
 * functional and a transaction the chain refuses.
 */
export function HeartbeatPanel({
  onSubmit,
  ownerKey,
  disabled = false,
}: {
  onSubmit: (payload: HeartbeatPayload) => Promise<void>;
  /** Connected wallet, needed because the seal must commit to the owner. */
  ownerKey?: string | null;
  disabled?: boolean;
}) {
  const [sealJson, setSealJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [health, setHealth] = useState<ServiceHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [job, setJob] = useState<ProveJob | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const serviceAvailable = isServiceConfigured();

  // Probe once on mount so the panel can say whether the service is reachable
  // before the user commits to a five-minute wait.
  useEffect(() => {
    if (!serviceAvailable) return;
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((value) => {
        setHealth(value);
        setHealthError(null);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setHealthError(cause instanceof Error ? cause.message : "Prover service unreachable.");
      });
    return () => controller.abort();
  }, [serviceAvailable]);

  useEffect(() => () => {
    if (pollRef.current) clearTimeout(pollRef.current);
  }, []);

  /** Turns the service's hex seal into the payload the program expects. */
  const toPayload = useCallback((seal: ServiceSeal): HeartbeatPayload => {
    return parseProverSeal(
      JSON.stringify({
        selector: seal.selector,
        piA: seal.piA,
        piB: seal.piB,
        piC: seal.piC,
        journal: seal.journal,
      }),
    );
  }, []);

  const submitPayload = useCallback(
    async (payload: HeartbeatPayload) => {
      setError(null);
      setBusy(true);
      try {
        await onSubmit(payload);
        setSealJson("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The transaction was rejected.");
      } finally {
        setBusy(false);
      }
    },
    [onSubmit],
  );

  /** Polls the service until the proof is ready, failed, or abandoned. */
  const watch = useCallback(
    async (active: ProveJob) => {
      for (;;) {
        let result;
        try {
          result = await pollJob(active);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Lost contact with the prover.");
          setJob(null);
          return;
        }

        setElapsed(result.elapsedSeconds);

        if (result.status === "ready") {
          setJob(null);
          await submitPayload(toPayload(result.seal));
          return;
        }
        if (result.status === "failed") {
          setError(result.error);
          setJob(null);
          return;
        }

        // Proving takes 4-5 minutes, so poll every few seconds rather than
        // hammering the service.
        await new Promise((resolve) => {
          pollRef.current = setTimeout(resolve, 3000);
        });
      }
    },
    [submitPayload, toPayload],
  );

  async function requestFromService() {
    setError(null);
    if (!ownerKey) {
      setError("Connect the wallet that owns the vault first — the proof must commit to it.");
      return;
    }
    setBusy(true);
    try {
      const requested = await requestProof(ownerKey);
      setJob(requested);
      setElapsed(0);
      void watch(requested);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach the prover.");
      setBusy(false);
    }
  }

  async function submitPasted() {
    setError(null);
    let payload: HeartbeatPayload;
    try {
      payload = parseProverSeal(sealJson);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read that seal.");
      return;
    }
    await submitPayload(payload);
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
        The proof commits to your public key, a timestamp and a nonce — proof of life without
        revealing your location or device. The cryptography runs in a RISC Zero prover, not in this
        tab.
      </p>

      {/* Path 1: the proving service */}
      {serviceAvailable ? (
        <div className="mt-4">
          <button
            type="button"
            className="btn-ember btn-md w-full"
            onClick={requestFromService}
            disabled={disabled || busy || Boolean(job)}
          >
            {job ? `Proving… ${elapsed}s` : busy ? "Requesting…" : "Request a proof"}
          </button>

          {healthError ? (
            <p className="mt-2.5 text-xs leading-relaxed text-muted">
              Prover service unreachable ({healthError}). You can still paste a seal below.
            </p>
          ) : health ? (
            <p className="mt-2.5 text-xs leading-relaxed text-muted">
              Prover ready ·{" "}
              {health.provingTimes.length > 0
                ? `proofs take ~${Math.round(
                    health.provingTimes.reduce((total: number, value: number) => total + value, 0) /
                      health.provingTimes.length,
                  )}s here`
                : "first proof will be slow"}
              {" · "}
              {health.queued + (health.proving ? 1 : 0)} in queue
            </p>
          ) : null}

          {job ? (
            <p className="mt-2.5 text-xs leading-relaxed text-muted">
              Proving takes 4–5 minutes. The receipt is bound to a forward timestamp, so it will
              still be inside the freshness window when it arrives.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Path 2: paste a seal */}
      <div className={serviceAvailable ? "mt-5 border-t border-line/12 pt-5" : "mt-4"}>
        <p className="label">
          {serviceAvailable ? "Or paste a seal" : "Paste a prover seal"}
        </p>
        <textarea
          className="field mt-2.5 min-h-[6.5rem] resize-y font-mono text-xs leading-relaxed"
          placeholder={'{\n  "selector": "73c457ba",\n  "piA": "…64 bytes hex…",\n  "piB": "…128 bytes hex…",\n  "piC": "…64 bytes hex…",\n  "journal": "…64 bytes hex…"\n}'}
          value={sealJson}
          onChange={(event) => setSealJson(event.target.value)}
          spellCheck={false}
          aria-label="Prover seal JSON"
        />

        <button
          type="button"
          className="btn-ghost btn-md mt-3 w-full"
          onClick={submitPasted}
          disabled={disabled || busy || trimmed.length === 0}
        >
          {busy ? "Submitting…" : "Submit pasted seal"}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-critical/30 bg-critical/10 px-3.5 py-2.5 text-xs leading-relaxed text-critical"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-3.5">
        <Footnote>
          The program checks the journal against the live cluster clock inside a 300-second
          freshness window, so a proof cannot be generated ahead of time or replayed later.
        </Footnote>
      </div>
    </div>
  );
}
