"use client";

import { useEffect, useState } from "react";

export function usePhantom() {
  const [provider, setProvider] = useState<any>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    const injected = (window as any).solana;
    if (!injected) return;
    setProvider(injected);
    if (injected.isConnected) setPublicKey(injected.publicKey?.toString() || null);
    const onAccount = () => setPublicKey(injected.publicKey?.toString() || null);
    injected.on?.("accountChanged", onAccount);
    return () => injected.off?.("accountChanged", onAccount);
  }, []);

  async function connect() {
    if (!provider) throw new Error("Phantom was not found in this browser.");
    const response = await provider.connect();
    setPublicKey(response.publicKey.toString());
    return response.publicKey;
  }

  async function disconnect() {
    if (provider?.disconnect) await provider.disconnect();
    setPublicKey(null);
  }

  return { provider, publicKey, connected: Boolean(publicKey), connect, disconnect };
}
