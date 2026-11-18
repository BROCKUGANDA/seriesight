"use client";

/**
 * Seriesight commercial landing page (hash route `#/`).
 * Structure is answer-first for AEO: each section opens with a direct,
 * quotable statement before elaborating. GEO signals (Dubai, UAE, MENA,
 * AED, Gulf Standard Time) appear in visible copy, not just metadata.
 */
import { useState } from "react";
import { SiteHeader, SiteFooter } from "./site-chrome";
import { PricingCards } from "./pricing";
import { TrialDialog } from "./trial-dialog";
import { SeriesCore } from "@/components/brand/logo";
import {
  ApertureGlyph,
  RadarGlyph,
  TimelineGlyph,
  PickGlyph,
  SeriesGlyph,
  EvidenceGlyph,
  ImportGlyph,
  CompositionGlyph,
} from "@/components/icons/seriesight-icons";
import { FAQS, HOWTO_STEPS, TRIAL_DAYS, CONTACT_EMAIL } from "@/lib/commercial";
import { useHashRoute } from "@/hooks/use-hash-route";

const WORKSPACES = [
  {
    glyph: ApertureGlyph,
    name: "Command Center",
    route: "dashboard" as const,
    copy: "One preparation overview: verified dataset metrics, the top-3 priority intelligence items and one-click draft preparation.",
  },
  {
    glyph: RadarGlyph,
    name: "Opponent Intelligence",
    route: "scouting" as const,
    copy: "Pick/ban frequencies with Wilson 95% intervals, engine-detected tendencies and player pools — every claim carries evidence.",
  },
  {
    glyph: TimelineGlyph,
    name: "Macro Atlas",
    route: "macro" as const,
    copy: "Six objective modules with configurable interval breakdowns and a clickable per-game event timeline.",
  },
  {
    glyph: PickGlyph,
    name: "Draft Room",
    route: "draft" as const,
    copy: "A deterministic pick/ban engine for BO1, BO3 and BO5 with Hard, Soft and Standard Fearless rulesets.",
  },
  {
    glyph: SeriesGlyph,
    name: "Series Lab",
    route: "series-lab" as const,
    copy: "The five-game series board where a pick in game one visibly reshapes what is possible in game two.",
  },
  {
    glyph: EvidenceGlyph,
    name: "Evidence Ledger",
    route: "evidence" as const,
    copy: "Every statistic resolves to a provenance record with numerator, denominator and confidence interval.",
  },
  {
    glyph: ImportGlyph,
    name: "Data Sources",
    route: "data-sources" as const,
    copy: "GRID Open Access import through a hardened server-side adapter — credentials never reach the browser.",
  },
  {
    glyph: CompositionGlyph,
    name: "Workspace Settings",
    route: "settings" as const,
    copy: "Role policies, haptics, reduced-motion and data-retention controls for your whole coaching staff.",
  },
];

const STATS = [
  { value: "17", label: "tournament series" },
  { value: "47", label: "games incl. full BO5s" },
  { value: "95%", label: "Wilson confidence intervals" },
  { value: "44px", label: "minimum touch targets" },
  { value: "0.86s", label: "workspace boot to content" },
];

const TESTIMONIALS = [
  {
    quote:
      "The restriction ledger alone is worth it. We used to track Fearless bans in a spreadsheet — now the Series Lab shows us game-two fallout before ban phase even starts.",
    name: "A. Rahimi",
    role: "Head Coach, Signal Nine Academy (demo squad)",
  },
  {
    quote:
      "Every tendency card links to its evidence. If I quote a number to my players, I can show the denominator behind it in one tap.",
    name: "M. Haddad",
    role: "Performance Analyst, Nova Vanguard (fixture team)",
  },
  {
    quote:
      "We prepare on iPads at the venue and review on the big screen back at the bootcamp. The layout holds on both.",
    name: "J. Okonkwo",
    role: "Coach, Dubai Nomads Esports (trial programme)",
  },
];

function SectionHeading({ eyebrow, title, lede }: { eyebrow: string; title: string; lede: string }) {
  return (
    <div className="mx-auto max-w-[760px] text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--accent-cyan)]">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl md:text-[34px]">{title}</h2>
      <p className="mx-auto mt-4 max-w-[680px] text-[15px] leading-relaxed text-[var(--text-secondary)]">{lede}</p>
    </div>
  );
}

function LandingFaq() {
  return (
    <div className="mx-auto mt-10 max-w-[820px]">
      <div className="divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/60">
        {FAQS.map((f, i) => (
          <details key={f.question} className="group px-5 py-4" open={i === 0}>
            <summary className="cursor-pointer list-none text-[15px] font-medium text-[var(--text-primary)]">
              <span className="flex items-center justify-between gap-4">
                {f.question}
                <span className="shrink-0 text-[var(--text-muted)] transition-transform group-open:rotate-45" aria-hidden="true">
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
    </div>
  );
}

export function LandingPage() {
  const [, navigate] = useHashRoute();
  const [trialOpen, setTrialOpen] = useState(false);
  const [plan, setPlan] = useState<"scout" | "coach" | "org">("coach");

  const openTrial = (p?: "scout" | "coach" | "org") => {
    setPlan(p ?? "coach");
    setTrialOpen(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-void)]">
      <SiteHeader />

      <main id="main" className="flex-1">
        {/* ---------------------------------------------------------- Hero */}
        <section aria-labelledby="hero-title" className="relative overflow-hidden">
          <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:pb-24 lg:pt-20">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-[var(--accent-cyan)]">
                  Built in Dubai, UAE
                </span>
                <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1 text-[11px] font-semibold tracking-wide text-[var(--text-secondary)]">
                  Pricing in AED
                </span>
                <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1 text-[11px] font-semibold tracking-wide text-[var(--text-secondary)]">
                  Works on phone, tablet, desktop
                </span>
              </div>

              <h1 id="hero-title" className="mt-5 text-4xl font-bold leading-[1.08] tracking-tight text-[var(--text-primary)] sm:text-5xl lg:text-[56px]">
                The series,{" "}
                <span className="signal-text">in focus.</span>
              </h1>

              {/* Answer-first lede: quotable by answer engines. */}
              <p className="mt-5 max-w-[620px] text-[15px] leading-relaxed text-[var(--text-secondary)] sm:text-base">
                Seriesight is a League of Legends coaching platform that turns tournament history into pre-match
                preparation: opponent scouting with evidence-backed tendencies, macro objective analytics, a
                deterministic Fearless Draft engine and a five-game Series Lab. It runs in your browser — installed as
                an app on phones and tablets, or full-screen on the bootcamp desktop.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => openTrial()}
                  className="signal-gradient min-h-[48px] rounded-lg px-6 text-sm font-semibold text-[#06121c] transition-opacity hover:opacity-90"
                >
                  Start your {TRIAL_DAYS}-day free trial
                </button>
                <button
                  type="button"
                  onClick={() => navigate("dashboard")}
                  className="min-h-[48px] rounded-lg border border-[var(--border-active)] bg-[var(--surface-2)] px-6 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent-cyan)]"
                >
                  Explore the live demo
                </button>
              </div>
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                No credit card required · {TRIAL_DAYS}-day trial on paid plans · Demo runs on an illustrative fixture dataset
              </p>
            </div>

            <div className="hidden justify-center lg:flex" aria-hidden="true">
              <SeriesCore size={380} />
            </div>
          </div>

          {/* Stats strip */}
          <div className="border-y border-[var(--border-subtle)] bg-[var(--bg-primary)]/60">
            <dl className="mx-auto grid max-w-[1200px] grid-cols-2 gap-x-4 gap-y-5 px-4 py-6 sm:grid-cols-3 sm:px-6 md:grid-cols-5">
              {STATS.map((s) => (
                <div key={s.label} className="text-center">
                  <dt className="order-2 mt-1 block text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{s.label}</dt>
                  <dd className="tnum order-1 text-2xl font-semibold text-[var(--text-primary)]">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ----------------------------------------------------- Product */}
        <section id="product" aria-labelledby="product-title" className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-20">
          <SectionHeading
            eyebrow="Product"
            title="Eight workspaces, one preparation pipeline"
            lede="Seriesight replaces the spreadsheet-and-screenshots preparation stack. Each workspace feeds the next, and every number you present to players can be traced to its provenance in one tap."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WORKSPACES.map((w) => {
              const Glyph = w.glyph;
              return (
                <article
                  key={w.name}
                  className="group flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/70 p-5 transition-colors hover:border-[var(--border-active)]"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--accent-cyan)]">
                    <Glyph size={20} />
                  </span>
                  <h3 className="mt-4 text-[15px] font-semibold text-[var(--text-primary)]">{w.name}</h3>
                  <p className="mt-2 flex-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">{w.copy}</p>
                  <button
                    type="button"
                    onClick={() => navigate(w.route)}
                    className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 self-start text-[13px] font-medium text-[var(--accent-cyan)] transition-colors hover:text-[var(--accent-white)]"
                    aria-label={`Open ${w.name} in the demo workspace`}
                  >
                    Open in demo
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        {/* -------------------------------------------------- How it works */}
        <section id="how" aria-labelledby="how-title" className="border-y border-[var(--border-subtle)] bg-[var(--bg-primary)]/50">
          <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-20">
            <SectionHeading
              eyebrow="How it works"
              title="From raw history to a five-game plan"
              lede="A repeatable preparation loop your staff can run every week — the same five steps the demo workspace performs end-to-end."
            />
            <ol className="mx-auto mt-10 max-w-[860px] space-y-4">
              {HOWTO_STEPS.map((step, i) => (
                <li key={step.name} className="flex gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/70 p-5">
                  <span className="tnum flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--accent-cyan)]/50 bg-[var(--accent-cyan)]/10 text-sm font-semibold text-[var(--accent-cyan)]">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{step.name}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------- Mobile and tablets */}
        <section aria-labelledby="mobile-title" className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--accent-cyan)]">Mobile &amp; tablets</p>
              <h2 id="mobile-title" className="mt-3 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                Preparation that follows you to the venue
              </h2>
              <p className="mt-4 max-w-[560px] text-[15px] leading-relaxed text-[var(--text-secondary)]">
                Seriesight is designed mobile-first, then scaled up. Install it to your phone or tablet home screen as
                a Progressive Web App, and the whole workspace — scouting, draft room, series lab — is usable between
                games without a laptop.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Installable PWA with offline-friendly brand shell and app icons on iOS, Android and iPadOS.",
                  "Bottom tab navigation and 44px minimum touch targets sized for bench-side use.",
                  "Tables and timelines scroll horizontally in place — never clipped, never squeezed.",
                  "Haptic confirmation on picks and bans where the device supports it.",
                  "Reduced-motion support honoured from the operating system setting.",
                ].map((item) => (
                  <li key={item} className="flex gap-3 text-[14px] leading-relaxed text-[var(--text-secondary)]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--accent-green)]">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative mx-auto w-full max-w-[420px]" aria-hidden="true">
              {/* Stylised device frames (pure CSS, no screenshots needed) */}
              <div className="rounded-[28px] border border-[var(--border-active)] bg-[var(--surface-1)] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
                <div className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-void)] p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--text-muted)]">SERIESIGHT · DRAFT</span>
                    <span className="rounded-full bg-[var(--accent-cyan)]/15 px-2 py-0.5 text-[9px] font-semibold text-[var(--accent-cyan)]">G5</span>
                  </div>
                  <div className="mt-4 space-y-2.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className={`h-8 flex-1 rounded-md border ${i < 2 ? "border-[var(--accent-cyan)]/50 bg-[var(--accent-cyan)]/10" : "border-[var(--border-subtle)] bg-[var(--surface-2)]"}`} />
                        <div className={`h-8 w-8 rounded-md border ${i < 2 ? "border-[var(--accent-violet)]/50 bg-[var(--accent-violet)]/10" : "border-[var(--border-subtle)] bg-[var(--surface-2)]"}`} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)]/70" />
                    ))}
                  </div>
                  <div className="mt-4 rounded-md border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/8 px-3 py-2.5 text-center">
                    <span className="text-[11px] font-semibold text-[var(--accent-cyan)]">Finalize game five</span>
                  </div>
                </div>
              </div>
              <div className="absolute -right-3 top-10 hidden w-32 rotate-3 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-void)] p-2.5 shadow-xl sm:block">
                <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3">
                  <div className="h-2 w-14 rounded bg-[var(--accent-cyan)]/60" />
                  <div className="mt-2 space-y-1.5">
                    <div className="h-1.5 w-full rounded bg-[var(--surface-3)]" />
                    <div className="h-1.5 w-4/5 rounded bg-[var(--surface-3)]" />
                    <div className="h-1.5 w-3/5 rounded bg-[var(--surface-3)]" />
                  </div>
                  <div className="mt-3 h-14 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)]" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ UAE & MENA */}
        <section aria-labelledby="uae-title" className="border-y border-[var(--border-subtle)] bg-[var(--bg-primary)]/50">
          <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-20">
            <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--accent-cyan)]">UAE &amp; MENA</p>
                <h2 id="uae-title" className="mt-3 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                  Built in Dubai, for teams across the region
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-[var(--text-secondary)]">
                  Seriesight is built and operated from Dubai Silicon Oasis. Coaching staff across the UAE, Saudi
                  Arabia and the wider MENA region get dirham pricing, Gulf Standard Time support hours and a team
                  that understands the local competitive calendar.
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-secondary)]" lang="ar" dir="rtl">
                  سيريسايت منصة إماراتية لإعداد فرق دوري الأساطير: تحليل المنافسين، إدارة درافت بلا خوف، وأدلة
                  على كل رقم — بأسعار بالدرهم الإماراتي ودعم بتوقيت الخليج.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  { title: "AED pricing, no surprises", copy: "Plans quoted in dirham, 5% VAT handled transparently, invoiced billing for organisations." },
                  { title: "Gulf Standard Time support", copy: "Sun–Thu 09:00–18:00 GST, one-business-day response on Coach, same-day on Organisation." },
                  { title: "Regional rollout support", copy: "Onboarding sessions delivered remotely or on-site in Dubai for staff programmes." },
                  { title: "Data done properly", copy: "GRID Open Access through a server-side adapter; no licensed raw data is stored or resold." },
                ].map((card) => (
                  <article key={card.title} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/70 p-5">
                    <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{card.title}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">{card.copy}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ Pricing */}
        <section id="pricing" aria-labelledby="pricing-title" className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-20">
          <SectionHeading
            eyebrow="Pricing"
            title="Straightforward plans in dirham"
            lede="Start free on the fixture dataset. Upgrade when your staff is ready — every paid plan includes a 14-day trial, VAT quoted transparently, cancel any time."
          />
          <div className="mt-10">
            <PricingCards
              onCta={(p) => {
                if (p === "scout") navigate("dashboard");
                else openTrial(p);
              }}
            />
          </div>
          <p className="mt-6 text-center text-[13px] text-[var(--text-muted)]">
            Full plan comparison, annual billing and enterprise rollout options on the{" "}
            <a href="#/pricing" className="text-[var(--accent-cyan)] underline underline-offset-2">pricing page</a>.
          </p>
        </section>

        {/* ------------------------------------------------- Testimonials */}
        <section aria-labelledby="voices-title" className="border-y border-[var(--border-subtle)] bg-[var(--bg-primary)]/50">
          <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-20">
            <SectionHeading
              eyebrow="From the demo programme"
              title="What preparation teams highlight"
              lede="Feedback themes from the demo and trial programme. Personas reference the illustrative fixture teams that ship with the demo dataset."
            />
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {TESTIMONIALS.map((t) => (
                <figure key={t.name} className="flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/70 p-6">
                  <blockquote className="flex-1 text-[14px] leading-relaxed text-[var(--text-secondary)]">
                    “{t.quote}”
                  </blockquote>
                  <figcaption className="mt-5 border-t border-[var(--border-subtle)] pt-4">
                    <p className="text-[13px] font-semibold text-[var(--text-primary)]">{t.name}</p>
                    <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{t.role}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-20">
          <SectionHeading
            eyebrow="FAQ"
            title="Questions, answered directly"
            lede="The answers below are the same ones we publish to search and answer engines — plain, specific and current."
          />
          <LandingFaq />
        </section>

        {/* --------------------------------------------------- Final CTA */}
        <section aria-labelledby="cta-title" className="relative overflow-hidden border-t border-[var(--border-subtle)]">
          <div className="mx-auto max-w-[860px] px-4 py-16 text-center sm:px-6 lg:py-24">
            <h2 id="cta-title" className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
              Walk into ban phase <span className="signal-text">already decided.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-[620px] text-[15px] leading-relaxed text-[var(--text-secondary)]">
              Start with the Scout plan on the fixture dataset, or request a {TRIAL_DAYS}-day trial for your coaching
              staff. We activate workspaces within one business day, Gulf Standard Time.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => openTrial()}
                className="signal-gradient min-h-[48px] rounded-lg px-6 text-sm font-semibold text-[#06121c] transition-opacity hover:opacity-90"
              >
                Request {TRIAL_DAYS}-day trial
              </button>
              <button
                type="button"
                onClick={() => navigate("dashboard")}
                className="min-h-[48px] rounded-lg border border-[var(--border-active)] bg-[var(--surface-2)] px-6 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent-cyan)]"
              >
                Explore the demo first
              </button>
            </div>
            <p className="mt-4 text-xs text-[var(--text-muted)]">
              Prefer email? Write to <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--accent-cyan)] underline underline-offset-2">{CONTACT_EMAIL}</a>.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
      <TrialDialog open={trialOpen} onOpenChange={setTrialOpen} initialPlan={plan} />
    </div>
  );
}
