"use client";

/**
 * Pricing — AED-denominated commercial plans with monthly/annual toggle.
 * PricingCards is exported for the landing preview; PricingPage is the
 * full route. Copy is answer-first (AEO): the opening paragraph states the
 * prices directly so answer engines can quote it verbatim.
 */
import { useState } from "react";
import { SiteHeader, SiteFooter } from "./site-chrome";
import { TrialDialog } from "./trial-dialog";
import { PLANS, PRICING_NOTES, FAQS, TRIAL_DAYS, formatAED } from "@/lib/commercial";

function CheckGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--accent-green)]">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MinusGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--text-disabled)]">
      <path d="M7 12h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function PricingCards({ onCta }: { onCta?: (plan: "scout" | "coach" | "org") => void }) {
  const [annual, setAnnual] = useState(false);

  return (
    <div>
      <div className="mx-auto flex w-fit items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] p-1" role="group" aria-label="Billing period">
        <button
          type="button"
          onClick={() => setAnnual(false)}
          aria-pressed={!annual}
          className={`min-h-[40px] rounded-full px-5 text-[13px] font-medium transition-colors ${
            !annual ? "bg-[var(--surface-3)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setAnnual(true)}
          aria-pressed={annual}
          className={`min-h-[40px] rounded-full px-5 text-[13px] font-medium transition-colors ${
            annual ? "bg-[var(--surface-3)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          Annual <span className="ml-1 rounded-full bg-[var(--accent-green)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-green)]">2 months free</span>
        </button>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {PLANS.map((plan) => {
          const price = annual ? plan.annualAED : plan.monthlyAED;
          const isFree = plan.monthlyAED === 0;
          return (
            <article
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                plan.featured
                  ? "border-[var(--accent-cyan)]/60 bg-[var(--surface-2)]/80 shadow-[0_0_44px_rgba(66,217,255,0.08)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-1)]/70"
              }`}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full signal-gradient px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#06121c]">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{plan.name}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">{plan.tagline}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{plan.audience}</p>

              <div className="mt-5 flex items-end gap-2">
                <span className="tnum text-[34px] font-bold leading-none text-[var(--text-primary)]">{formatAED(price)}</span>
                <span className="pb-1 text-[13px] text-[var(--text-muted)]">
                  {isFree ? "forever" : annual ? "per year" : "per month"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                {isFree ? "Fixture dataset included — no card needed." : annual ? `Billed annually — equals ${formatAED(Math.round(plan.annualAED / 12))}/month.` : "VAT-exclusive. Monthly, cancel any time."}{" "}
                · {plan.seats}
              </p>

              <ul className="mt-5 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2 text-[13px] leading-snug text-[var(--text-secondary)]">
                    <CheckGlyph />
                    <span>{f}</span>
                  </li>
                ))}
                {plan.exclusions.map((f) => (
                  <li key={f} className="flex gap-2 text-[13px] leading-snug text-[var(--text-muted)]">
                    <MinusGlyph />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => onCta?.(plan.id)}
                className={`mt-6 min-h-[44px] rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity ${
                  plan.featured
                    ? "signal-gradient text-[#06121c] hover:opacity-90"
                    : "border border-[var(--border-active)] bg-[var(--surface-2)] text-[var(--text-primary)] hover:border-[var(--accent-cyan)]"
                }`}
              >
                {isFree ? "Open the demo workspace" : `Start ${TRIAL_DAYS}-day trial`}
              </button>
            </article>
          );
        })}
      </div>

      <ul className="mt-6 space-y-1.5 text-center text-xs text-[var(--text-muted)]">
        {PRICING_NOTES.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

const PRICING_FAQS = [FAQS[1], FAQS[2], FAQS[4], FAQS[6]];

function PricingFaq() {
  return (
    <section aria-labelledby="pricing-faq-title" className="mx-auto mt-16 max-w-[820px]">
      <h2 id="pricing-faq-title" className="text-center text-2xl font-semibold text-[var(--text-primary)] sm:text-3xl">
        Pricing questions, answered
      </h2>
      <div className="mt-6 divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/60">
        {PRICING_FAQS.map((f) => (
          <details key={f.question} className="group px-5 py-4">
            <summary className="cursor-pointer list-none text-[15px] font-medium text-[var(--text-primary)] marker:hidden">
              <span className="flex items-center justify-between gap-4">
                {f.question}
                <span className="text-[var(--text-muted)] transition-transform group-open:rotate-45" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{f.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function PricingPage() {
  const [trialOpen, setTrialOpen] = useState(false);
  const [plan, setPlan] = useState<"scout" | "coach" | "org">("coach");

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-void)]">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
        <div className="mx-auto max-w-[820px] text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--accent-cyan)]">Pricing</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl">
            Plans in dirham, priced for real rosters
          </h1>
          <p className="mx-auto mt-5 max-w-[680px] text-[15px] leading-relaxed text-[var(--text-secondary)] sm:text-base">
            Seriesight costs AED 0 on the Scout plan, AED 149 per month for Coach, and AED 449 per month for
            Organisation — exclusive of 5% UAE VAT. Every paid plan includes a {TRIAL_DAYS}-day free trial with no
            credit card required, and you can cancel from Workspace Settings at any time.
          </p>
        </div>

        <div className="mt-10">
          <PricingCards
            onCta={(p) => {
              setPlan(p);
              setTrialOpen(true);
            }}
          />
        </div>

        {/* Enterprise / custom line */}
        <div className="mx-auto mt-10 max-w-[820px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/60 p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Federations, leagues and universities</h2>
              <p className="mt-1.5 max-w-[540px] text-sm leading-relaxed text-[var(--text-secondary)]">
                Running a league, a university programme or a national federation? We build multi-workspace rollouts
                with shared evidence standards, invoiced billing in AED, and on-site onboarding in Dubai.
              </p>
            </div>
            <a
              href="mailto:sales@seriesight.ae?subject=Seriesight%20for%20organisations"
              className="signal-gradient inline-flex min-h-[44px] shrink-0 items-center rounded-lg px-5 py-2.5 text-sm font-semibold text-[#06121c] transition-opacity hover:opacity-90"
            >
              Talk to sales
            </a>
          </div>
        </div>

        <PricingFaq />
      </main>
      <SiteFooter />
      <TrialDialog open={trialOpen} onOpenChange={setTrialOpen} initialPlan={plan} />
    </div>
  );
}
