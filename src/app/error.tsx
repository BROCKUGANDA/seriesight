"use client";

/**
 * Page-level error boundary (PRD K1). Preserves the Seriesight identity and
 * always offers a recovery path; never leaks internals.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="critical-gradient h-1 w-40 rounded-full" />
      <div>
        <p className="tnum text-4xl font-semibold text-[var(--text-primary)]">Render failure</p>
        <p className="mt-2 max-w-md text-sm text-[var(--text-secondary)]">
          This workspace view failed to render. The rest of the application remains available — recover without losing your session.
        </p>
        <p className="mt-2 font-mono text-[10px] text-[var(--text-muted)]">
          {error.digest ? `trace: ${error.digest}` : "trace unavailable"}
        </p>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-[var(--accent-cyan)]/60 bg-[var(--accent-cyan)]/10 px-5 py-2.5 text-sm font-medium text-[var(--accent-cyan)]"
        >
          Retry this view
        </button>
        <a
          href="/#dashboard"
          className="rounded-lg border border-[var(--border-active)] px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)]"
        >
          Back to Command Center
        </a>
      </div>
    </div>
  );
}
