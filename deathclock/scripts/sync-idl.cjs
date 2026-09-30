// Copies the Anchor-generated IDL into the browser app so the client can never
// drift from the on-chain program. Run after `anchor build`.
const fs = require("node:fs");
const path = require("node:path");

const source = path.resolve(__dirname, "..", "target", "idl", "deathclock.json");
const target = path.resolve(__dirname, "..", "app", "src", "idl", "deathclock.generated.json");

if (!fs.existsSync(source)) {
  console.error(`Missing ${source}. Run \`anchor build\` first.`);
  process.exit(1);
}

const idl = JSON.parse(fs.readFileSync(source, "utf8"));
fs.writeFileSync(target, `${JSON.stringify(idl, null, 2)}\n`);
console.log(`Synced ${path.relative(process.cwd(), target)} from target/idl/deathclock.json`);
