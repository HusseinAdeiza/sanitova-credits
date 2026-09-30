/**
 * Makes global `fetch` work against public Solana RPC endpoints on this host.
 *
 * web3.js 1.99 uses global `fetch` for its transport, and that fails against
 * `api.devnet.solana.com` here with `TypeError: fetch failed` -- even though
 * `node:https` reaches the same endpoint and returns 200. The failure is in
 * the undici stack behind `fetch`, not in the network or the endpoint.
 *
 * Rather than work around it per script, probe once and swap in a `node:https`
 * implementation of the small subset of the fetch API web3.js actually uses:
 * POST/GET, a JSON body, and reading back `ok` / `status` / `text()` / `json()`.
 *
 * Import for side effects before constructing a Connection:
 *
 *   import "./rpc-transport";
 *   const connection = new Connection(rpcUrl, "confirmed");
 */
import https from "node:https";

type FetchResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
};

/** True when the environment's `fetch` can actually reach the endpoint. */
async function probe(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth", params: [] }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function fetchViaHttps(input: unknown, init: Record<string, unknown> = {}) {
  // marker for diagnostics: scripts check for this string to confirm the shim is live
  const href = typeof input === "string" ? input : (input as { url: string }).url;
  const url = new URL(href);
  const rawBody = init.body;
  const body =
    typeof rawBody === "string" ? rawBody : rawBody ? JSON.stringify(rawBody) : undefined;

  return new Promise<FetchResponse>((resolve, reject) => {
    const request = https.request(
      {
        method: (init.method as string) || "GET",
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        headers: { "Content-Type": "application/json", ...((init.headers as object) || {}) },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = response.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            text: async () => text,
            json: async () => JSON.parse(text),
          });
        });
      },
    );
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

/**
 * Ensures a working transport for the given RPC endpoint.
 *
 * Safe to call more than once, and a no-op when `fetch` already works (which
 * is the case on the local validator and on most Linux hosts).
 */
export async function ensureRpcTransport(rpcUrl: string): Promise<boolean> {
  if (typeof globalThis.fetch !== "function") {
    globalThis.fetch = fetchViaHttps as unknown as typeof fetch;
    return false;
  }

  // Do not trust a probe. On this host `fetch` against api.devnet.solana.com
  // fails *intermittently*: it passes a health check and then drops the
  // connection on the next real call, which surfaced as a heartbeat proof
  // being generated and then discarded at submission time. Probing cannot
  // distinguish "works" from "worked once".
  //
  // node:https has been reliable here for every call, so on Windows the shim
  // is installed unconditionally. Elsewhere the probe still decides, so Linux
  // and CI keep the native transport.
  if (process.platform === "win32") {
    globalThis.fetch = fetchViaHttps as unknown as typeof fetch;
    return false;
  }

  if (await probe(rpcUrl)) return true;
  globalThis.fetch = fetchViaHttps as unknown as typeof fetch;
  return false;
}

/**
 * Whether the node:https shim is currently installed as global fetch.
 *
 * Do not detect this by function name: the shim is an arrow function assigned
 * to a property, so `fetch.name` is empty and a name check reports "not
 * installed" while the shim is in fact serving every request. The marker
 * string below is only present in the shim's source.
 */
export function isRpcShimInstalled(): boolean {
  return typeof globalThis.fetch === "function" && globalThis.fetch.toString().includes("marker for diagnostics");
}
