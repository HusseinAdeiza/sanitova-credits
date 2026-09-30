// Localnet end-to-end check: submits a real RISC Zero Groth16 receipt on-chain
// so verifier_router dispatches to groth_16_verifier and the BN254 pairing
// check actually runs. This is the only test that proves the receipt is
// *verified*, not merely well-formed.
//
// The owner is read from a fixed keypair file (written by
// scripts/localnet-e2e.sh) because the seal must be proven for that exact
// owner, and the program checks the journal against the live cluster clock
// within a [now-300, now+60] window, so the proof cannot be pre-generated.
//
// Run with: npx ts-mocha -p ./tsconfig.json -t 1000000 \
//   programs/deathclock/tests/localnet-e2e.ts
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Deathclock } from "../../../target/types/deathclock";

import {
  ROUTER_PROGRAM,
  GROTH16_VERIFIER_PROGRAM,
  SELECTOR,
} from "../../../scripts/program-ids";

const OWNER_KEYPAIR = "target/localnet-e2e-owner.json";
const WORK_DIR = "target/risc0-work";

type Seal = {
  selector: string;
  piA: string;
  piB: string;
  piC: string;
  journal: string;
  imageId: string;
};

const fromHex = (hex: string) => Array.from(Buffer.from(hex, "hex"));

const routerState = PublicKey.findProgramAddressSync(
  [Buffer.from("router")],
  ROUTER_PROGRAM,
)[0];
const verifierEntry = PublicKey.findProgramAddressSync(
  [Buffer.from("verifier"), Buffer.from(SELECTOR)],
  ROUTER_PROGRAM,
)[0];

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

describe("DeathClock localnet E2E (real RISC Zero receipt)", () => {
  // Points at the VPS validator through an SSH tunnel:
  //   ssh -L 8899:127.0.0.1:8899 root@161.97.139.15
  const connection = new Connection(
    process.env.DEATHCLOCK_RPC ?? "http://127.0.0.1:8899",
    "confirmed",
  );

  let owner: Keypair;
  let heirs: Keypair[];
  let vault: PublicKey;
  let program: Program<Deathclock>;
  let seal: Seal;

  before(async function () {
    if (!existsSync(OWNER_KEYPAIR) || !existsSync(`${WORK_DIR}/seal.json`)) {
      this.skip?.();
      throw new Error(
        `missing ${OWNER_KEYPAIR} or ${WORK_DIR}/seal.json; run scripts/localnet-e2e.sh`,
      );
    }

    owner = loadKeypair(OWNER_KEYPAIR);
    heirs = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
    seal = JSON.parse(readFileSync(`${WORK_DIR}/seal.json`, "utf8")) as Seal;

    const signature = await connection.requestAirdrop(owner.publicKey, 20 * 1_000_000_000);
    const blockhash = await connection.getLatestBlockhash("confirmed");
    await connection.confirmTransaction({ signature, ...blockhash }, "confirmed");

    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(owner), {
      commitment: "confirmed",
    });
    anchor.setProvider(provider);
    program = anchor.workspace.Deathclock as Program<Deathclock>;

    [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), owner.publicKey.toBuffer()],
      program.programId,
    );
  });

  it("opens and funds the vault before the proof is used", async () => {
    // Done in `before` rather than inline with the heartbeat: the program only
    // accepts a receipt within PROOF_MAX_AGE_SECONDS (300s) of its timestamp,
    // and proving plus the Groth16 wrap already consume most of that budget.
    await program.methods
      .initializeVault(
        heirs.map((h) => h.publicKey),
        Buffer.from([60, 20, 20]),
        new BN(1),
        new BN(2),
      )
      .accounts({ owner: owner.publicKey })
      .rpc();

    await program.methods
      .deposit(new BN(10_000_000_000))
      .accounts({ owner: owner.publicKey, vault } as any)
      .rpc();
  });

  it("accepts a journal whose commitment is self-consistent", () => {
    // The guest commits SHA-256(owner || timestamp_le || nonce) followed by
    // the timestamp and nonce, so recomputing the first 32 bytes over the last
    // 32 must match. This is the program's own check, mirrored here so a
    // malformed artifact fails with a useful message rather than a revert.
    const journal = Buffer.from(seal.journal, "hex");
    const body = Buffer.concat([Buffer.from(owner.publicKey.toBytes()), journal.subarray(32)]);
    const expected = createHash("sha256").update(body).digest("hex");
    expect(expected, "journal commitment must match owner||timestamp||nonce").to.equal(
      journal.subarray(0, 32).toString("hex"),
    );
  });

  it("submits the receipt and the router verifies it on-chain", async () => {
    const journal = Buffer.from(seal.journal, "hex");

    // The assertion that matters: this succeeds only if verifier_router
    // routes to groth_16_verifier and the BN254 pairing check passes against
    // the pinned image ID and the journal digest.
    const signature = await program.methods
      .heartbeat(
        {
          selector: fromHex(seal.selector),
          proof: {
            piA: fromHex(seal.piA),
            piB: fromHex(seal.piB),
            piC: fromHex(seal.piC),
          },
        },
        journal,
      )
      .accounts({
        owner: owner.publicKey,
        router: ROUTER_PROGRAM,
        routerState,
        verifierEntry,
        verifierProgram: GROTH16_VERIFIER_PROGRAM,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();

    const state = await program.account.vault.fetch(vault);
    expect(state.state.active, "vault should be Active after a verified heartbeat").to.not.equal(
      undefined,
    );
    expect(Number(state.lastHeartbeat)).to.be.greaterThan(0);
    console.log("verified heartbeat in tx", signature);
  });

  it("rejects the same proof once the journal is tampered with", async () => {
    const journal = Buffer.from(seal.journal, "hex");
    const tampered = Buffer.from(journal);
    tampered[32] ^= 0xff; // flip a timestamp byte, breaking the commitment

    try {
      await program.methods
        .heartbeat(
          {
            selector: fromHex(seal.selector),
            proof: {
              piA: fromHex(seal.piA),
              piB: fromHex(seal.piB),
              piC: fromHex(seal.piC),
            },
          },
          tampered,
        )
        .accounts({
          owner: owner.publicKey,
          router: ROUTER_PROGRAM,
          routerState,
          verifierEntry,
          verifierProgram: GROTH16_VERIFIER_PROGRAM,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();
      expect.fail("a tampered journal must be rejected");
    } catch (error) {
      expect(String(error)).to.match(/InvalidProof|custom program error|failed/i);
    }
  });
});
