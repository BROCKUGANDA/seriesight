"use client";

/** License and availability information for the fixture demo. */
import { SiteHeader, SiteFooter } from "./site-chrome";
import { CONTACT_EMAIL } from "@/lib/commercial";

export function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-void)]">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
        <div className="mx-auto max-w-[820px] text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--accent-cyan)]">License & availability</p>
          <h1 id="pricing-title" className="editorial-title mt-3 text-4xl tracking-tight text-[var(--text-primary)] sm:text-6xl">
            No public subscription is offered
          </h1>
          <p className="mx-auto mt-5 max-w-[680px] text-[15px] leading-relaxed text-[var(--text-secondary)] sm:text-base">
            Seriesight is an interactive fixture-data demo, not a supported paid service. The repository includes
            experimental unauthenticated billing APIs; do not expose them to untrusted users or use them with real funds.
            The source is licensed under the Business Source License 1.1; read its terms before redistribution or deployment.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-[820px] gap-4 sm:grid-cols-2">
          <a href="https://github.com/BROCKUGANDA/seriesight/blob/main/LICENSE" target="_blank" rel="noreferrer" className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6 transition-colors hover:border-[var(--accent-cyan)]">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Read the BSL 1.1 terms</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">The license permits redistribution and non-production use as specified; production use requires separate authorization.</p>
          </a>
          <a href={`mailto:${CONTACT_EMAIL}?subject=Seriesight%20commercial%20license`} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6 transition-colors hover:border-[var(--accent-cyan)]">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Ask about commercial authorization</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">Contact the licensor to discuss production use. This request is not a paid plan or an offer of service.</p>
          </a>
        </div>

        <p className="mx-auto mt-8 max-w-[820px] text-center text-xs leading-relaxed text-[var(--text-muted)]">
          Before opening the demo to the public, review the security notes: authentication, workspace ownership checks,
          request throttling, and outbound destination controls are not provided here.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
