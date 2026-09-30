"use client";

import { useMemo, useState } from "react";
import { Container, Section, SectionHeader, Pill, Footnote } from "@/components/ui";
import { CHALLENGE_PERIOD, HEARTBEAT_INTERVAL, FEE_BPS } from "@/utils/constants";

/* ---------------------------------------------------------------------------
   State machine walkthrough

   The transitions here are the program's actual rules, taken from the same
   constants the contract uses, and each step names the instruction that
   performs it. Advancing is deliberately one-way per branch so the user has to
   read the sequence rather than click through a slideshow.
--------------------------------------------------------------------------- */

type StateId = "active" | "missed" | "challenged" | "release" | "released";

type StateMeta = {
  id: StateId;
  name: string;
  /** What the program permits from here. */
  actions: { label: string; to: StateId; instruction: string; detail: string; primary?: boolean }[];
  requirement: string;
};

const STATES: Record<StateId, StateMeta> = {
  active: {
    id: "active",
    name: "Active",
    requirement: "Heartbeat within the interval. Vault is live and accruing.",
    actions: [
      {
        label: "Submit heartbeat",
        to: "active",
        instruction: "heartbeat",
        detail:
          "Takes a Groth16 seal. The router verifies the BN254 pairing, then the program checks the journal digest against the live cluster clock inside a 300-second freshness window.",
        primary: true,
      },
      {
        label: "Report missed heartbeat",
        to: "missed",
        instruction: "report_death",
        detail:
          "Permissionless — anyone can call it once the interval has elapsed. No stake, no veto. The only precondition is time.",
      },
      {
        label: "Time passes",
        to: "missed",
        instruction: "—",
        detail: `The interval is ${HEARTBEAT_INTERVAL / 86400} days. A proof older than 300 seconds is refused, so liveness has to be re-proven continuously.`,
      },
    ],
  },
  missed: {
    id: "missed",
    name: "Missed",
    requirement: "A report has been accepted. Nothing has moved yet.",
    actions: [
      {
        label: "Owner proves life",
        to: "active",
        instruction: "heartbeat / emergency_recover",
        detail:
          "A late-but-valid proof returns the vault to Active. This is why a false report costs the reporter nothing and the owner everything to fix — so griefing is bounded by the challenge period.",
      },
      {
        label: "Start the challenge window",
        to: "challenged",
        instruction: "initiate_challenge",
        detail: `Opens ${CHALLENGE_PERIOD / 3600} hours. Funds are locked for the duration; no distribution is possible yet.`,
        primary: true,
      },
    ],
  },
  challenged: {
    id: "challenged",
    name: "Challenged",
    requirement: "Countdown running. Only a valid proof or an expired window can end it.",
    actions: [
      {
        label: "Owner proves life",
        to: "active",
        instruction: "resolve_challenge(is_alive = true)",
        detail: "Resolves immediately, without waiting out the window. The estate returns to Active.",
        primary: true,
      },
      {
        label: "Let the window expire",
        to: "release",
        instruction: "resolve_challenge(is_alive = false)",
        detail:
          "Requires the full challenge period to have elapsed on-chain. A short window is the single most important parameter here: too short and a network outage triggers a payout.",
      },
    ],
  },
  release: {
    id: "release",
    name: "Release",
    requirement: "Death confirmed. The split is computed and waiting to be pushed.",
    actions: [
      {
        label: "Distribute to heirs",
        to: "released",
        instruction: "release_inheritance",
        detail: `Splits by the shares stored at vault creation, in integer lamports, then takes a ${FEE_BPS / 100}% fee to the protocol treasury. Rounding dust stays in the vault rather than being stranded.`,
        primary: true,
      },
    ],
  },
  released: {
    id: "released",
    name: "Released",
    requirement: "Terminal. The vault is spent and the state cannot be reopened.",
    actions: [],
  },
};

const ORDER: StateId[] = ["active", "missed", "challenged", "release", "released"];

const TONE: Record<StateId, "live" | "warn" | "critical" | "neutral"> = {
  active: "live",
  missed: "warn",
  challenged: "warn",
  release: "critical",
  released: "neutral",
};

export function StateWalkthrough() {
  const [state, setState] = useState<StateId>("active");
  const [history, setHistory] = useState<StateId[]>(["active"]);
  const current = STATES[state];
  const isTerminal = current.actions.length === 0;

  // Heir split is illustrative but computed with the real fee, so the numbers
  // a reader checks add up the way the program's arithmetic does.
  const example = useMemo(() => {
    const estate = 10;
    const fee = (estate * FEE_BPS) / 10_000;
    const distributable = estate - fee;
    const shares = [
      { label: "Spouse", share: 60 },
      { label: "Child A", share: 25 },
      { label: "Child B", share: 15 },
    ];
    return {
      estate,
      fee,
      distributable,
      rows: shares.map((row) => ({
        ...row,
        amount: (distributable * row.share) / 100,
      })),
    };
  }, []);

  return (
    <Section id="states">
      <Container>
        <SectionHeader
          eyebrow="State machine"
          title="Five states. Every transition is a program instruction, not a policy document."
          lede="Nothing here is off-chain bookkeeping. Each arrow below is an Anchor instruction with its own constraints, and the ones that move money are reachable only after a time condition the chain itself enforces."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          {/* Interactive machine */}
          <div className="panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/12 px-5 py-4">
              <ol className="flex flex-wrap items-center gap-1.5" aria-label="Vault lifecycle">
                {ORDER.map((id, index) => {
                  const visited = history.includes(id);
                  const isCurrent = id === state;
                  return (
                    <li key={id} className="flex items-center gap-1.5">
                      {index > 0 ? (
                        <span aria-hidden className="h-px w-4 bg-line/20" />
                      ) : null}
                      <span
                        aria-current={isCurrent ? "step" : undefined}
                        className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 ease-standard ${
                          isCurrent
                            ? "bg-ink text-canvas"
                            : visited
                              ? "bg-ink/[0.06] text-ink"
                              : "text-faint"
                        }`}
                      >
                        {STATES[id].name}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <Pill tone={TONE[state]}>{isTerminal ? "terminal" : "actionable"}</Pill>
            </div>

            <div className="px-5 py-6">
              <p className="label">Current requirement</p>
              <p className="pretty mt-2 text-sm leading-relaxed text-ink">{current.requirement}</p>

              {isTerminal ? (
                <div className="mt-6 rounded-md border border-line/12 bg-ink/[0.03] px-4 py-5">
                  <p className="text-sm font-medium text-ink">The estate has been distributed.</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    There is no transition out of Released. A vault cannot be reopened, which is
                    what makes the payout final rather than provisional.
                  </p>
                  <button
                    type="button"
                    className="btn-secondary btn-sm mt-4"
                    onClick={() => {
                      setState("active");
                      setHistory(["active"]);
                    }}
                  >
                    Reset the walkthrough
                  </button>
                </div>
              ) : (
                <div className="mt-6 space-y-2.5">
                  {current.actions.map((action) => (
                    <button
                      key={action.label + action.instruction}
                      type="button"
                      onClick={() => {
                        setState(action.to);
                        setHistory((previous) => [...previous, action.to]);
                      }}
                      className={`w-full rounded-md border px-4 py-3.5 text-left transition-[border-color,background-color,transform] duration-150 ease-standard hover:-translate-y-px active:translate-y-0 ${
                        action.primary
                          ? "border-ember/35 bg-ember/[0.06] hover:border-ember/60 hover:bg-ember/[0.1]"
                          : "border-line/15 bg-raised hover:border-line/35"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-ink">{action.label}</span>
                        <span className="font-mono text-[0.6875rem] text-faint">
                          {action.instruction}
                        </span>
                      </span>
                      <span className="pretty mt-1.5 block text-sm leading-relaxed text-muted">
                        {action.detail}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Worked split */}
          <div className="panel overflow-hidden">
            <div className="border-b border-line/12 px-5 py-4">
              <p className="label">Worked example</p>
              <p className="mt-2 text-sm text-muted">
                A {example.estate} SOL estate split 60/25/15, using the on-chain arithmetic.
              </p>
            </div>

            <dl className="px-5 py-2">
              {example.rows.map((row) => (
                <div
                  key={row.label}
                  className="hairline-row flex items-baseline justify-between gap-4"
                >
                  <dt className="text-sm text-muted">
                    {row.label}{" "}
                    <span className="font-mono text-xs text-faint">{row.share}%</span>
                  </dt>
                  <dd className="figures font-display text-metric-sm font-semibold text-ink">
                    {row.amount.toFixed(4)}{" "}
                    <span className="font-sans text-xs font-medium text-faint">SOL</span>
                  </dd>
                </div>
              ))}
              <div className="hairline-row flex items-baseline justify-between gap-4">
                <dt className="text-sm text-muted">Protocol fee</dt>
                <dd className="figures font-display text-metric-sm font-semibold text-ember">
                  {example.fee.toFixed(4)}{" "}
                  <span className="font-sans text-xs font-medium text-faint">SOL</span>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-4">
                <dt className="text-sm font-medium text-ink">Total</dt>
                <dd className="figures font-display text-metric-sm font-semibold text-ink">
                  {example.estate.toFixed(4)}{" "}
                  <span className="font-sans text-xs font-medium text-faint">SOL</span>
                </dd>
              </div>
            </dl>

            <div className="border-t border-line/12 px-5 py-4">
              <Footnote>
                Shares must total exactly 100% at creation, and the fee is taken before the split so
                heirs are unaffected by it. The figure above is arithmetic on the configured{" "}
                <span className="font-mono">FEE_BPS</span>, not a recorded transaction.
              </Footnote>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
