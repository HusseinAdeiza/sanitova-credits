/**
 * Tests the injected-provider unwrapping, which is where the wallet connection
 * actually broke.
 *
 * Every wallet namespace its provider -- `window.phantom.solana`,
 * `window.solflare.solana`, `window.backpack.solana` -- so reading the key
 * directly yields a wrapper with no `connect`. That produced
 * "s.connect is not a function" on the site.
 *
 * This pins the shapes: wrapped (the normal case), unwrapped (some builds), and
 * a bare legacy global. Run: npx tsx scripts/check-provider-unwrap.ts
 */
type Injected = {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect(): Promise<{ publicKey: { toString(): string } }>;
};

/** Mirrors getInjected in useWallet.ts. */
function getInjected(win: Record<string, unknown>, key: string | null): Injected | null {
  const unwrap = (value: unknown): Injected | null => {
    if (!value || typeof value !== "object") return null;
    const wrapper = value as { solana?: unknown };
    const provider = (wrapper.solana ?? value) as Injected;
    return typeof provider.connect === "function" ? provider : null;
  };
  if (key) return unwrap(win[key]);
  return unwrap(win.solana);
}

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const provider = () => ({
  isPhantom: true,
  publicKey: null,
  connect: async () => ({ publicKey: { toString: () => "X" } }),
});

console.log("\nProvider unwrapping\n");

// 1. The normal shape: window.phantom.solana holds the provider.
{
  const real = provider();
  const win = { phantom: { solana: real } };
  const got = getInjected(win, "phantom");
  check("wrapped provider is unwrapped from window.phantom.solana", got === real);
}

// 2. A build that exposes the provider directly on the key.
{
  const real = provider();
  const win = { phantom: real };
  const got = getInjected(win, "phantom");
  check("unwrapped provider still works", got === real);
}

// 3. Legacy window.solana, also wrapped.
{
  const real = provider();
  const win = { solana: { solana: real } };
  const got = getInjected(win, null);
  check("legacy window.solana is unwrapped", got === real);
}

// 4. A non-wallet object that merely has a solana property.
{
  const win = { solana: { notAProvider: true } };
  check("object without connect() is rejected", getInjected(win, null) === null);
}

// 5. Nothing installed.
{
  check("missing wallet returns null", getInjected({}, "phantom") === null);
}

// 6. This is the regression that produced the reported error: the OLD code
// returned the wrapper, which has no connect method.
{
  const real = provider();
  const wrapper = { solana: real };
  const oldBehaviour = wrapper as unknown as Injected;
  const threwLikeTheSite = typeof (oldBehaviour as { connect?: unknown }).connect !== "function";
  check("old code really did yield a wrapper with no connect()", threwLikeTheSite,
    "this is what 's.connect is not a function' was");
  check("new code yields the real provider", getInjected({ phantom: wrapper }, "phantom") === real);
}

console.log(`\n${failures === 0 ? "All provider unwrapping checks passed." : `${failures} FAILED.`}\n`);
process.exitCode = failures === 0 ? 0 : 1;
