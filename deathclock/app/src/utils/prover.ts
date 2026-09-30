/**
 * Client for the DeathClock proving service.
 *
 * The service exists because a browser cannot produce a Groth16 proof: the
 * RISC Zero pipeline is a multi-GB Docker job that takes 4-5 minutes, while
 * the program only accepts a receipt within 300 seconds of its timestamp. The
 * service absorbs that gap by proving for a forward-shifted timestamp and
 * telling us how much window is left.
 *
 * Every function here can fail, and every failure is reported rather than
 * papered over. In particular a proof that arrives too late to use is an
 * error, not something to submit anyway -- the program would reject it, and
 * the user deserves to know the window closed rather than seeing a confusing
 * chain error.
 */

/** A seal as the service returns it: hex strings, as the prover wrote them. */
export type ServiceSeal = {
  selector: string;
  piA: string;
  piB: string;
  piC: string;
  journal: string;
  imageId?: string;
};

export type ProveJob = {
  jobId: string;
  /** The forward-shifted timestamp the proof is for, in unix seconds. */
  timestamp: number;
  offsetSeconds: number;
};

/** Must match PROOF_MAX_AGE_SECONDS in programs/deathclock/src/lib.rs. */
const PROOF_MAX_AGE_SECONDS = 300;

export type ServiceHealth = {
  ok: boolean;
  queued: number;
  proving: boolean;
  provingTimes: number[];
  nextOffset: number;
};

function serviceUrl(): string {
  // Empty in production unless configured, which is the honest default: the
  // service is a local or self-hosted component, not something a visitor's
  // browser should assume it can reach.
  return process.env.NEXT_PUBLIC_PROVER_URL ?? "";
}

export function isServiceConfigured(): boolean {
  return serviceUrl().length > 0;
}

export async function fetchHealth(signal?: AbortSignal): Promise<ServiceHealth> {
  const base = serviceUrl();
  const response = await fetch(`${base}/health`, { signal });
  if (!response.ok) throw new Error(`Prover service returned ${response.status}.`);
  return (await response.json()) as ServiceHealth;
}

/** Requests a proof. Returns immediately with a job to poll. */
export async function requestProof(ownerPublicKey: string): Promise<ProveJob> {
  const base = serviceUrl();
  // The guest commits over the raw 32 key bytes, not the base58 text, so the
  // owner has to be sent as hex.
  const owner = toHex(publicKeyToBytes(ownerPublicKey));
  const response = await fetch(`${base}/prove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `The prover service refused the request (${response.status}).${detail ? ` ${detail}` : ""}`,
    );
  }
  return (await response.json()) as ProveJob;
}

export type PollResult =
  | { status: "queued" | "proving"; elapsedSeconds: number }
  | { status: "ready"; seal: ServiceSeal; elapsedSeconds: number; remainingSeconds: number }
  | { status: "failed"; error: string; elapsedSeconds: number };

export async function pollJob(job: ProveJob, signal?: AbortSignal): Promise<PollResult> {
  const base = serviceUrl();
  const response = await fetch(`${base}/prove/${job.jobId}`, { signal });
  if (!response.ok) throw new Error(`Prover service returned ${response.status}.`);
  const body = (await response.json()) as {
    status: string;
    seal?: ServiceSeal;
    error?: string;
    startedAt?: number;
    finishedAt?: number;
    createdAt?: number;
  };

  const started = body.startedAt ?? body.createdAt ?? 0;
  const finished = body.finishedAt ?? Date.now();
  const elapsedSeconds = Math.round((finished - started) / 1000);

  if (body.status === "ready" && body.seal) {
    const age = Math.floor(Date.now() / 1000) - job.timestamp;
    const remainingSeconds = PROOF_MAX_AGE_SECONDS - age;
    if (remainingSeconds <= 0) {
      // The proof is genuine but too old to use. Saying so is more useful than
      // letting the chain reject it with an opaque freshness error.
      return {
        status: "failed",
        error: `The proof is ${age}s old but the program only accepts ${PROOF_MAX_AGE_SECONDS}s. Request another.`,
        elapsedSeconds,
      };
    }
    return { status: "ready", seal: body.seal, elapsedSeconds, remainingSeconds };
  }

  if (body.status === "failed") {
    return { status: "failed", error: body.error ?? "The prover did not return a seal.", elapsedSeconds };
  }

  return { status: body.status === "queued" ? "queued" : "proving", elapsedSeconds };
}

/* ------------------------------------------------------------------ *
 * base58 <-> hex, without pulling in a dependency for two functions.
 * ------------------------------------------------------------------ */

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function publicKeyToBytes(base58: string): Uint8Array {
  // Multiply through a byte array rather than accumulating into a number.
  //
  // A Solana address is 32 bytes = 256 bits, which does NOT fit in a float64's
  // 53-bit mantissa. Accumulating `value = value * 58 + digit` decodes the
  // first few bytes correctly and then silently rounds, producing a key that
  // looks plausible and is wrong -- and a seal proved for the wrong owner is
  // rejected by the program for a reason unrelated to the proof.
  //
  // BigInt would be the obvious fix but its literals require an ES2020 target,
  // so this uses the standard schoolbook multiply instead.
  const bytes = new Uint8Array(32);
  for (const character of base58) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) throw new Error(`Not a base58 address: ${base58}`);

    let carry = digit;
    for (let index = 31; index >= 0; index -= 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    if (carry !== 0) throw new Error("That address does not fit in 32 bytes.");
  }
  // Leading zero bytes are implicit in base58 and are already zero here.
  return bytes;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
