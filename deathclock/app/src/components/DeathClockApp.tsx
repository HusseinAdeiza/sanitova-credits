"use client";

import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useVault } from "@/hooks/useVault";
import type { Heir, HeartbeatPayload, VaultSnapshot } from "@/types";
import { FEE_BPS } from "@/utils/constants";
import { Container, Section, SectionHeader, Pill, Footnote } from "@/components/ui";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { Hero } from "@/components/Hero";
import { ProofSection } from "@/components/ProofSection";
import { FeatureBento, ClosingCta } from "@/components/FeatureBento";
import { StateWalkthrough } from "@/components/StateWalkthrough";
import { VaultConsole } from "@/components/VaultConsole";
import { HeartbeatPanel } from "@/components/HeartbeatPanel";

/** Rendered before a wallet connects, so the console is never empty. */
const PLACEHOLDER: VaultSnapshot = {
  address: "—",
  initialized: false,
  state: "active",
  balanceSol: 0,
  totalDepositedSol: 0,
  lastHeartbeat: 0,
  deathReportedAt: 0,
  challengeStartedAt: 0,
  heartbeatInterval: 30 * 24 * 60 * 60,
  challengePeriod: 48 * 60 * 60,
  heirs: [],
};

export function DeathClockApp() {
  const { connected, signer, connect, installed } = useWallet();
  const vault = useVault(signer?.publicKey ?? null, signer);
  const [heirs, setHeirs] = useState<Heir[]>([]);

  const snapshot = vault.snapshot ?? PLACEHOLDER;

  /**
   * Wraps a vault action with a confirmation message. `useVault` already
   * surfaces the underlying error text through `message` and rethrows, so
   * failures are not re-wrapped here — only the success case is added.
   */
  const run = async (label: string, operation: () => Promise<unknown>) => {
    try {
      await operation();
      vault.setMessage(`${label} confirmed on Solana.`);
    } catch {
      // useVault has already recorded the reason; leave it to stand.
    }
  };

  const onCreate = async () => {
    const total = heirs.reduce((sum, heir) => sum + heir.share, 0);
    if (heirs.length === 0 || total !== 100) {
      vault.setMessage("Assign shares totalling exactly 100% before creating the vault.");
      return;
    }
    await run("Vault creation", () => vault.initializeVault(heirs));
  };

  const onDeposit = async () => {
    const raw = window.prompt("How much SOL would you like to deposit?", "1");
    if (raw === null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      vault.setMessage("Enter a positive SOL amount.");
      return;
    }
    await run("Deposit", () => vault.deposit(amount));
  };

  const onHeartbeat = async (payload: HeartbeatPayload) => {
    await run("Heartbeat", () => vault.heartbeat(payload));
  };

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />

      <main>
        <Hero />
        <ProofSection />
        <FeatureBento />
        <StateWalkthrough />

        {/* The live product. Everything above is explanation; this is the app. */}
        <Section id="vault">
          <Container>
            <SectionHeader
              eyebrow="Live vault"
              title="Create and fund a real vault."
              lede="These controls call the deployed Anchor program. Every transaction signs in your wallet and lands on devnet — nothing here is simulated."
            />

            <div className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
              <VaultConsole
                snapshot={snapshot}
                connected={connected}
                busy={vault.busy}
                heirs={heirs}
                onHeirsChange={setHeirs}
                onCreate={onCreate}
                onDeposit={onDeposit}
                onReportDeath={() => run("Death report", vault.reportDeath)}
                onInitiateChallenge={() => run("Challenge", vault.initiateChallenge)}
                onResolveChallenge={(alive) =>
                  run(alive ? "Recovery" : "Challenge resolution", () =>
                    vault.resolveChallenge(alive),
                  )
                }
                onRelease={() => run("Inheritance release", vault.releaseInheritance)}
                notice={vault.loading && !vault.message ? "Syncing vault state…" : vault.message}
                lastSignature={vault.lastSignature}
              />

              <div className="space-y-4">
                <HeartbeatPanel
                  onSubmit={onHeartbeat}
                  ownerKey={vault.owner}
                  disabled={!connected || vault.busy}
                />

                {connected && installed.length === 0 ? (
                  <div className="panel p-5">
                    <Pill tone="warn">Wallet unavailable</Pill>
                    <p className="pretty mt-3 text-sm leading-relaxed text-muted">
                      The wallet stopped responding after connecting. Reconnect from the header to
                      continue.
                    </p>
                    <button
                      type="button"
                      className="btn-secondary btn-sm mt-4"
                      onClick={() => void connect("phantom")}
                    >
                      Reconnect
                    </button>
                  </div>
                ) : null}

                <div className="panel p-5">
                  <p className="label">What happens on release</p>
                  <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted">
                    <li>
                      <span className="font-medium text-ink">1.</span> The estate balance is read
                      from the vault account, not from an off-chain record.
                    </li>
                    <li>
                      <span className="font-medium text-ink">2.</span> The {FEE_BPS / 100}% fee
                      moves to the protocol treasury PDA.
                    </li>
                    <li>
                      <span className="font-medium text-ink">3.</span> The remainder is split by
                      the shares stored at creation, in integer lamports.
                    </li>
                    <li>
                      <span className="font-medium text-ink">4.</span> State moves to{" "}
                      <span className="font-mono text-xs">Released</span>, which has no exit.
                    </li>
                  </ol>
                  <div className="mt-4">
                    <Footnote>
                      Release currently moves lamports held by the vault account directly. Moving to
                      a PDA-owned token account is tracked as follow-up work.
                    </Footnote>
                  </div>
                </div>
              </div>
            </div>
          </Container>
        </Section>

        <ClosingCta />
      </main>

      <SiteFooter />
    </div>
  );
}
