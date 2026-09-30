"use client";

import { useState } from "react";

/**
 * Builds the public journal output a DeathClock RISC Zero guest commits:
 *   SHA-256(owner || timestamp_le || nonce) || timestamp_le || nonce
 *
 * A real Groth16 `Seal` must be produced by a prover; this hook intentionally
 * stops at the input/output step rather than fabricating a proof.
 */
export function useZkProof() {
  const [generating, setGenerating] = useState(false);

  async function generate(owner: string, timestamp = Math.floor(Date.now() / 1000)) {
    setGenerating(true);
    try {
      const decoded = Uint8Array.from(atob(owner));
      if (decoded.length !== 32) throw new Error("Owner public key must decode to 32 bytes.");

      const timestampBytes = new Uint8Array(8);
      new DataView(timestampBytes.buffer).setBigUint64(0, BigInt(timestamp), true);
      const nonce = crypto.getRandomValues(new Uint8Array(24));

      const source = new Uint8Array(64);
      source.set(decoded, 0);
      source.set(timestampBytes, 32);
      source.set(nonce, 40);
      const commitment = await crypto.subtle.digest("SHA-256", source);

      const journalOutputs = new Uint8Array(64);
      journalOutputs.set(new Uint8Array(commitment), 0);
      journalOutputs.set(timestampBytes, 32);
      journalOutputs.set(nonce, 40);
      return { timestamp, journalOutputs: Array.from(journalOutputs) };
    } finally {
      setGenerating(false);
    }
  }

  return { generating, generate };
}
