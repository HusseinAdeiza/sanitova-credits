"use client";

import { createContext, useContext } from "react";
import { useWalletState, type WalletState, type WalletAdapter } from "./useWallet";

/**
 * Shared wallet state.
 *
 * `useWalletState` is a plain hook holding `useState`, so calling it from two
 * components produced two independent copies of the connection. The header
 * button connected a provider the app never saw: `connected` stayed false, the
 * app offered a "reconnect" path, and clicking it invoked a `connect` that was
 * no longer wired to anything. That surfaced in the browser as
 * `s.connect is not a function`, where `s` was the minified hook instance --
 * an unhelpful message for what is really a shared-state problem.
 *
 * One provider at the root, one state everywhere after that. This file is .tsx
 * because the provider returns JSX.
 */
type WalletContextValue = WalletState & { signer: WalletAdapter | null };

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const value = useWalletState();
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

/**
 * Reads the shared wallet state.
 *
 * Throws when no provider is mounted instead of returning a fallback. A silent
 * default would let a component read a detached copy of the state and appear
 * connected while the rest of the UI is not -- which is the bug this file
 * exists to prevent, so failing loudly is the correct behaviour here.
 */
export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (!value) {
    throw new Error("useWallet must be used inside <WalletProvider>.");
  }
  return value;
}
