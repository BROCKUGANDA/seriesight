"use client";

import { SeriesightSymbol } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--bg-void)] px-6 text-center">
      <SeriesightSymbol size={56} />
      <div>
        <p className="tnum text-5xl font-semibold text-[var(--text-primary)]">404</p>
        <p className="mt-2 text-lg text-[var(--text-secondary)]">This workspace destination does not exist.</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">The route may have been renamed. All Seriesight destinations live under the workspace navigation.</p>
      </div>
      <a
        href="/#dashboard"
        className="rounded-lg border border-[var(--accent-cyan)]/60 bg-[var(--accent-cyan)]/10 px-5 py-2.5 text-sm font-medium text-[var(--accent-cyan)] transition-colors hover:bg-[var(--accent-cyan)]/20"
      >
        Return to Command Center
      </a>
    </div>
  );
}
