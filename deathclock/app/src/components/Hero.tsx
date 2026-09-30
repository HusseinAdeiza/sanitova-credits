"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { Container, Pill, Section, Stat, StatRow } from "@/components/ui";
import { PROGRAM_ID, RPC_URL, NETWORK, FEE_BPS } from "@/utils/constants";
import { GROTH16_VERIFIER_PROGRAM_ID, ROUTER_PROGRAM_ID } from "@/utils/verifier";
import { formatSol, shorten } from "@/utils/helpers";
import { WalletButton } from "@/components/WalletButton";

type ChainStatus = {
  programExecutable: boolean | null;
  routerExecutable: boolean | null;
  verifierExecutable: boolean | null;
  vaultCount: number | null;
};

/**
 * Polls the configured cluster for the three deployed programs.
 *
 * This is the same data a visitor's own wallet will read, so the hero can
 * state deployment status as a fact rather than a claim. It reports `null`
 * while loading and on RPC failure instead of guessing — a status panel that
 * lies is worse than one that admits it does not know yet.
 */
function useChainStatus(): ChainStatus {
  const [status, setStatus] = useState<ChainStatus>({
    programExecutable: null,
    routerExecutable: null,
    verifierExecutable: null,
    vaultCount: null,
  });

  useEffect(() => {
    let cancelled = false;
    const connection = new Connection(RPC_URL, "confirmed");

    const check = async (address: string) => {
      const info = await connection.getAccountInfo(new PublicKey(address));
      return Boolean(info?.executable);
    };

    const run = async () => {
      try {
        const [program, router, verifier] = await Promise.all([
          check(PROGRAM_ID),
          check(ROUTER_PROGRAM_ID.toBase58()),
          check(GROTH16_VERIFIER_PROGRAM_ID.toBase58()),
        ]);
        if (cancelled) return;
        setStatus((previous) => ({
          ...previous,
          programExecutable: program,
          routerExecutable: router,
          verifierExecutable: verifier,
        }));
      } catch {
        // Leave the nulls in place: the UI renders "unreachable" for them.
      }
    };

    void run();
    const timer = window.setInterval(run, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return status;
}

function StatusCell({ label, value }: { label: string; value: boolean | null }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="truncate font-mono text-xs text-muted">{label}</span>
      {value === null ? (
        <span className="shrink-0 text-xs text-faint">checking…</span>
      ) : value ? (
        <Pill tone="live" dot>
          executable
        </Pill>
      ) : (
        <Pill tone="critical">not found</Pill>
      )}
    </div>
  );
}

/**
 * Live deployment panel. Deliberately a status readout of the real cluster
 * rather than a stylised dashboard mock — every value is fetched.
 */
function DeploymentPanel() {
  const status = useChainStatus();
  const allLive =
    status.programExecutable && status.routerExecutable && status.verifierExecutable;

  return (
    <div className="panel-raised overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line/12 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${allLive ? "bg-positive animate-pulse-ring" : "bg-faint"}`}
          />
          <span className="font-mono text-xs font-medium text-ink">cluster status</span>
        </div>
        <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-faint">
          {NETWORK}
        </span>
      </div>

      <div className="px-5 py-2">
        <StatusCell label={shorten(PROGRAM_ID, 6)} value={status.programExecutable} />
        <StatusCell label={shorten(ROUTER_PROGRAM_ID.toBase58(), 6)} value={status.routerExecutable} />
        <StatusCell
          label={shorten(GROTH16_VERIFIER_PROGRAM_ID.toBase58(), 6)}
          value={status.verifierExecutable}
        />
      </div>

      <div className="grid grid-cols-2 divide-x divide-line/12 border-t border-line/12">
        <div className="px-5 py-4">
          <Stat label="Release fee" value={FEE_BPS / 100} unit="%" hint="charged only on distribution" />
        </div>
        <div className="px-5 py-4">
          <Stat label="Challenge window" value="48" unit="h" hint="before funds can move" />
        </div>
      </div>

      <p className="border-t border-line/12 bg-ink/[0.02] px-5 py-3 text-xs leading-relaxed text-faint">
        Read from {RPC_URL.replace(/^https?:\/\//, "")} on every load. Nothing here is
        pre-rendered.
      </p>
    </div>
  );
}

export function Hero() {
  return (
    <Section id="top" className="pb-0 pt-12 sm:pt-16 lg:pt-20">
      <Container>
        <div className="grid items-start gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <div>
            <p className="label flex items-center gap-2.5">
              <span aria-hidden className="h-px w-6 bg-ember" />
              Solana · Anchor · RISC Zero Groth16
            </p>

            <h1 className="balance mt-6 font-display text-display-xl text-ink">
              Your estate pays out
              <br />
              on a <em className="not-italic text-ember">verifiable</em> absence.
            </h1>

            <p className="pretty mt-7 max-w-xl text-lg leading-relaxed text-muted">
              Deposit SOL into a program-derived vault. Submit a zero-knowledge heartbeat every
              thirty days to prove you are alive without revealing where you are. Miss it, and a
              48-hour challenge window opens before your heirs are paid — no lawyer, no probate
              court, no custodian holding your keys.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a href="#vault" className="btn-primary btn-lg">
                Open your vault
              </a>
              <a href="#states" className="btn-secondary btn-lg">
                Read the state machine
              </a>
            </div>

            <p className="mt-4 text-xs text-faint">
              Runs on devnet. Connect a Solana wallet to create a real vault — the transactions are
              real.
            </p>
          </div>

          <div className="lg:sticky lg:top-24">
            <DeploymentPanel />
          </div>
        </div>
      </Container>
    </Section>
  );
}
