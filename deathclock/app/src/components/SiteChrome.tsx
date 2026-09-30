"use client";

import { useEffect, useState } from "react";
import { Container } from "@/components/ui";
import { HeaderControls, NetworkBadge } from "@/components/WalletButton";

const NAV = [
  { href: "#protocol", label: "Protocol" },
  { href: "#proof", label: "Proof" },
  { href: "#heirs", label: "Heirs" },
  { href: "#states", label: "States" },
  { href: "#vault", label: "Vault" },
] as const;

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-colors duration-200 ease-standard ${
        scrolled
          ? "border-line/12 bg-canvas/85 backdrop-blur-md"
          : "border-transparent bg-canvas"
      }`}
    >
      <Container>
        <div className="flex h-16 items-center justify-between gap-6">
          <a href="#top" className="flex items-center gap-2.5" aria-label="DeathClock home">
            <span
              aria-hidden
              className="grid h-7 w-7 place-items-center rounded-sm bg-ink font-display text-sm font-bold leading-none text-canvas"
            >
              D
            </span>
            <span className="font-display text-base font-semibold tracking-tight text-ink">
              DeathClock
            </span>
          </a>

          <nav aria-label="Sections" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="rounded-md px-3 py-2 text-sm text-muted transition-colors duration-150 ease-standard hover:bg-ink/[0.05] hover:text-ink"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden xl:block">
              <NetworkBadge />
            </span>
            <HeaderControls />
          </div>
        </div>
      </Container>
    </header>
  );
}

export function SiteFooter() {
  const columns = [
    {
      title: "Protocol",
      links: [
        { label: "How release works", href: "#states" },
        { label: "Proof pipeline", href: "#proof" },
        { label: "Beneficiary shares", href: "#heirs" },
        { label: "Live vault", href: "#vault" },
      ],
    },
    {
      title: "Build on it",
      links: [
        { label: "Program ID (devnet)", href: "https://explorer.solana.com/address/C8unxtjoDZWy2GmwHUPuSve1BHT5TtRKpNaDofbMS5Vh?cluster=devnet", external: true },
        { label: "Verifier router", href: "https://explorer.solana.com/address/5n8zx79RUHafwSSB4vRU5ao9atHzJQHTdJR9ty8YrVte?cluster=devnet", external: true },
        { label: "Groth16 verifier", href: "https://explorer.solana.com/address/2iPoTWMXWJ6inLnBeGEZyiKkwEzaQvCX24Cp82UcWm8K?cluster=devnet", external: true },
        { label: "Repository", href: "#", external: false },
      ],
    },
    {
      title: "Documents",
      links: [
        { label: "Architecture", href: "#protocol" },
        { label: "State machine", href: "#states" },
        { label: "Post-mortem", href: "#", external: false },
        { label: "Deployment", href: "#", external: false },
      ],
    },
  ] as const;

  return (
    <footer className="rule mt-8">
      <Container>
        <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="grid h-7 w-7 place-items-center rounded-sm bg-ink font-display text-sm font-bold leading-none text-canvas"
              >
                D
              </span>
              <span className="font-display text-base font-semibold tracking-tight text-ink">
                DeathClock
              </span>
            </div>
            <p className="pretty mt-4 text-sm leading-relaxed text-muted">
              A Solana vault that pays out on verifiable absence of a heartbeat rather than on a
              court order.
            </p>
            <div className="mt-5">
              <NetworkBadge />
            </div>
          </div>

          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="label">{column.title}</p>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      {...("external" in link && link.external
                        ? { target: "_blank", rel: "noreferrer noopener" }
                        : {})}
                      className="text-sm text-muted transition-colors duration-150 ease-standard hover:text-ink"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="rule flex flex-col gap-2 py-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>RISC Zero Groth16 receipts verified on BN254. Fees: 0.5% on release only.</p>
          <p className="font-mono">devnet · not audited · not for mainnet funds</p>
        </div>
      </Container>
    </footer>
  );
}
