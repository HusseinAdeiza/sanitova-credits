/**
 * Confirms a deployed program's on-chain state from the loader accounts.
 *
 * `solana program show` can exit 0 with no output, and the web3.js Connection
 * can hit transport failures on this host, so this reads the two accounts
 * directly and parses the documented byte layouts:
 *
 *   Program account : tag(2, little-endian enum) then the ProgramData address
 *   ProgramData     : 4-byte enum | u64 last_deployed_slot | 1-byte tag |
 *                     32-byte upgrade authority
 *
 * Usage: npx tsx scripts/verify-deploy.ts <programId>
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { ensureRpcTransport } from "./rpc-transport";

const programId = new PublicKey(process.argv[2] || "C8unxtjoDZWy2GmwHUPuSve1BHT5TtRKpNaDofbMS5Vh");
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

/** LoaderV3 stores the ProgramData address at byte 2 of the program account. */
function readProgramDataAddress(programBytes: Buffer): PublicKey {
  const tag = programBytes.readUInt32LE(0);
  if (tag !== 2) {
    throw new Error(`expected program account tag 2 (Program), got ${tag}`);
  }
  return new PublicKey(programBytes.subarray(4, 36));
}

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(bytes: Buffer): string {
  let value = BigInt("0x" + bytes.toString("hex"));
  let out = "";
  while (value > 0n) {
    out = ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }
  const leadingZeros = bytes.subarray(0, bytes.indexOf(bytes[0]) === 0 ? undefined : 0).length;
  for (let i = 0; i < bytes.length && bytes[i] === 0; i += 1) out = "1" + out;
  return out || "1";
}

async function main() {
  // This host's global fetch cannot reach devnet; swap in the node:https shim.
  await ensureRpcTransport("https://api.devnet.solana.com");

  const info = await connection.getAccountInfo(programId);
  if (!info) throw new Error("program account not found");

  const data = Buffer.from(info.data);
  const programDataAddress = readProgramDataAddress(data);
  const dataInfo = await connection.getAccountInfo(programDataAddress);
  if (!dataInfo) throw new Error("ProgramData account not found");

  const pd = Buffer.from(dataInfo.data);
  const lastDeployedSlot = Number(pd.readBigUInt64LE(4));
  const tag = pd.readUInt8(12);
  const authority = base58(pd.subarray(13, 45));

  console.log(`\nProgram            ${programId.toBase58()}`);
  console.log(`  executable       ${info.executable}`);
  console.log(`  owner            ${info.owner.toBase58()}`);
  console.log(`ProgramData        ${programDataAddress.toBase58()}`);
  console.log(`  last_deployed_slot  ${lastDeployedSlot}`);
  console.log(`  tag                 ${tag}`);
  console.log(`  upgrade authority   ${authority}`);
  console.log(`  size                ${dataInfo.data.length} bytes\n`);
}

main().catch((error) => {
  console.error("failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
