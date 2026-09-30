"use client";

import { useMemo, useState } from "react";
import type { Heir, VaultSnapshot } from "@/types";
import { formatSol, shorten, stateLabel } from "@/utils/helpers";
import { explorerLink } from "@/utils/constants";
import { Pill, Stat, StatRow, Mono, DataRow } from "@/components/ui";

type Props = {
  snapshot: VaultSnapshot;
  onDeposit: () => void;
  onReportDeath: () => void;
  onInitiateChallenge: () => void;
  onResolveChallenge: (alive: boolean) => void;
  onRelease: () => void;
  busy?: boolean;
  connected: boolean;
  heirs: Heir[];
  onHeirsChange: (heirs: Heir[]) => void;
  onCreate: () => void;
  notice: string | null;
  lastSignature: string | null;
};

const TONE = {
  active: "live",
  missed: "warn",
  challenged: "warn",
  release: "critical",
  released: "neutral",
} as const;

/** Share editor, enforcing the program's sum-to-100 rule. */
function HeirEditor({ heirs, onChange }: { heirs: Heir[]; onChange: (heirs: Heir[]) => void }) {
  const [address, setAddress] = useState("");
  const [share, setShare] = useState(0);

  const total = heirs.reduce((sum, heir) => sum + heir.share, 0);
  const addressLooksValid = address.trim().length >= 32 && address.trim().length <= 44;
  const canAdd = addressLooksValid && share > 0 && total + share <= 100;

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="label">Beneficiaries</p>
        <span
          className={`figures font-mono text-xs ${total === 100 ? "text-positive" : "text-ember"}`}
        >
          Σ {total}%
        </span>
      </div>

      {heirs.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {heirs.map((heir) => (
            <li
              key={heir.address}
              className="flex items-center justify-between gap-3 rounded-md border border-line/10 bg-raised px-3 py-2.5"
            >
              <Mono>{shorten(heir.address, 6)}</Mono>
              <span className="flex items-center gap-3">
                <span className="figures font-mono text-xs text-ink">{heir.share}%</span>
                <button
                  type="button"
                  onClick={() => onChange(heirs.filter((item) => item.address !== heir.address))}
                  aria-label={`Remove ${heir.address}`}
                  className="rounded-sm text-sm text-faint transition-colors duration-150 hover:text-critical"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-line/20 px-4 py-6 text-center text-sm text-faint">
          No heirs yet. Shares must total exactly 100%.
        </p>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_5.5rem_auto]">
        <input
          className="field"
          placeholder="Solana address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          spellCheck={false}
          aria-label="Heir Solana address"
        />
        <input
          className="field"
          type="number"
          min={1}
          max={100}
          placeholder="Share %"
          value={share || ""}
          onChange={(event) => setShare(Number(event.target.value))}
          aria-label="Heir share percentage"
        />
        <button
          type="button"
          className="btn-secondary btn-md"
          disabled={!canAdd}
          onClick={() => {
            onChange([...heirs, { address: address.trim(), share }]);
            setAddress("");
            setShare(0);
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

/**
 * The live vault console.
 *
 * Every control here maps to a real instruction, and the buttons that would
 * move money are only rendered in the state where the program permits them —
 * the same conditions the contract enforces, mirrored so the UI cannot offer
 * an action the chain will reject.
 */
export function VaultConsole(props: Props) {
  const {
    snapshot,
    onDeposit,
    onReportDeath,
    onInitiateChallenge,
    onResolveChallenge,
    onRelease,
    busy = false,
    connected,
    heirs,
    onHeirsChange,
    onCreate,
    notice,
    lastSignature,
  } = props;

  const balance = useMemo(() => formatSol(snapshot.balanceSol), [snapshot.balanceSol]);
  const heirsTotal = heirs.reduce((sum, heir) => sum + heir.share, 0);
  const canCreate = connected && heirs.length > 0 && heirsTotal === 100;

  if (!connected) {
    return (
      <div className="panel p-8 text-center">
        <p className="label">Vault console</p>
        <h3 className="mt-3 font-display text-display-sm text-ink">Connect a wallet to begin</h3>
        <p className="pretty mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
          Your vault is a program-derived account keyed to your public key. Nothing is created until
          you sign, and this page never handles a private key.
        </p>
        <p className="mt-5 text-xs text-faint">Use the connect button in the header.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Primary state panel */}
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line/12 px-5 py-4 sm:px-6">
          <div>
            <p className="label">Your vault</p>
            <h3 className="mt-2 font-display text-display-sm text-ink">
              {stateLabel(snapshot.state)}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone={TONE[snapshot.state] ?? "neutral"} dot>
              {snapshot.initialized ? "on-chain" : "not created"}
            </Pill>
          </div>
        </div>

        <div className="px-5 py-2 sm:px-6">
          <div className="divide-y divide-line/10">
            <StatRow columns={4}>
              <Stat label="Balance" value={balance} unit="SOL" tone="accent" />
              <Stat
                label="Deposited"
                value={formatSol(snapshot.totalDepositedSol)}
                unit="SOL"
                hint="Lifetime total"
              />
              <Stat
                label="Last proof"
                value={
                  snapshot.lastHeartbeat
                    ? new Date(snapshot.lastHeartbeat * 1000).toLocaleDateString()
                    : "None"
                }
                hint={snapshot.lastHeartbeat ? "Verified on-chain" : "No receipt submitted"}
              />
              <Stat
                label="Interval"
                value={snapshot.heartbeatInterval / 86400}
                unit="days"
                hint={`${snapshot.challengePeriod / 3600}h challenge on report`}
              />
            </StatRow>
          </div>
        </div>

        <div className="border-t border-line/12 px-5 py-4 sm:px-6">
          <dl>
            <DataRow
              label="Vault address"
              value={
                <a
                  href={explorerLink("address", snapshot.address)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-mono text-xs text-ink underline-offset-4 hover:underline"
                >
                  {shorten(snapshot.address, 8)} ↗
                </a>
              }
            />
          </dl>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line/12 bg-ink/[0.02] px-5 py-4 sm:px-6">
          {snapshot.initialized && snapshot.state === "active" ? (
            <button type="button" className="btn-primary btn-md" onClick={onDeposit} disabled={busy}>
              Deposit SOL
            </button>
          ) : null}

          {snapshot.initialized && snapshot.state === "active" ? (
            <button type="button" className="btn-secondary btn-md" onClick={onReportDeath} disabled={busy}>
              Report missed heartbeat
            </button>
          ) : null}

          {snapshot.state === "missed" ? (
            <button type="button" className="btn-primary btn-md" onClick={onInitiateChallenge} disabled={busy}>
              Start 48h challenge
            </button>
          ) : null}

          {snapshot.state === "challenged" ? (
            <>
              <button type="button" className="btn-secondary btn-md" onClick={() => onResolveChallenge(true)} disabled={busy}>
                I am alive
              </button>
              <button type="button" className="btn-ember btn-md" onClick={() => onResolveChallenge(false)} disabled={busy}>
                Confirm death
              </button>
            </>
          ) : null}

          {snapshot.state === "release" ? (
            <button type="button" className="btn-ember btn-md" onClick={onRelease} disabled={busy}>
              Distribute inheritance
            </button>
          ) : null}
        </div>
      </div>

      {/* On-chain heirs */}
      {snapshot.heirs.length > 0 ? (
        <div className="panel p-5">
          <p className="label">Heirs on-chain</p>
          <ul className="mt-3 space-y-1.5">
            {snapshot.heirs.map((heir) => (
              <li
                key={heir.address}
                className="flex items-center justify-between gap-3 border-b border-line/8 pb-1.5 last:border-b-0"
              >
                <a
                  href={explorerLink("address", heir.address)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-mono text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  {shorten(heir.address, 6)} ↗
                </a>
                <span className="figures font-mono text-xs text-ink">{heir.share}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Creation flow */}
      {!snapshot.initialized ? (
        <HeirEditor heirs={heirs} onChange={onHeirsChange} />
      ) : null}

      {notice ? (
        <p className="rounded-md border border-line/12 bg-raised px-4 py-3 text-sm text-muted">
          {notice}
        </p>
      ) : null}

      {lastSignature ? (
        <a
          href={explorerLink("tx", lastSignature)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-2 text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          View last transaction on Explorer ↗
        </a>
      ) : null}

      {/* Create is its own block so it cannot be fired by accident. */}
      {canCreate && !snapshot.initialized ? (
        <div className="panel-invert p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="label text-canvas/50">Ready</p>
              <p className="mt-2 text-sm text-canvas/80">
                {heirs.length} {heirs.length === 1 ? "heir" : "heirs"} · {heirsTotal}% allocated
              </p>
            </div>
            <button type="button" className="btn btn-lg border border-canvas/20 bg-canvas text-ink hover:bg-ember hover:text-white" onClick={onCreate} disabled={busy}>
              {busy ? "Confirming…" : "Create vault"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
