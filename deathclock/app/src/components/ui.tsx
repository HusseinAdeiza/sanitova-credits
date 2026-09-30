"use client";

import type { ReactNode } from "react";

/* ---------------------------------------------------------------------------
   Primitives

   Small, unopinionated building blocks used by every section. Keeping them
   separate from the section layouts is what stops the page turning into one
   file of repeated class strings.
--------------------------------------------------------------------------- */

export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`shell ${className}`}>{children}</div>;
}

export function Section({
  children,
  className = "",
  id,
  tight = false,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  tight?: boolean;
}) {
  return (
    <section id={id} className={`${tight ? "section-y-tight" : "section-y"} ${className}`}>
      {children}
    </section>
  );
}

/**
 * Section header: a tracked eyebrow, a display heading and an optional lede.
 * The heading size is chosen by the caller because sections vary in emphasis.
 */
export function SectionHeader({
  eyebrow,
  title,
  lede,
  align = "left",
  headingSize = "display-md",
  className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: "left" | "center";
  headingSize?: "display-lg" | "display-md" | "display-sm";
  className?: string;
}) {
  const alignment = align === "center" ? "mx-auto items-center text-center" : "items-start";
  // Tailwind's scanner only sees literal class names, so the size is mapped
  // explicitly rather than interpolated.
  const sizeClass = {
    "display-lg": "text-display-lg",
    "display-md": "text-display-md",
    "display-sm": "text-display-sm",
  }[headingSize];
  return (
    <header className={`flex max-w-3xl flex-col gap-4 ${alignment} ${className}`}>
      {eyebrow ? (
        <p className="label flex items-center gap-2.5">
          <span aria-hidden className="h-px w-6 bg-ember" />
          {eyebrow}
        </p>
      ) : null}
      <h2 className={`balance font-display ${sizeClass} text-ink`}>{title}</h2>
      {lede ? <p className="pretty max-w-2xl text-base leading-relaxed text-muted">{lede}</p> : null}
    </header>
  );
}

/**
 * A single metric. `figures` keeps the digits from shifting as a live value
 * updates, which matters on a dashboard that polls the chain.
 */
export function Stat({
  label,
  value,
  unit,
  tone = "default",
  hint,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "default" | "accent" | "live";
  hint?: string;
}) {
  const valueTone =
    tone === "accent" ? "text-ember" : tone === "live" ? "text-positive" : "text-ink";
  return (
    <div className="stat">
      <span className="stat-key">{label}</span>
      <span className={`figures font-display text-metric-sm font-semibold ${valueTone}`}>
        {value}
        {unit ? <span className="ml-1 text-xs font-sans font-medium text-faint">{unit}</span> : null}
      </span>
      {hint ? <span className="text-xs leading-snug text-faint">{hint}</span> : null}
    </div>
  );
}

/** Hairline-separated row of stats. Reads as a table, not a card grid. */
export function StatRow({
  children,
  columns = 4,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4 | 5;
}) {
  const cols = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
    5: "sm:grid-cols-2 lg:grid-cols-5",
  }[columns];
  return <div className={`grid grid-cols-1 gap-x-8 ${cols}`}>{children}</div>;
}

export function Pill({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: "neutral" | "live" | "warn" | "critical";
  dot?: boolean;
}) {
  const toneClass = {
    neutral: "pill-neutral",
    live: "pill-live",
    warn: "pill-warn",
    critical: "pill-critical",
  }[tone];
  return (
    <span className={`pill ${toneClass}`}>
      {dot ? (
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-current animate-pulse-ring"
        />
      ) : null}
      {children}
    </span>
  );
}

/**
 * Monospace address or signature. Always shortened to a fixed width so a long
 * base58 string can never blow out a grid column.
 */
export function Mono({
  children,
  full = false,
  className = "",
}: {
  children: string;
  full?: boolean;
  className?: string;
}) {
  return (
    <code
      className={`font-mono text-xs text-muted ${full ? "break-all" : "no-wrap"} ${className}`}
    >
      {children}
    </code>
  );
}

/** Key/value line used in the dense data sections. */
export function DataRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="hairline-row flex items-baseline justify-between gap-4">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-right text-sm font-medium text-ink ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}

/** Inline note used to qualify a claim rather than assert it. */
export function Footnote({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-faint">{children}</p>;
}
