import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { Deathclock } from "../../../target/types/deathclock";

const LAMPORTS_PER_SOL = new BN(1_000_000_000);
const MOCK_PROOF = Buffer.from("DEATHCLOCK_MOCK_V1");
const INTERVAL = new BN(1);
const CHALLENGE_PERIOD = new BN(2);

describe("DeathClock", () => {
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection("http://127.0.0.1:8899", {
      commitment: "processed",
      wsEndpoint: "ws://127.0.0.1:8900",
    }),
    new anchor.Wallet(new anchor.web3.Keypair()),
  );
  anchor.setProvider(provider);

  const program = anchor.workspace.Deathclock as Program<Deathclock>;
  let owner: anchor.web3.Keypair;
  let activeProgram: Program<Deathclock>;
  let heirs: anchor.web3.Keypair[];
  let vault: anchor.web3.PublicKey;
  let vaultBump: number;
  let treasury: anchor.web3.PublicKey;
  let treasuryBump: number;

  beforeEach(async () => {
    owner = new anchor.web3.Keypair();
    heirs = [anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate()];
    const signature = await provider.connection.requestAirdrop(owner.publicKey, 20 * LAMPORTS_PER_SOL.toNumber());
    const latest = await provider.connection.getLatestBlockhash("confirmed");
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const status = await provider.connection.getSignatureStatus(signature, { searchTransactionHistory: true });
      if (status.value?.err) {
        throw new Error(`airdrop failed: ${JSON.stringify(status.value.err)}`);
      }
      if (status.value?.confirmationStatus === "confirmed" || status.value?.confirmations) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    void latest;
    [vault, vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), owner.publicKey.toBuffer()],
      program.programId,
    );
    [treasury, treasuryBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      program.programId,
    );

    const localProvider = new anchor.AnchorProvider(
      new anchor.web3.Connection("http://127.0.0.1:8899", {
        commitment: "processed",
        wsEndpoint: "ws://127.0.0.1:8900",
      }),
      new anchor.Wallet(owner),
    );
    anchor.setProvider(localProvider);
    activeProgram = new Program<Deathclock>(anchor.workspace.Deathclock.idl, localProvider);
    await activeProgram.methods
      .initializeVault(heirs.map((heir) => heir.publicKey), Buffer.from([60, 20, 20]), INTERVAL, CHALLENGE_PERIOD)
      .accounts({ owner: owner.publicKey })
      .signers([owner])
      .rpc();
  });

  function mockPublicInputs(timestamp: number, nonce = 7): Buffer {
    const inputs = Buffer.alloc(32);
    inputs.writeBigUInt64LE(BigInt(timestamp), 0);
    inputs.writeBigUInt64LE(BigInt(nonce), 8);
    return inputs;
  }

  async function currentTimestamp() {
    return Math.floor(Date.now() / 1000);
  }

  async function wait(seconds: number) {
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000 + 150));
  }

  it("initializes a 60/20/20 vault and emits its configuration", async () => {
    const state = await activeProgram.account.vault.fetch(vault);

    expect(state.owner.equals(owner.publicKey)).to.equal(true);
    expect(state.heirs.map((heir: anchor.web3.PublicKey) => heir.toBase58())).to.deep.equal(
      heirs.map((heir) => heir.publicKey.toBase58()),
    );
    expect(state.shares).to.deep.equal(Buffer.from([60, 20, 20]));
    expect(state.state.active).to.not.equal(undefined);
    expect(state.bump).to.equal(vaultBump);
  });

  it("rejects malformed heir shares", async () => {
    const owner2 = anchor.web3.Keypair.generate();
    const airdrop2 = await provider.connection.requestAirdrop(owner2.publicKey, 2 * LAMPORTS_PER_SOL.toNumber());
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const status = await provider.connection.getSignatureStatus(airdrop2, { searchTransactionHistory: true });
      if (status.value?.err) throw new Error(`airdrop failed: ${JSON.stringify(status.value.err)}`);
      if (status.value?.confirmationStatus === "confirmed" || status.value?.confirmations) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const vault2 = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), owner2.publicKey.toBuffer()],
      program.programId,
    )[0];

    try {
      await activeProgram.methods
        .initializeVault(heirs.map((heir) => heir.publicKey), Buffer.from([50, 20, 20]), INTERVAL, CHALLENGE_PERIOD)
        .accounts({ owner: owner2.publicKey })
        .signers([owner2])
        .rpc();
      expect.fail("expected invalid shares to be rejected");
    } catch (error) {
      expect(String(error)).to.match(/Shares must sum to 100|shares/i);
    }
  });

  it("runs the full inheritance lifecycle and distributes every lamport", async () => {
    const deposit = LAMPORTS_PER_SOL.muln(10);

    await activeProgram.methods
      .deposit(deposit)
      .accounts({ owner: owner.publicKey, vault } as any)
      .rpc();

    const timestamp = await currentTimestamp();
    await activeProgram.methods
      .heartbeat(MOCK_PROOF, Array.from(mockPublicInputs(timestamp)))
      .accounts({ owner: owner.publicKey })
      .rpc();

    await wait(2);
    await activeProgram.methods
      .reportDeath()
      .accounts({ vault })
      .rpc();
    await activeProgram.methods
      .initiateChallenge()
      .accounts({ vault })
      .rpc();
    await wait(3);
    await activeProgram.methods
      .resolveChallenge(false)
      .accounts({ vault })
      .rpc();

    const vaultBalance = new BN(await provider.connection.getBalance(vault));
    const treasuryBefore = await provider.connection.getBalance(treasury);
    const heirsBefore = await Promise.all(heirs.map((heir) => provider.connection.getBalance(heir.publicKey)));

    await activeProgram.methods
      .releaseInheritance(treasuryBump)
      .accounts({
        vault,
        treasury,
      } as any)
      .remainingAccounts(
        heirs.map((heir) => ({
          pubkey: heir.publicKey,
          isSigner: false,
          isWritable: true,
        })),
      )
      .rpc();

    const rentReserve = await provider.connection.getMinimumBalanceForRentExemption(8 + 300);
    const distributableVaultBalance = vaultBalance.sub(new BN(rentReserve));
    const expectedFee = distributableVaultBalance.mul(new BN(5)).div(new BN(1000));
    const distributable = distributableVaultBalance.sub(expectedFee);
    expect(await provider.connection.getBalance(treasury)).to.equal(treasuryBefore + expectedFee.toNumber());
    expect(await provider.connection.getBalance(vault)).to.equal(rentReserve);

    for (let index = 0; index < heirs.length; index += 1) {
      const share = Buffer.from([60, 20, 20])[index];
      let expected = distributable.mul(new BN(share)).div(new BN(100));
      if (index === heirs.length - 1) {
        expected = distributable.sub(distributable.mul(new BN(80)).div(new BN(100)));
      }
      expect(await provider.connection.getBalance(heirs[index].publicKey)).to.equal(heirsBefore[index] + expected.toNumber());
    }

    const released = await activeProgram.account.vault.fetch(vault);
    expect(released.state.released).to.not.equal(undefined);
  });

  it("rejects an invalid heartbeat proof", async () => {
    try {
      await activeProgram.methods
        .heartbeat(Buffer.from("not-a-proof"), Array.from(mockPublicInputs(await currentTimestamp())))
        .accounts({ owner: owner.publicKey })
        .rpc();
      expect.fail("expected invalid proof to be rejected");
    } catch (error) {
      expect(String(error)).to.include("Invalid ZK proof");
    }
  });

  it("allows owner emergency recovery after a false report", async () => {
    await wait(2);
    await activeProgram.methods
      .reportDeath()
      .accounts({ vault })
      .rpc();
    await activeProgram.methods
      .emergencyRecover()
      .accounts({ owner: owner.publicKey })
      .rpc();

    const recovered = await activeProgram.account.vault.fetch(vault);
    expect(recovered.state.active).to.not.equal(undefined);
    expect(recovered.lastHeartbeat.toNumber()).to.be.greaterThan(0);
  });

  it("rejects release before the challenge period expires", async () => {
    await wait(2);
    await activeProgram.methods.reportDeath().accounts({ vault }).rpc();
    await activeProgram.methods.initiateChallenge().accounts({ vault }).rpc();

    try {
      await activeProgram.methods
        .resolveChallenge(false)
        .accounts({ vault })
        .rpc();
      expect.fail("expected an active challenge to reject resolution");
    } catch (error) {
      expect(String(error)).to.include("Challenge period not expired");
    }
  });
});
