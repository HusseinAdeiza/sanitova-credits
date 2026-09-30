"use client";

import { useEffect } from "react";

/**
 * Last-resort error boundary.
 *
 * Without this, any thrown exception replaced the whole page with Next's
 * "Application error: a client-side exception has occurred" — a white screen
 * with no way back. That is the worst possible outcome during a live demo, and
 * it is also the least useful state to debug from: the console had the real
 * message but the page itself gave nothing away.
 *
 * This keeps the shell and reports the actual error, so a failure in the vault
 * console leaves the rest of the site standing and the reason visible.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Left in deliberately: during a demo the console is the only place the
    // stack is recoverable from.
    console.error("DeathClock render error:", error);
  }, [error]);

  return (
    <main className="shell flex min-h-screen items-center py-24">
      <div className="panel w-full p-7">
        <p className="label">Something broke</p>

        <h1 className="mt-3 font-display text-display-sm text-ink">
          This part of the page failed to render.
        </h1>

        <p className="pretty mt-3 max-w-prose text-sm leading-relaxed text-muted">
          The rest of DeathClock is still running — the vault, the proof path and the chain
          state below are unaffected. Only this component stopped.
        </p>

        <pre className="field mt-5 overflow-x-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-ink">
          {error.message}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>

        <button type="button" className="btn-ember btn-md mt-5" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
