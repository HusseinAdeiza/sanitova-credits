/**
 * A proving service for DeathClock heartbeats.
 *
 * The browser cannot produce a Groth16 proof -- the RISC Zero pipeline is a
 * multi-GB Docker job that takes 4-5 minutes -- but the program will only
 * accept a receipt within PROOF_MAX_AGE_SECONDS (300) of its timestamp. Those
 * two facts are in direct tension, and a plain request/response service loses:
 * by the time a proof is ready, most of the window is gone.
 *
 * The service solves it the way the on-chain program allows: it proves for a
 * *forward-shifted* timestamp, and reports the offset it used, so the client
 * submits immediately on receipt. Two constraints shape the design:
 *
 *   1. Proving takes 4-5 minutes and the tool/host may restart. Work is
 *      therefore a persisted queue on disk, not in-memory promises, and the
 *      offset is derived from measured history (see proveOffset).
 *   2. Exactly one proof runs at a time. The Groth16 wrap saturates the host,
 *      and a second concurrent job makes both miss their window.
 *
 * It is a proving service and nothing more: it returns a genuine seal or an
 * error. It never fabricates, caches, or replays a proof.
 *
 * Usage:
 *   npx tsx scripts/prover-service.ts            # listen on :8787
 *   PROVER_PORT=9000 npx tsx scripts/prover-service.ts
 *
 * API:
 *   GET  /health          -> { ok, queued, proving, provingTimes }
 *   POST /prove           -> { owner, timestamp?, nonce? }
 *                          -> 202 { jobId, status: "queued" }
 *   GET  /prove/:jobId    -> { status, seal?, error?, ... }
 */
import { execFile } from "node:child_process";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.PROVER_PORT || 8787);
const ROOT = process.cwd();
const WORK_DIR = join(ROOT, "target", "risc0-work");
const QUEUE_DIR = join(ROOT, "target", "prover-queue");
const HISTORY_PATH = join(QUEUE_DIR, "prove-seconds.txt");

/** Must match programs/deathclock/src/lib.rs. */
const PROOF_MAX_AGE_SECONDS = 300;
const PROOF_MAX_FUTURE_SECONDS = 60;

type JobStatus = "queued" | "proving" | "ready" | "failed";

type Job = {
  id: string;
  owner: string;
  timestamp: number;
  nonce: string;
  offsetSeconds: number;
  status: JobStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  log?: string;
};

/* ------------------------------------------------------------------ *
 * The offset, derived from what this host has actually managed.
 * ------------------------------------------------------------------ */

function proveTimings(): number[] {
  if (!existsSync(HISTORY_PATH)) return [];
  return readFileSync(HISTORY_PATH, "utf8")
    .split("\n")
    .map((line) => Number(line.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function recordProving(seconds: number) {
  mkdirSync(QUEUE_DIR, { recursive: true });
  const existing = proveTimings();
  writeFileSync(HISTORY_PATH, [...existing, String(seconds)].join("\n") + "\n");
}

/**
 * A timestamp offset that lands the receipt inside the program's window.
 *
 * `age = actual_prove_time - offset`, and the program accepts
 * `-PROOF_MAX_FUTURE_SECONDS <= age <= PROOF_MAX_AGE_SECONDS`. So the offsets
 * that work for every observed proving time are
 *   [max(times) - MAX_AGE, min(times) + MAX_FUTURE]
 * and we take the midpoint. A fixed offset cannot cover a wide spread: too
 * small and the seal is stale on arrival, too large and it is in the future.
 */
function proveOffset(): number {
  const times = proveTimings();
  if (times.length === 0) {
    // No history yet. Aim at the middle of the window on the assumption that a
    // cold first run is slow; subsequent runs correct it.
    return Math.floor((PROOF_MAX_AGE_SECONDS + PROOF_MAX_FUTURE_SECONDS) / 2);
  }
  const lower = Math.max(...times) - PROOF_MAX_AGE_SECONDS;
  const upper = Math.min(...times) + PROOF_MAX_FUTURE_SECONDS;
  return Math.round((lower + upper) / 2);
}

/* ------------------------------------------------------------------ *
 * Persisted queue. Survives a restart mid-proof.
 * ------------------------------------------------------------------ */

const jobs = new Map<string, Job>();
let proving = false;

function jobPath(id: string) {
  return join(QUEUE_DIR, `${id}.json`);
}

function saveJob(job: Job) {
  mkdirSync(QUEUE_DIR, { recursive: true });
  writeFileSync(jobPath(job.id), JSON.stringify(job, null, 2));
}

function loadJobs() {
  mkdirSync(QUEUE_DIR, { recursive: true });
  for (const file of readdirSync(QUEUE_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const job = JSON.parse(readFileSync(join(QUEUE_DIR, file), "utf8")) as Job;
      jobs.set(job.id, job);
    } catch {
      // A corrupt job file must not stop the service from starting.
    }
  }
}

/** Any job left "proving" by a previous process is dead, not running. */
function reconcileOnStart() {
  for (const job of jobs.values()) {
    if (job.status === "proving" || job.status === "queued") {
      job.status = "failed";
      job.error = "service restarted before this proof completed; re-request it";
      job.finishedAt = Date.now();
      saveJob(job);
    }
  }
}

function enqueue(owner: string, timestamp?: number, nonce?: string): Job {
  const offset = proveOffset();
  const job: Job = {
    id: randomBytes(8).toString("hex"),
    owner,
    timestamp: timestamp ?? Math.floor(Date.now() / 1000) + offset,
    nonce: nonce ?? randomBytes(24).toString("hex"),
    offsetSeconds: offset,
    status: "queued",
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  saveJob(job);
  return job;
}

/**
 * Runs the proving script.
 *
 * The script path is absolute on purpose: `execFile("bash", ["scripts/..."])`
 * does not resolve relative to `cwd` the way a shell would, and fails with
 * "No such file or directory" -- exit code 127, which looks like a missing
 * interpreter rather than a path bug.
 */
function runProver(args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    execFile("bash", [join(ROOT, "scripts", "prove-heartbeat.sh"), ...args], {
      cwd: ROOT,
      maxBuffer: 32 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      resolve({
        code: error ? ((error as NodeJS.ErrnoException & { code?: number }).code ?? 1) : 0,
        output: `${stdout}${stderr}`,
      });
    });
  });
}

async function drain() {
  if (proving) return;
  proving = true;
  try {
    for (;;) {
      const next = [...jobs.values()].find((job) => job.status === "queued");
      if (!next) break;

      next.status = "proving";
      next.startedAt = Date.now();
      saveJob(next);

      const result = await runProver([
        "--owner", next.owner,
        "--timestamp", String(next.timestamp),
        "--nonce", next.nonce,
      ]);
      next.log = result.output.slice(-4000);

      if (result.code !== 0) {
        next.status = "failed";
        next.error = `prover exited ${result.code}`;
      } else {
        const sealPath = join(WORK_DIR, "seal.json");
        if (!existsSync(sealPath)) {
          next.status = "failed";
          next.error = "prover reported success but wrote no seal.json";
        } else {
          const seal = JSON.parse(readFileSync(sealPath, "utf8")) as Record<string, unknown>;
          // Read back what the prover ACTUALLY used, rather than trusting the
          // arguments we passed. prove-heartbeat.sh re-generated the nonce
          // instead of honouring --nonce, so the job's own record disagreed
          // with the seal and a valid proof was rejected. The prover's output
          // is the authority on what was proven.
          const inputPath = join(WORK_DIR, "heartbeat-input.json");
          if (!existsSync(inputPath)) {
            next.status = "failed";
            next.error = "prover wrote a seal but no heartbeat-input.json to verify it against";
          } else {
            const input = JSON.parse(readFileSync(inputPath, "utf8")) as {
              owner: string;
              timestamp: string;
              nonce: string;
            };
            const age = Math.floor(Date.now() / 1000) - Number(input.timestamp);
            if (age > PROOF_MAX_AGE_SECONDS) {
              next.status = "failed";
              next.error = `seal is ${age}s old, past the ${PROOF_MAX_AGE_SECONDS}s window`;
            } else {
              // Only ever hand back a seal whose journal commits to the owner
              // that asked for it.
              const journal = Buffer.from(String(seal.journal), "hex");
              const digest = journal.subarray(0, 32);
              const timestampBuffer = Buffer.alloc(8);
              timestampBuffer.writeBigUInt64LE(BigInt(input.timestamp));
              const expected = createHash("sha256")
                .update(
                  Buffer.concat([
                    Buffer.from(input.owner, "hex"),
                    timestampBuffer,
                    Buffer.from(input.nonce, "hex"),
                  ]),
                )
                .digest();
              if (!digest.equals(expected)) {
                next.status = "failed";
                next.error = "journal does not commit to the owner the prover used";
              } else if (input.owner.toLowerCase() !== next.owner.toLowerCase()) {
                next.status = "failed";
                next.error = `proved for ${input.owner}, not the requested ${next.owner}`;
              } else {
                next.status = "ready";
                next.timestamp = Number(input.timestamp);
                next.nonce = input.nonce;
                (next as Job & { seal?: unknown }).seal = {
                  selector: seal.selector,
                  piA: seal.piA,
                  piB: seal.piB,
                  piC: seal.piC,
                  journal: seal.journal,
                  imageId: seal.imageId,
                };
                if (next.startedAt) {
                  recordProving(Math.round((Date.now() - next.startedAt) / 1000));
                }
              }
            }
          }
        }
      }
      next.finishedAt = Date.now();
      saveJob(next);
    }
  } finally {
    proving = false;
  }
}

/* ------------------------------------------------------------------ *
 * HTTP
 * ------------------------------------------------------------------ */

function send(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    send(res, 200, {
      ok: true,
      queued: [...jobs.values()].filter((j) => j.status === "queued").length,
      proving,
      provingTimes: proveTimings(),
      nextOffset: proveOffset(),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/prove") {
    let body: Record<string, unknown>;
    try {
      body = await readBody(req);
    } catch {
      send(res, 400, { error: "body must be JSON" });
      return;
    }
    const owner = String(body.owner ?? "");
    if (!/^[0-9a-fA-F]{64}$/.test(owner)) {
      send(res, 400, { error: "owner must be 64 hex chars (32 raw public-key bytes)" });
      return;
    }
    const job = enqueue(
      owner,
      typeof body.timestamp === "number" ? body.timestamp : undefined,
      typeof body.nonce === "string" ? body.nonce : undefined,
    );
    void drain();
    send(res, 202, {
      jobId: job.id,
      status: job.status,
      timestamp: job.timestamp,
      offsetSeconds: job.offsetSeconds,
      poll: `/prove/${job.id}`,
      note: "Proving takes 4-5 minutes. Submit the returned seal immediately.",
    });
    return;
  }

  const match = /^\/prove\/([0-9a-f]{16})$/.exec(url.pathname);
  if (req.method === "GET" && match) {
    const job = jobs.get(match[1]);
    if (!job) {
      send(res, 404, { error: "unknown job" });
      return;
    }
    const { log, ...rest } = job;
    send(res, 200, { ...rest, log: log ? log.slice(-1200) : undefined });
    return;
  }

  send(res, 404, { error: "not found" });
});

loadJobs();
reconcileOnStart();
server.listen(PORT, () => {
  const times = proveTimings();
  console.log(`DeathClock prover service on :${PORT}`);
  console.log(`  proving history : ${times.length ? times.join(", ") + "s" : "(none yet)"}`);
  console.log(`  next offset     : ${proveOffset()}s`);
  console.log(`  restored jobs   : ${jobs.size}`);
  console.log(`\n  POST /prove  {"owner":"<64 hex>"}`);
  console.log(`  GET  /prove/:jobId\n`);
});
