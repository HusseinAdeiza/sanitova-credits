// Heartbeat payload types.
//
// A heartbeat is only accepted by the program if it carries a real Groth16
// seal, so this layer never invents one. Two sources are supported:
//
//  1. A seal produced by the trusted prover (`scripts/prove-heartbeat.sh`),
//     pasted in as the `seal.json` that script writes. This is the honest
//     browser path: the browser moves and signs the transaction, the prover
//     does the cryptography.
//  2. An automated proving service, if one is configured.
//
// The browser can build the *journal outputs* (the public commitment) itself —
// that is just a SHA-256 over data it already knows — but it cannot produce a
// proof, and nothing here pretends otherwise.

/** The Groth16 seal as the router expects it, with byte arrays not hex. */
export type HeartbeatSeal = {
  selector: number[];
  proof: { piA: number[]; piB: number[]; piC: number[] };
};

/** What `heartbeat()` needs: a real seal plus the journal it commits to. */
export type HeartbeatPayload = {
  seal: HeartbeatSeal;
  journalOutputs: number[];
};

/**
 * The `seal.json` written by `scripts/prove-heartbeat.sh`, which is hex-encoded
 * and additionally carries the image id and journal digest for verification.
 */
export type ProverSealFile = {
  selector: string;
  piA: string;
  piB: string;
  piC: string;
  journal: string;
  imageId?: string;
  journalDigest?: string;
};

/** pi_b is 128 bytes (uncompressed G2); the others are 64. */
const G1_BYTES = 64;
const G2_BYTES = 128;

function fromHex(hex: string, expectedBytes: number, label: string): number[] {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error(`${label} is not valid hex.`);
  }
  const bytes = clean.match(/.{2}/g)?.map((b) => parseInt(b, 16)) ?? [];
  if (bytes.length !== expectedBytes) {
    throw new Error(`${label} must be ${expectedBytes} bytes, got ${bytes.length}.`);
  }
  return bytes;
}

/**
 * Parses prover output into the payload the program takes, validating every
 * field's length first so a malformed paste fails in the UI with a readable
 * message instead of reverting on-chain for an obscure reason.
 */
export function parseProverSeal(raw: string): HeartbeatPayload {
  let parsed: ProverSealFile;
  try {
    parsed = JSON.parse(raw) as ProverSealFile;
  } catch {
    throw new Error("That is not valid JSON. Paste the whole seal.json file.");
  }

  const selector = fromHex(parsed.selector ?? "", 4, "selector");
  const journalOutputs = fromHex(parsed.journal ?? "", 64, "journal");

  return {
    seal: {
      selector,
      proof: {
        piA: fromHex(parsed.piA ?? "", G1_BYTES, "piA"),
        piB: fromHex(parsed.piB ?? "", G2_BYTES, "piB"),
        piC: fromHex(parsed.piC ?? "", G1_BYTES, "piC"),
      },
    },
    journalOutputs,
  };
}
