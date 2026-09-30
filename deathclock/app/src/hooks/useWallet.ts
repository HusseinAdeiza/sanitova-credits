"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Multi-wallet support.
 *
 * Solana wallets all inject into `window` under different keys and follow the
 * same EIP-1193-ish shape, so they are detected rather than integrated one by
 * one. The wallet-adapter packages are not used here: the app only needs
 * `connect`, `disconnect`, `signTransaction`, `signAllTransactions` and
 * `publicKey`, and every injected provider exposes exactly those. That keeps
 * the bundle small and avoids a provider-wrapping layer for four calls.
 *
 * `window.solana` is intentionally kept as a Phantom fallback: some builds of
 * other wallets also define it, and it is the historical key.
 */

export type WalletId = "phantom" | "solflare" | "backpack" | "unknown";

export type WalletDescriptor = {
  id: WalletId;
  name: string;
  /** Two-letter monogram used in the picker, so no icon assets are needed. */
  monogram: string;
  /** Injection key, or null for the legacy Phantom global. */
  injectionKey: string | null;
  installUrl: string;
  docsUrl: string;
  /** True when the wallet is known to support signAllTransactions. */
  multiSign: boolean;
};

/**
 * The wallet catalogue, in the order they are offered. `unknown` is a runtime
 * fallback for an unrecognised injected provider and is not listed here.
 */
export const WALLETS: readonly WalletDescriptor[] = [
  {
    id: "phantom",
    name: "Phantom",
    monogram: "PH",
    injectionKey: "phantom",
    installUrl: "https://phantom.app/download",
    docsUrl: "https://docs.phantom.com",
    multiSign: true,
  },
  {
    id: "solflare",
    name: "Solflare",
    monogram: "SF",
    injectionKey: "solflare",
    installUrl: "https://solflare.com/download",
    docsUrl: "https://docs.solflare.com",
    multiSign: true,
  },
  {
    id: "backpack",
    name: "Backpack",
    monogram: "BP",
    injectionKey: "backpack",
    installUrl: "https://backpack.exchange/download",
    docsUrl: "https://docs.backpack.exchange",
    multiSign: true,
  },
] as const;

type Injected = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  /** Set by a wallet that already holds an authorised session on page load. */
  isConnected?: boolean;
  publicKey?: { toString(): string } | null;
  connect(): Promise<{ publicKey: { toString(): string } }>;
  disconnect?(): Promise<void>;
  signTransaction?<T>(tx: T): Promise<T>;
  signAllTransactions?<T>(txs: T[]): Promise<T[]>;
  on?(event: string, handler: () => void): void;
  off?(event: string, handler: () => void): void;
};

function getInjected(key: string | null): Injected | null {
  if (typeof window === "undefined") return null;
  if (key) {
    const found = (window as unknown as Record<string, unknown>)[key];
    return found ? (found as Injected) : null;
  }
  // Legacy Phantom global.
  const legacy = (window as unknown as Record<string, unknown>).solana;
  return legacy ? (legacy as Injected) : null;
}

function detect(): { id: WalletId; provider: Injected } | null {
  if (typeof window === "undefined") return null;

  for (const wallet of WALLETS) {
    const provider = getInjected(wallet.injectionKey);
    if (provider) return { id: wallet.id, provider };
  }

  // Phantom on older builds only sets window.solana.
  const legacy = getInjected(null);
  if (legacy?.isPhantom) return { id: "phantom", provider: legacy };
  if (legacy) return { id: "unknown", provider: legacy };

  return null;
}

export type WalletState = {
  /** Wallets actually detected in this browser. */
  installed: WalletDescriptor[];
  /** The wallet currently connected, if any. */
  active: WalletDescriptor | null;
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  connect: (id: WalletId) => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
};

export function useWallet(): WalletState & { signer: WalletAdapter | null } {
  const [installed, setInstalled] = useState<WalletDescriptor[]>([]);
  const [activeId, setActiveId] = useState<WalletId | null>(null);
  const [provider, setProvider] = useState<Injected | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect once on mount. Wallets inject on page load, so there is nothing to
  // poll for; the list is refreshed if the user installs one and reloads.
  useEffect(() => {
    const found = detect();
    if (!found) {
      setInstalled([]);
      return;
    }
    const descriptor =
      WALLETS.find((w) => w.id === found.id) ??
      ({
        id: "unknown",
        name: "Detected wallet",
        monogram: "DW",
        injectionKey: null,
        installUrl: "https://solana.com",
        docsUrl: "https://solana.com/developers",
        multiSign: Boolean(found.provider.signAllTransactions),
      } satisfies WalletDescriptor);

    setInstalled([descriptor]);
    setProvider(found.provider);

    if (found.provider.isConnected && found.provider.publicKey) {
      setActiveId(descriptor.id);
      setPublicKey(found.provider.publicKey.toString());
    }
  }, []);

  // Track account switches in the active provider, including across a wallet
  // change, so the UI never shows a stale address.
  useEffect(() => {
    if (!provider) return;
    const onAccount = () => setPublicKey(provider.publicKey?.toString() ?? null);
    provider.on?.("accountChanged", onAccount);
    return () => provider.off?.("accountChanged", onAccount);
  }, [provider]);

  const connect = useCallback(
    async (id: WalletId) => {
      setError(null);
      const descriptor = installed.find((w) => w.id === id);
      if (!descriptor) {
        setError("That wallet is not installed in this browser.");
        return;
      }
      const target = getInjected(descriptor.injectionKey);
      if (!target) {
        setError(
          `${descriptor.name} was not detected. Reload the page after installing it.`,
        );
        return;
      }

      setConnecting(true);
      try {
        const response = await target.connect();
        setProvider(target);
        setActiveId(descriptor.id);
        setPublicKey(response.publicKey.toString());
      } catch (cause) {
        // A user declining the wallet prompt is not an error worth shouting
        // about, so it is reported plainly and not styled as a failure.
        const message =
          cause instanceof Error ? cause.message : "The wallet refused the connection.";
        setError(
          /reject|declin|cancel/i.test(message)
            ? "Connection cancelled."
            : message,
        );
      } finally {
        setConnecting(false);
      }
    },
    [installed],
  );

  const disconnect = useCallback(async () => {
    try {
      await provider?.disconnect?.();
    } catch {
      // A wallet that cannot disconnect cleanly should still be cleared
      // locally, otherwise the UI is stuck showing an address we no longer
      // control.
    }
    setPublicKey(null);
    setActiveId(null);
  }, [provider]);

  const active = useMemo(
    () => installed.find((w) => w.id === activeId) ?? null,
    [installed, activeId],
  );

  /**
   * The signing surface `useVault` needs. Rebuilt only when the provider or
   * address changes, so a new AnchorProvider is not constructed on every
   * render.
   *
   * `signAllTransactions` is mandatory for Anchor even when a call sends one
   * transaction, so a wallet that omits it is wrapped to sign sequentially —
   * a silent partial batch would be far worse than a slightly slower one.
   */
  const signer = useMemo<WalletAdapter | null>(() => {
    if (!provider || !publicKey) return null;

    const signTransaction = async <T,>(tx: T): Promise<T> => {
      if (!provider.signTransaction) {
        throw new Error("This wallet cannot sign transactions.");
      }
      return provider.signTransaction(tx);
    };

    const signAllTransactions = async <T,>(txs: T[]): Promise<T[]> => {
      if (provider.signAllTransactions) return provider.signAllTransactions(txs);
      const signed: T[] = [];
      for (const tx of txs) signed.push(await signTransaction(tx));
      return signed;
    };

    return { publicKey, signTransaction, signAllTransactions };
  }, [provider, publicKey]);

  return {
    installed,
    active,
    publicKey,
    connected: Boolean(publicKey),
    connecting,
    error,
    connect,
    disconnect,
    clearError: () => setError(null),
    signer,
  };
}

/**
 * Adapter shape expected by `useVault`. Kept here so the wallet hook is the
 * only place that knows about injected-provider internals.
 */
export type WalletAdapter = {
  publicKey: string | null;
  signTransaction: <T>(tx: T) => Promise<T>;
  signAllTransactions: <T>(txs: T[]) => Promise<T[]>;
};
