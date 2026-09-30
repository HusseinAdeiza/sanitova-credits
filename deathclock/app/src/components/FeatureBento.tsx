"use client";

import { useState } from "react";
import { Container, Section, SectionHeader, Pill, Stat, StatRow, Footnote } from "@/components/ui";
import { CHALLENGE_PERIOD, HEARTBEAT_INTERVAL, FEE_BPS } from "@/utils/constants";

/**
 * Feature showcase as an asymmetric bento.
 *
 * The expanded cell is interactive rather than decorative: it is a share
 * editor that enforces the same sum-to-100 rule the program does, so a reader
 * can discover the constraint by using it instead of being told about it.
 */
function ShareEditor() {
  const [rows, setRows] = useState([
    { id: 1, name: "Spouse", share: 60 },
    { id: 2, name: "Child A", share: 25 },
    { id: 3, name: "Child B", share: 15 },
  ]);
  const [nextId, setNextId] = useState(4);

  const total = rows.reduce((sum, row) => sum + (Number.isFinite(row.share) ? row.share : 0), 0);
  const valid = total === 100 && rows.length > 0;
  const remainder = 100 - total;

  const update = (id: number, share: number) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, share } : row)));

  const add = () => {
    setRows((current) => [...current, { id: nextId, name: `Heir ${current.length + 1}`, share: 0 }]);
    setNextId((value) => value + 1);
  };

  const remove = (id: number) => setRows((current) => current.filter((row) => row.id !== id));

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="label">Share editor</p>
        <Pill tone={valid ? "live" : remainder < 0 ? "critical" : "warn"}>
          {valid ? "valid" : remainder < 0 ? `${Math.abs(remainder)}% over` : `${remainder}% left`}
        </Pill>
      </div>

      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-3">
            <span className="w-20 shrink-0 truncate text-sm text-muted">{row.name}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={row.share}
              onChange={(event) => update(row.id, Number(event.target.value))}
              aria-label={`${row.name} share`}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-line/15 accent-ember"
            />
            <span className="figures w-12 shrink-0 text-right font-mono text-xs text-ink">
              {row.share}%
            </span>
            <button
              type="button"
              onClick={() => remove(row.id)}
              disabled={rows.length <= 1}
              aria-label={`Remove ${row.name}`}
              className="shrink-0 rounded-sm px-1.5 text-sm text-faint transition-colors duration-150 hover:text-critical disabled:opacity-30 disabled:hover:text-faint"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={add}
          disabled={rows.length >= 5}
          className="btn-secondary btn-sm"
        >
          Add heir
        </button>
        <span className="figures font-mono text-xs text-muted">Σ {total}%</span>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-faint">
        {valid
          ? "The program accepts this: heirs is non-empty and shares sum to exactly 100."
          : "initialize_vault rejects anything else. Shares are u8, so they must total exactly 100 — not 99, not 101."}
      </p>
    </div>
  );
}

export function FeatureBento() {
  return (
    <Section id="protocol">
      <Container>
        <SectionHeader
          eyebrow="Protocol"
          title="What the program actually guarantees."
          lede="Four properties, each enforced by the contract rather than by the operator running it."
        />

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {/* Expanded interactive cell */}
          <div className="panel-raised p-6 sm:p-7 lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="label">Beneficiaries</p>
                <h3 className="balance mt-2.5 font-display text-display-sm text-ink">
                  Shares are fixed at creation and validated on-chain.
                </h3>
              </div>
              <Pill tone="neutral">up to 5</Pill>
            </div>
            <p className="pretty mt-3 max-w-xl text-sm leading-relaxed text-muted">
              Heirs and their percentages are written into the vault account when it is opened.
              Changing them later is not an exposed instruction, so the split at release time is
              the split the owner agreed to — not one an heir or a caller can revise on the way out.
            </p>
            <div className="mt-7 border-t border-line/12 pt-6">
              <ShareEditor />
            </div>
          </div>

          {/* Stacked pair */}
          <div className="grid gap-4">
            <div className="panel flex flex-col p-6">
              <p className="label">Permissionless reporting</p>
              <h3 className="mt-2.5 font-display text-display-sm text-ink">
                Anyone can start the clock. Nobody can end it early.
              </h3>
              <p className="pretty mt-3 flex-1 text-sm leading-relaxed text-muted">
                report_death has no authority check — by design, so a stalled estate does not need
                a trusted reporter. But distribution needs the challenge period to have elapsed on
                chain, so the fastest possible path from report to payout is still{" "}
                {CHALLENGE_PERIOD / 3600} hours.
              </p>
            </div>

            <div className="panel flex flex-col p-6">
              <p className="label">Fee</p>
              <h3 className="mt-2.5 font-display text-display-sm text-ink">
                Charged once, on release, never on deposits.
              </h3>
              <p className="pretty mt-3 flex-1 text-sm leading-relaxed text-muted">
                {FEE_BPS / 100}% of the estate goes to a protocol treasury PDA at distribution. No
                subscription, no fee on a deposit, and no cost to a vault that is never claimed.
              </p>
            </div>
          </div>

          {/* Wide metric band */}
          <div className="panel p-6 sm:p-7 lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="label">Protocol parameters</p>
              <p className="font-mono text-xs text-faint">read from the deployment config</p>
            </div>
            <div className="mt-2 divide-y divide-line/10">
              <StatRow columns={5}>
                <Stat
                  label="Heartbeat interval"
                  value={HEARTBEAT_INTERVAL / 86400}
                  unit="days"
                  hint="How often a proof is required"
                />
                <Stat
                  label="Proof freshness"
                  value={300}
                  unit="s"
                  hint="Rejects replayed receipts"
                />
                <Stat
                  label="Challenge window"
                  value={CHALLENGE_PERIOD / 3600}
                  unit="hours"
                  hint="Lock-up after a report"
                />
                <Stat label="Release fee" value={FEE_BPS / 100} unit="%" hint="One-time, on payout" tone="accent" />
                <Stat
                  label="Vault states"
                  value="5"
                  hint="Active → Released"
                />
              </StatRow>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}

export function ClosingCta() {
  return (
    <Section id="heirs" tight>
      <Container>
        <div className="panel-invert relative overflow-hidden p-8 sm:p-12 lg:p-16">
          {/* A single hairline grid, not a gradient wash. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />

          <div className="relative grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="label text-on-invert">Next step</p>
              <h2 className="balance mt-4 font-display text-display-lg text-canvas">
                Open a vault, name your heirs, and let the clock do the rest.
              </h2>
              <p className="pretty mt-5 max-w-xl text-base leading-relaxed text-canvas/70">
                Creating a vault is one transaction from the panel below. Deposits are real devnet
                SOL, the state machine is the deployed program, and the only thing this page cannot
                do is prove you are alive on your behalf.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#vault" className="btn-primary btn-lg !border-canvas/20 !bg-canvas !text-ink hover:!bg-ember hover:!text-white">
                  Open your vault
                </a>
                <a
                  href="https://explorer.solana.com/address/C8unxtjoDZWy2GmwHUPuSve1BHT5TtRKpNaDofbMS5Vh?cluster=devnet"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="btn btn-lg border border-canvas/25 text-canvas hover:bg-canvas/10"
                >
                  Inspect the program ↗
                </a>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-canvas/15 pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
              {[
                { k: "Network", v: "Solana devnet" },
                { k: "Proof system", v: "RISC Zero Groth16" },
                { k: "On-chain check", v: "BN254 pairing" },
                { k: "Protocol fee", v: `${FEE_BPS / 100}% on release` },
              ].map((row) => (
                <div key={row.k}>
                  <dt className="text-micro font-semibold uppercase text-on-invert">{row.k}</dt>
                  <dd className="mt-1.5 font-display text-metric-sm font-semibold text-canvas">
                    {row.v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="mt-6">
          <Footnote>
            Devnet deployment. The programs are not audited and hold no real value — the addresses
            above are the actual deployed program ids, and every figure on this page is read from
            the cluster or derived from the program's own constants.
          </Footnote>
        </div>
      </Container>
    </Section>
  );
}
