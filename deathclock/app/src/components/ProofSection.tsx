"use client";

import { useState } from "react";
import { Container, Section, SectionHeader, Pill, Footnote, Mono } from "@/components/ui";
import { PROGRAM_ID } from "@/utils/constants";
import { ROUTER_PROGRAM_ID, GROTH16_VERIFIER_PROGRAM_ID, SEAL_SELECTOR } from "@/utils/verifier";

type SealShape = {
  field: string;
  bytes: number;
  note: string;
};

const SEAL_FIELDS: SealShape[] = [
  { field: "selector", bytes: 4, note: "First 4 bytes of the Groth16 verifier-parameter digest" },
  { field: "pi_a", bytes: 64, note: "G1 point, negated by the client before submission" },
  { field: "pi_b", bytes: 128, note: "G2 point, uncompressed" },
  { field: "pi_c", bytes: 64, note: "G1 point" },
];

/**
 * Why a heartbeat cannot be forged from a browser tab.
 *
 * The three checks are the ones the program actually performs, in order. The
 * middle one is the expensive part — a BN254 pairing inside the Solana runtime
 * — and it is the reason this is not a signature check with extra steps.
 */
const CHECKS = [
  {
    n: "01",
    title: "The proof is well-formed",
    body: "The seal deserialises into fixed-width G1/G2 points. A malformed seal is rejected before any cryptography runs.",
    where: "router",
  },
  {
    n: "02",
    title: "The pairing checks out on-chain",
    body: "verifier_router dispatches on the 4-byte selector to groth_16_verifier, which runs the BN254 pairing inside the Solana runtime. This is the alt_bn128 syscall — the expensive step, and the one that cannot be skipped.",
    where: "verifier",
  },
  {
    n: "03",
    title: "The journal matches the live clock",
    body: "The program hashes the journal, compares it to the digest the router extracted, and requires the committed timestamp to fall inside a 300-second window around the current on-chain time. A captured proof cannot be replayed tomorrow.",
    where: "program",
  },
] as const;

export function ProofSection() {
  const [active, setActive] = useState(0);
  const check = CHECKS[active];

  return (
    <Section id="proof">
      <Container>
        <SectionHeader
          eyebrow="Proof of life"
          title="A Groth16 receipt, verified by pairing arithmetic inside the Solana runtime."
          lede="The heartbeat is not a signature and not a trusted oracle. It is a zero-knowledge receipt over a small guest program, and the program refuses it unless three independent checks pass."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          {/* Call path */}
          <div className="panel overflow-hidden">
            <div className="border-b border-line/12 px-5 py-4">
              <p className="label">Call path</p>
            </div>
            <ol className="px-5 py-5">
              {[
                { label: "deathclock", role: "Checks the journal and the clock", id: PROGRAM_ID },
                {
                  label: "verifier_router",
                  role: "Routes on the 4-byte selector",
                  id: ROUTER_PROGRAM_ID.toBase58(),
                },
                {
                  label: "groth_16_verifier",
                  role: "Runs the BN254 pairing",
                  id: GROTH16_VERIFIER_PROGRAM_ID.toBase58(),
                },
              ].map((step, index) => (
                <li key={step.label} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line/20 bg-raised font-mono text-[0.625rem] font-semibold text-ink">
                      {index + 1}
                    </span>
                    {index < 2 ? <span aria-hidden className="my-1 w-px flex-1 bg-line/20" /> : null}
                  </div>
                  <div className={index < 2 ? "pb-6" : ""}>
                    <p className="text-sm font-medium text-ink">{step.label}</p>
                    <p className="mt-0.5 text-sm text-muted">{step.role}</p>
                    <Mono className="mt-1.5 block">{step.id}</Mono>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Checks */}
          <div className="panel flex flex-col overflow-hidden">
            <div role="tablist" aria-label="Verification checks" className="flex border-b border-line/12">
              {CHECKS.map((item, index) => (
                <button
                  key={item.n}
                  role="tab"
                  type="button"
                  aria-selected={active === index}
                  onClick={() => setActive(index)}
                  className={`flex-1 border-b-2 px-3 py-3.5 text-left transition-colors duration-150 ease-standard ${
                    active === index
                      ? "border-ember text-ink"
                      : "border-transparent text-faint hover:text-muted"
                  }`}
                >
                  <span className="block font-mono text-[0.625rem] font-semibold">{item.n}</span>
                  <span className="mt-1 block text-xs leading-snug">{item.where}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-1 flex-col px-5 py-6">
              <h3 className="balance font-display text-display-sm text-ink">{check.title}</h3>
              <p className="pretty mt-3 text-sm leading-relaxed text-muted">{check.body}</p>

              <div className="mt-6">
                <p className="label">Seal on the wire</p>
                <table className="mt-2.5 w-full text-left">
                  <thead>
                    <tr className="border-b border-line/12">
                      <th className="pb-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-faint">
                        field
                      </th>
                      <th className="pb-2 text-right font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-faint">
                        bytes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {SEAL_FIELDS.map((field) => (
                      <tr key={field.field} className="border-b border-line/8 last:border-b-0">
                        <td className="py-2.5">
                          <span className="font-mono text-xs text-ink">{field.field}</span>
                          <span className="pretty mt-0.5 block text-xs leading-snug text-faint">
                            {field.note}
                          </span>
                        </td>
                        <td className="figures py-2.5 text-right font-mono text-xs text-muted">
                          {field.bytes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 font-mono text-xs text-faint">
                  selector ={" "}
                  <span className="text-ink">
                    {Array.from(SEAL_SELECTOR)
                      .map((b) => b.toString(16).padStart(2, "0"))
                      .join("")}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Honest limit */}
        <div className="panel mt-6 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line/12 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <Pill tone="warn">platform limit</Pill>
              <p className="text-sm font-medium text-ink">
                The router cannot revoke a verifier on a public cluster
              </p>
            </div>
            <a
              href="https://explorer.solana.com/address/5n8zx79RUHafwSSB4vRU5ao9atHzJQHTdJR9ty8YrVte?cluster=devnet"
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              router on explorer ↗
            </a>
          </div>
          <div className="grid gap-6 px-5 py-5 md:grid-cols-2">
            <div>
              <p className="text-sm leading-relaxed text-muted">
                risc0-solana's <span className="font-mono text-xs">add_verifier</span> requires the
                router PDA to already be the verifier's LoaderV3 upgrade authority, so the router
                could revoke a compromised verifier. Transferring that authority to a PDA is
                impossible: the runtime rejects CPI of{" "}
                <span className="font-mono text-xs">SetAuthority</span> with{" "}
                <span className="font-mono text-xs">not supported by inner instructions</span>, and
                a client cannot do it either because the CLI's checked variant needs the new
                authority to sign.
              </p>
            </div>
            <div>
              <p className="text-sm leading-relaxed text-muted">
                We tried it properly — an owner-gated claim instruction with every upstream
                constraint intact, compiled and deployed. It fails at runtime for the reason above.
                Dropping the authority check would make the router deployable and silently remove
                the ability to revoke a broken verifier, so we left the constraint and deployed
                without it.
              </p>
              <Footnote>
                Full reproduction, including the reverted implementation, is in the repository
                post-mortem.
              </Footnote>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
