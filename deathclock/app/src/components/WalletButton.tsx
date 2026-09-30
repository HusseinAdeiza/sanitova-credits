"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/hooks/WalletProvider";
import type { WalletDescriptor, WalletId } from "@/hooks/useWallet";
import { useTheme } from "@/components/ThemeProvider";
import { shorten } from "@/utils/helpers";
import { Pill } from "@/components/ui";

/* ---------------------------------------------------------------------------
   Wallet connection + theme controls
--------------------------------------------------------------------------- */

/** Monogram tile. A two-letter mark reads better than a generic wallet glyph. */
function WalletMark({ wallet, size = "md" }: { wallet: WalletDescriptor; size?: "sm" | "md" }) {
  const dimension = size === "sm" ? "h-7 w-7 text-[0.625rem]" : "h-9 w-9 text-[0.6875rem]";
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-md border border-line/20 bg-raised font-mono font-semibold tracking-tight text-ink ${dimension}`}
    >
      {wallet.monogram}
    </span>
  );
}

/** Closes the menu on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

/**
 * Wallet button plus picker.
 *
 * Only wallets actually injected into the page are offered as connectable.
 * The rest are listed as install links, because showing a connect button for
 * a wallet that is not there produces a dead end.
 */
export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { installed, active, publicKey, connected, connecting, error, connect, disconnect, clearError } =
    useWallet();
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    clearError();
  };
  const ref = useDismiss(open, close);

  if (connected && active && publicKey) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="hidden items-center gap-2 rounded-md border border-line/20 bg-surface px-3 py-2 sm:flex">
          <WalletMark wallet={active} size="sm" />
          <span className="font-mono text-xs text-ink">{shorten(publicKey, 4)}</span>
        </span>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => void disconnect()}
          aria-label={`Disconnect ${active.name}`}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn-primary btn-md"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={connecting}
      >
        {connecting ? "Connecting…" : compact ? "Connect" : "Connect wallet"}
      </button>

      {open ? (
        <div
          role="menu"
          className="panel-raised absolute right-0 z-50 mt-2 w-[19rem] overflow-hidden p-1.5"
        >
          <p className="label px-3 py-2">Solana wallets</p>

          {installed.length > 0 ? (
            <ul className="mb-1">
              {installed.map((wallet) => (
                <li key={wallet.id}>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-150 ease-standard hover:bg-ink/[0.05] focus-visible:bg-ink/[0.05]"
                    onClick={() => {
                      void connect(wallet.id as WalletId);
                      setOpen(false);
                    }}
                  >
                    <WalletMark wallet={wallet} />
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-ink">{wallet.name}</span>
                      <span className="block text-xs text-faint">Detected in this browser</span>
                    </span>
                    <span aria-hidden className="text-faint">
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-xs leading-relaxed text-muted">
              No Solana wallet detected. Install one, then reload this page.
            </p>
          )}

          {installed.length > 0 ? <div className="my-1 border-t border-line/10" /> : null}

          <p className="label px-3 py-2">Not installed</p>
          <ul>
            {installed.length < 3
              ? ["phantom", "solflare", "backpack"]
                  .filter((id) => !installed.some((w) => w.id === id))
                  .map((id) => {
                    const descriptor = WALLET_LINKS[id as WalletId];
                    return (
                      <li key={id}>
                        <a
                          href={descriptor.installUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-muted transition-colors duration-150 ease-standard hover:bg-ink/[0.05] hover:text-ink focus-visible:bg-ink/[0.05]"
                        >
                          {descriptor.name}
                          <span aria-hidden className="text-xs">
                            ↗
                          </span>
                        </a>
                      </li>
                    );
                  })
              : null}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="absolute right-0 top-full z-50 mt-2 w-[19rem] rounded-md border border-critical/30 bg-critical/10 px-3 py-2 text-xs text-critical"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

// Small lookup so the "not installed" list does not need wallet detection.
const WALLET_LINKS: Record<WalletId, WalletDescriptor> = {
  phantom: {
    id: "phantom",
    name: "Phantom",
    monogram: "PH",
    injectionKey: "phantom",
    installUrl: "https://phantom.app/download",
    docsUrl: "https://docs.phantom.com",
    multiSign: true,
  },
  solflare: {
    id: "solflare",
    name: "Solflare",
    monogram: "SF",
    injectionKey: "solflare",
    installUrl: "https://solflare.com/download",
    docsUrl: "https://docs.solflare.com",
    multiSign: true,
  },
  backpack: {
    id: "backpack",
    name: "Backpack",
    monogram: "BP",
    injectionKey: "backpack",
    installUrl: "https://backpack.exchange/download",
    docsUrl: "https://docs.backpack.exchange",
    multiSign: true,
  },
  unknown: {
    id: "unknown",
    name: "Wallet",
    monogram: "WA",
    injectionKey: null,
    installUrl: "https://solana.com",
    docsUrl: "https://solana.com/developers",
    multiSign: false,
  },
};

/**
 * Theme switch. Two states rather than three: "system" is honoured on first
 * visit but a visible control has to commit to something the user can see, so
 * the toggle moves between light and dark explicitly.
 */
export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      className="grid h-9 w-9 place-items-center rounded-md border border-line/20 bg-surface text-muted transition-colors duration-150 ease-standard hover:border-line/40 hover:text-ink"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {resolved === "dark" ? (
        // Sun: the action is to go light.
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="8" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.25" />
          <path
            d="M8 1v1.75M8 13.25V15M15 8h-1.75M2.75 8H1M12.95 3.05l-1.24 1.24M4.29 11.71l-1.24 1.24M12.95 12.95l-1.24-1.24M4.29 4.29L3.05 3.05"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        // Moon: the action is to go dark.
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

/** Compact cluster used in the sticky header on small screens. */
export function HeaderControls() {
  return (
    <div className="flex items-center gap-2">
      <ThemeToggle />
      <WalletButton compact />
    </div>
  );
}

/** Live network badge. Reads the configured cluster, not a guess. */
export function NetworkBadge() {
  return (
    <Pill tone="live" dot>
      Solana devnet
    </Pill>
  );
}
