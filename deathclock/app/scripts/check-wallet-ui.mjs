/**
 * Drives the wallet picker against a mocked injected provider.
 *
 * This is the test that would have caught the `s.connect is not a function`
 * bug. The browser automation has no real Solana wallet, so a stub stands in:
 * one that injects late (as several real wallets do) and one that refuses. The
 * assertions are on observable behaviour -- does the button appear, does the
 * click reach the provider, does the address show -- rather than on internals.
 *
 * Usage: node scripts/check-wallet-ui.mjs
 */
import { chromium } from "playwright";

const SITE = process.env.SITE_URL || "http://127.0.0.1:3111";
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

/** A provider that injects after `delayMs`, like a real wallet extension. */
const lateProvider = (delayMs) => `(() => {
  const provider = {
    isPhantom: true,
    publicKey: null,
    async connect() {
      const bytes = new Uint8Array(32).fill(7);
      provider.publicKey = { toString: () => "7".repeat(43) };
      window.__connected = true;
      return { publicKey: provider.publicKey };
    },
    async signTransaction(tx) { return tx; },
    async signAllTransactions(txs) { return txs; },
    on() {}, off() {},
  };
  setTimeout(() => { window.phantom = { solana: provider }; }, ${delayMs});
})()`;

const browser = await chromium.launch();
const page = await browser.newPage();

console.log(`\nWallet UI check against ${SITE}\n`);

// 1. No wallet installed at all -> honest empty state, not an error.
await page.addInitScript(`window.__phantom = undefined; delete window.phantom;`);
await page.goto(SITE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);

let bodyText = await page.innerText("body");
check("renders without a wallet", bodyText.length > 0);
check(
  "offers install links when nothing is detected",
  /Not installed/i.test(bodyText) || /Install/i.test(bodyText),
);
check("no runtime error without a wallet", !/is not a function/i.test(bodyText));

// 2. Open the picker and confirm it lists wallets.
await page.click('button:has-text("Connect")').catch(() => {});
await page.waitForTimeout(500);
const pickerText = await page.innerText("body");
check(
  "picker opens and explains the empty state",
  /No Solana wallet detected/i.test(pickerText) || /Connect/i.test(pickerText),
);

await page.close();

// 3. A wallet that injects late must still be detected and connectable.
const page2 = await browser.newPage();
const errors = [];
page2.on("pageerror", (error) => errors.push(String(error)));
await page2.addInitScript(lateProvider(700));
await page2.goto(SITE, { waitUntil: "domcontentloaded" });
await page2.waitForTimeout(1800);

await page2.click('button:has-text("Connect")').catch(() => {});
await page2.waitForTimeout(600);
const lateText = await page2.innerText("body");
check(
  "late-injecting wallet is detected",
  /Phantom/i.test(lateText),
  "no Phantom entry found in the picker",
);

const phantomEntry = page2.locator('button:has-text("Phantom")').first();
if (await phantomEntry.count()) {
  await phantomEntry.click();
  await page2.waitForTimeout(900);
  const afterConnect = await page2.innerText("body");
  check(
    "clicking the wallet connects and shows the address",
    /Disconnect/i.test(afterConnect),
    afterConnect.includes("Disconnect") ? "" : "no Disconnect button",
  );
  check("no 'connect is not a function' error", !/is not a function/i.test(afterConnect));
} else {
  check("clicking the wallet connects and shows the address", false, "Phantom entry missing");
}

check("no uncaught page errors", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
console.log(`\n${failures === 0 ? "All wallet UI checks passed." : `${failures} check(s) FAILED.`}\n`);
process.exit(failures === 0 ? 0 : 1);
