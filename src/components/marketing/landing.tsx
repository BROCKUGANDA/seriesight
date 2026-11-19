"use client";

/**
 * Seriesight fixture-demo landing page (hash route `#/`).
 * The page describes the interactive demo without implying live data access,
 * commercial availability, or unauthenticated production readiness.
 */
import { SiteHeader, SiteFooter } from "./site-chrome";
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
  BookGlyph,
  TeamGlyph,
  FilmGlyph,
  CalendarGlyph,
} from "@/components/icons/seriesight-icons";
import { FAQS, HOWTO_STEPS, CONTACT_EMAIL } from "@/lib/commercial";
import { useHashRoute } from "@/hooks/use-hash-route";
import { Tilt3D, Reveal, StaggerContainer, RevealItem, Magnetic, Beat } from "@/components/fx/motion";

const WORKSPACES = [
  {
    glyph: ApertureGlyph,
    name: "Command Center",
    route: "dashboard" as const,
    copy: "Fixture-based prep overview with evidence-linked counts, priority scouting notes and draft shortcuts.",
  },
  {
    glyph: RadarGlyph,
    name: "Opponent Intelligence",
    route: "scouting" as const,
    copy: "Inspect opponent pick/ban tendencies, sample sizes and the evidence records behind available findings.",
  },
  {
    glyph: TimelineGlyph,
    name: "Macro Atlas",
    route: "macro" as const,
    copy: "Review covered match events and objective timing in the fixture dataset.",
  },
  {
    glyph: PickGlyph,
    name: "Draft Room",
    route: "draft" as const,
    copy: "Run versioned pick-and-ban actions with standard, hard and soft Fearless settings.",
  },
  {
    glyph: SeriesGlyph,
    name: "Series Lab",
    route: "series-lab" as const,
    copy: "Inspect multi-game Fearless restrictions and compare how a pick changes the next-game pool.",
  },
  {
    glyph: BookGlyph,
    name: "Playbook",
    route: "playbook" as const,
    copy: "Organize draft ideas, team goals and match notes in the workspace.",
  },
  {
    glyph: TeamGlyph,
    name: "Player Hub",
    route: "players" as const,
    copy: "Review roster profiles, player goals and coach notes from illustrative fixture records.",
  },
  {
    glyph: FilmGlyph,
    name: "VOD Review",
    route: "vod" as const,
    copy: "Use the VOD workspace to organize review notes and timestamped moments.",
  },
  {
    glyph: CalendarGlyph,
    name: "Practice Planner",
    route: "practice" as const,
    copy: "Keep practice activities and staff preparation notes together in one view.",
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
    copy: "Review provider status and the server-side GRID integration settings.",
  },
  {
    glyph: CompositionGlyph,
    name: "Workspace Settings",
    route: "settings" as const,
    copy: "Set local workspace preferences, including reduced motion and haptic feedback.",
  },
];

const TICKER_ITEMS = [
  "Command Center",
  "Opponent Intelligence",
  "Macro Atlas",
  "Draft Room",
  "Series Lab",
  "Playbook",
  "Player Hub",
  "VOD Review",
  "Practice Planner",
  "Evidence Ledger",
  "Fixture Data",
  "Evidence IDs",
  "Versioned Drafts",
];

function SectionHeading({ id, eyebrow, title, lede }: { id?: string; eyebrow: string; title: string; lede: string }) {
  return (
    <div className="mx-auto max-w-[760px] text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--accent-cyan)]">{eyebrow}</p>
      <h2 id={id} className="editorial-title mt-3 text-3xl tracking-tight text-[var(--text-primary)] sm:text-4xl">{title}</h2>
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
  const openDemo = () => navigate("signin");

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-void)]">
      <SiteHeader />

      <main id="main" className="flex-1">
        {/* ---------------------------------------------------------- Hero */}
        <section aria-labelledby="hero-title" className="relative overflow-hidden scanlines">
          <div aria-hidden="true" className="grid-floor pointer-events-none absolute inset-0" />
          <div className="relative mx-auto grid max-w-[1200px] items-center gap-10 px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:pb-24 lg:pt-20">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-[var(--accent-cyan)]">
                  League of Legends · pre-match
                </span>
                <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1 text-[11px] font-semibold tracking-wide text-[var(--text-secondary)]">
                  Fixture demo · no live feed
                </span>
              </div>

              <h1 id="hero-title" className="editorial-title mt-5 max-w-[760px] text-5xl leading-[0.98] tracking-tight text-[var(--text-primary)] sm:text-6xl lg:text-[76px]">
                Draft the next game with the <span className="volt-text">whole series in view.</span>
              </h1>

              {/* Answer-first lede: quotable by answer engines. */}
              <p className="mt-5 max-w-[620px] text-[15px] leading-relaxed text-[var(--text-secondary)] sm:text-base">
                Move from opponent tendencies to a versioned draft and see how finalized picks shape later games.
                Explore the workflow with labelled fixture data; it is an interactive product demo, not a live service
                or a source of official competition results.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Magnetic>
                  <button
                    type="button"
                    onClick={openDemo}
                    className="signal-gradient sheen press-fx min-h-[52px] w-full rounded-lg px-6 text-[15px] font-bold text-[#0e1405] shadow-lg transition-opacity hover:opacity-95 sm:w-auto"
                  >
                    Explore the fixture demo
                  </button>
                </Magnetic>
                <button
                  type="button"
                  onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}
                  className="press-fx min-h-[52px] rounded-lg border border-[var(--border-active)] bg-[var(--surface-2)] px-6 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent-cyan)]"
                >
                  See how the workflow works
                </button>
              </div>
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                No account or password is required to explore the local fixture workspace.
              </p>
            </div>

            <div className="hidden justify-center lg:flex" aria-hidden="true">
              <Tilt3D max={9} className="float-y">
                <SeriesCore size={380} />
              </Tilt3D>
            </div>
          </div>

          {/* Workspace ticker */}
          <div className="overflow-hidden border-y border-[var(--border-subtle)] bg-[var(--surface-1)]/40 py-2.5" aria-hidden="true">
            <div className="ticker-track">
              {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
                <span key={i} className="flex items-center whitespace-nowrap px-5 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  <span className="mr-5 h-1.5 w-1.5 rounded-full bg-[var(--accent-cyan)]/60" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/60">
            <dl className="mx-auto grid max-w-[1200px] gap-5 px-4 py-6 sm:grid-cols-3 sm:px-6">
              {[
                { label: "Data source", value: "Labelled fixture dataset" },
                { label: "Draft state", value: "Versioned server mutations" },
                { label: "Traceability", value: "Evidence record per metric" },
              ].map((item) => (
                <div key={item.label} className="border-l-2 border-[var(--accent-cyan)] pl-4">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{item.label}</dt>
                  <dd className="mt-1 text-sm font-medium text-[var(--text-primary)]">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ----------------------------------------------------- Product */}
        <section id="product" aria-labelledby="product-title" className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-20">
          <SectionHeading
            id="product-title"
            eyebrow="Product"
            title="One preparation loop, connected views"
            lede="Start with an opponent profile, move into a versioned pick-and-ban, and carry finalized picks into the next game. Supporting workspaces show the wider product direction; fixture data remains clearly labelled throughout this demo."
          />
          <StaggerContainer className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" gap={0.05}>
            {WORKSPACES.map((w) => {
              const Glyph = w.glyph;
              return (
                <RevealItem key={w.name}>
                  <Tilt3D max={5} className="h-full">
                    <article
                      className="group flex h-full flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/70 p-5 transition-colors hover:border-[var(--border-active)]"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--accent-cyan)] transition-colors group-hover:border-[var(--accent-cyan)]/40">
                        <Glyph size={20} />
                      </span>
                      <h3 className="mt-4 text-[15px] font-semibold text-[var(--text-primary)]">{w.name}</h3>
                      <p className="mt-2 flex-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">{w.copy}</p>
                      <button
                        type="button"
                        onClick={() => navigate(w.route)}
                        className="press-fx mt-4 inline-flex min-h-[40px] items-center gap-1.5 self-start text-[13px] font-medium text-[var(--accent-cyan)] transition-colors hover:text-[var(--accent-white)]"
                        aria-label={`Open ${w.name} in the demo workspace`}
                      >
                        Open in demo
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </article>
                  </Tilt3D>
                </RevealItem>
              );
            })}
          </StaggerContainer>
        </section>

        {/* ------------------------------------------ Flagship experience */}
        <section aria-labelledby="experience-title" className="border-y border-[var(--border-subtle)] bg-[var(--bg-primary)]/50">
          <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-20">
            <SectionHeading
              id="experience-title"
              eyebrow="What is working in this demo"
              title="A draft workflow you can inspect"
              lede="The interface makes state visible: see the current action, track completion, assign pick roles, and understand why a champion is unavailable before finalizing a game."
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: "Versioned draft actions",
                  copy: "Every board mutation sends the expected state version; stale writes are rejected instead of silently overwriting newer picks.",
                },
                {
                  title: "Fearless carry-over",
                  copy: "Finalized picks shape later game availability according to the selected series ruleset.",
                },
                {
                  title: "Evidence you can open",
                  copy: "Fixture statistics link to records that identify their source and covered games.",
                },
                {
                  title: "Clear recovery states",
                  copy: "When a catalogue or recommendation request fails, the Draft Room offers a retry without discarding the board.",
                },
                {
                  title: "Fixture labels stay visible",
                  copy: "Sample data is identified as illustrative so it cannot be mistaken for an official live competition feed.",
                },
                {
                  title: "Responsive navigation",
                  copy: "Desktop navigation and a compact mobile tab bar keep the same workspace routes reachable across screen sizes.",
                },
              ].map((f) => (
                <Reveal key={f.title}>
                  <article className="h-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/70 p-5">
                    <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-cyan)]" aria-hidden="true" />
                      {f.title}
                    </h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">{f.copy}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- How it works */}
        <section id="how" aria-labelledby="how-title" className="border-y border-[var(--border-subtle)] bg-[var(--bg-primary)]/50">
          <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-20">
            <SectionHeading
              id="how-title"
              eyebrow="How it works"
              title="From opponent read to series plan"
              lede="Use the fixture workspace to explore the intended match-day sequence, then inspect each result and its state transitions."
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
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--accent-cyan)]">Responsive interface</p>
              <h2 id="mobile-title" className="editorial-title mt-3 text-3xl tracking-tight text-[var(--text-primary)] sm:text-4xl">
                A board that stays readable at every size
              </h2>
              <p className="mt-4 max-w-[560px] text-[15px] leading-relaxed text-[var(--text-secondary)]">
                The demo adapts its navigation and board layout for smaller screens. It is not an offline application,
                and network-backed draft actions require the configured service to be available.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Mobile workspace tabs keep the primary destinations within reach.",
                  "The navigation drawer supports Escape, focus return and keyboard movement.",
                  "Draft progress and readiness are described for assistive technology.",
                  "Browser storage failures do not trap the demo at a loading screen.",
                  "Reduced-motion preferences are respected by interface transitions.",
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
                    <span className="rounded-full bg-[var(--accent-cyan)]/15 px-2 py-0.5 text-[9px] font-semibold text-[var(--accent-cyan)]">DEMO</span>
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
                    <span className="text-[11px] font-semibold text-[var(--accent-cyan)]">Finalize when ready</span>
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
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--accent-cyan)]">Data &amp; deployment</p>
                <h2 id="uae-title" className="editorial-title mt-3 text-3xl tracking-tight text-[var(--text-primary)] sm:text-4xl">
                  Know what the demo includes—and what it does not
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-[var(--text-secondary)]">
                  The workspace uses independently authored, labelled fixture data. It is not a live feed, a source of
                  official match results, or a production-ready multi-tenant service.
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-secondary)]">
                  Before a public commercial deployment, add authentication, workspace authorization, rate limiting,
                  approved outbound destinations, monitoring and verified backup procedures.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  { title: "Fixture-labelled", copy: "The demo does not mix its sample records into official-data views." },
                  { title: "Evidence-linked", copy: "Dashboard metrics expose evidence IDs that resolve to source records and covered games." },
                  { title: "Credential-aware", copy: "GRID credentials stay server-side; provider access depends on deployment configuration and data terms." },
                  { title: "Not production-ready", copy: "Authentication, ownership checks and request throttling are not implemented in this demo." },
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

        {/* ------------------------------------------------------ License */}
        <section id="pricing" aria-labelledby="pricing-title" className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-20">
          <SectionHeading
            id="pricing-title"
            eyebrow="License & availability"
            title="A public demo, not a paid service"
            lede="This repository is licensed under the Business Source License 1.1. Redistribution and non-production use follow the license; production use requires the separate authorization described there. Experimental billing APIs are unauthenticated and are not for use with real funds."
          />
          <div className="mx-auto mt-10 grid max-w-[900px] gap-4 sm:grid-cols-2">
            <a href="https://github.com/BROCKUGANDA/seriesight/blob/staging/LICENSE" target="_blank" rel="noreferrer" className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5 transition-colors hover:border-[var(--accent-cyan)]">
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Read the source license</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">Review the BSL 1.1 parameters, change date and change license before redistribution or deployment.</p>
            </a>
            <a href="https://github.com/BROCKUGANDA/seriesight/blob/staging/docs/SECURITY.md" target="_blank" rel="noreferrer" className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5 transition-colors hover:border-[var(--accent-cyan)]">
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Review deployment boundaries</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">Authentication, workspace ownership, HTTP throttling and outbound destination controls remain required for public deployment.</p>
            </a>
          </div>
          <p className="mt-6 text-center text-[13px] text-[var(--text-muted)]">There is no supported public payment flow. Do not expose the experimental billing endpoints or use them with real funds.</p>
        </section>

        {/* --------------------------------------------------- Judge route */}
        <section aria-labelledby="voices-title" className="border-y border-[var(--border-subtle)] bg-[var(--bg-primary)]/50">
          <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-20">
            <SectionHeading
              id="voices-title"
              eyebrow="Judge walkthrough"
              title="Three minutes through the core loop"
              lede="Follow the same evidence-to-draft path the interface is built around; every step stays inside the labelled fixture workspace."
            />
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {[
                { title: "01 · Read the evidence", copy: "Open the Command Center and select a metric’s evidence chip to inspect its fixture source.", route: "dashboard" as const },
                { title: "02 · Make a draft choice", copy: "Enter the Draft Room, choose an available champion, and watch the versioned board advance.", route: "draft" as const },
                { title: "03 · Carry picks forward", copy: "Finalize a complete game and inspect how the selected Fearless rules affect the next game.", route: "series-lab" as const },
              ].map((step) => (
                <article key={step.title} className="flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6">
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--accent-cyan)]">{step.title}</h3>
                  <p className="mt-3 flex-1 text-[14px] leading-relaxed text-[var(--text-secondary)]">{step.copy}</p>
                  <button type="button" onClick={() => navigate(step.route)} className="mt-5 min-h-[44px] self-start text-[13px] font-semibold text-[var(--accent-cyan)] underline underline-offset-4">Open this workspace</button>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-20">
          <SectionHeading
            id="faq-title"
            eyebrow="FAQ"
            title="Questions, answered directly"
            lede="The answers below are the same ones we publish to search and answer engines — plain, specific and current."
          />
          <LandingFaq />
        </section>

        {/* --------------------------------------------------- Final CTA */}
        <section aria-labelledby="cta-title" className="relative overflow-hidden border-t border-[var(--border-subtle)] scanlines">
          <div aria-hidden="true" className="grid-floor pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-[860px] px-4 py-16 text-center sm:px-6 lg:py-24">
            <Beat className="mx-auto w-fit">
              <span className="rounded-full border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-[var(--accent-cyan)]">
                Explore the labelled fixture workspace
              </span>
            </Beat>
            <h2 id="cta-title" className="mt-5 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
              Put the next pick <span className="volt-text">in context.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-[620px] text-[15px] leading-relaxed text-[var(--text-secondary)]">
              Follow evidence into the Draft Room and see how a finalized game affects the next one. The data is
              illustrative, and this release does not provide paid accounts or production authorization.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Magnetic>
                <button
                  type="button"
                  onClick={openDemo}
                  className="signal-gradient sheen press-fx min-h-[52px] rounded-lg px-6 text-[15px] font-bold text-[#0e1405] shadow-lg transition-opacity hover:opacity-95"
                >
                  Explore the demo
                </button>
              </Magnetic>
              <button
                type="button"
                onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
                className="press-fx min-h-[52px] rounded-lg border border-[var(--border-active)] bg-[var(--surface-2)] px-6 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent-cyan)]"
              >
                Read license terms
              </button>
            </div>
            <p className="mt-4 text-xs text-[var(--text-muted)]">
              For commercial-use authorization, contact <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--accent-cyan)] underline underline-offset-2">{CONTACT_EMAIL}</a>.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
