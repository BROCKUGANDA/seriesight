"use client";

/**
 * Commercial site chrome: sticky header + commercial footer shared by the
 * landing, pricing and legal pages. Footer implements the sticky-footer rule
 * (mt-auto inside a min-h-screen flex column) and carries the UAE company
 * identity, legal links and language markers.
 */
import { useState } from "react";
import { SeriesightWordmark } from "@/components/brand/logo";
import { useHashRoute } from "@/hooks/use-hash-route";
import { useAuthStore } from "@/store/auth";
import { COMPANY, CONTACT_EMAIL, TRIAL_DAYS } from "@/lib/commercial";
import { TrialDialog } from "./trial-dialog";

/** Module-level helpers — hash writes stay outside component render scope. */
function setHash(hash: string) {
  window.location.hash = hash;
}

function scrollToSection(href: string) {
  document.querySelector(href)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const HEADER_LINKS: { label: string; href: string }[] = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how" },
  { label: "Pricing", href: "#/pricing" },
  { label: "FAQ", href: "#faq" },
];

export function SiteHeader() {
  const [, navigate] = useHashRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const [trialOpen, setTrialOpen] = useState(false);
  const signedIn = useAuthStore((s) => s.user !== null);
  const user = useAuthStore((s) => s.user);

  // Anchor links only work on the landing page; if we are on pricing/legal,
  // first route home, then let the browser scroll to the anchor.
  const goSection = (href: string) => {
    setMenuOpen(false);
    const current = window.location.hash;
    const onLanding = current === "" || current === "#/" || current.startsWith("#product") || current.startsWith("#how") || current.startsWith("#faq");
    if (!onLanding) {
      setHash("/");
      requestAnimationFrame(() => {
        setTimeout(() => scrollToSection(href), 60);
      });
    } else {
      scrollToSection(href);
    }
  };

  const isHashLink = (href: string) => href.startsWith("#/");

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--bg-void)]/85 backdrop-blur">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-[var(--surface-3)] focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-4 px-4 sm:px-6">
        <button
          type="button"
          onClick={() => {
            setHash("/");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="shrink-0"
          aria-label="Seriesight — back to home"
        >
          <SeriesightWordmark compact />
        </button>

        <nav aria-label="Site" className="ml-4 hidden items-center gap-1 md:flex">
          {HEADER_LINKS.map((l) =>
            isHashLink(l.href) ? (
              <a
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)]"
              >
                {l.label}
              </a>
            ) : (
              <button
                key={l.href}
                type="button"
                onClick={() => goSection(l.href)}
                className="rounded-lg px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)]"
              >
                {l.label}
              </button>
            ),
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {signedIn ? (
            <button
              type="button"
              onClick={() => navigate("dashboard")}
              className="hidden min-h-[40px] rounded-lg border border-[var(--border-active)] bg-[var(--surface-2)] px-4 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-cyan)] sm:block"
            >
              Open workspace — {user?.name ?? "Coach"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate("signin")}
              className="hidden min-h-[40px] rounded-lg border border-[var(--border-active)] bg-[var(--surface-2)] px-4 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-cyan)] sm:block"
            >
              Judge demo · Sign in
            </button>
          )}
          <button
            type="button"
            onClick={() => setTrialOpen(true)}
            className="signal-gradient min-h-[40px] rounded-lg px-4 text-[13px] font-semibold text-[#0e1405] transition-opacity hover:opacity-90"
          >
            Start free trial
          </button>
          <button
            type="button"
            className="min-h-[40px] rounded-lg border border-[var(--border-subtle)] px-3 text-[var(--text-secondary)] md:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav aria-label="Site mobile" className="border-t border-[var(--border-subtle)] bg-[var(--bg-void)] px-4 py-3 md:hidden">
          {HEADER_LINKS.map((l) =>
            isHashLink(l.href) ? (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-3 py-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)]"
              >
                {l.label}
              </a>
            ) : (
              <button
                key={l.href}
                type="button"
                onClick={() => goSection(l.href)}
                className="block w-full rounded-lg px-3 py-3 text-left text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)]"
              >
                {l.label}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              navigate(signedIn ? "dashboard" : "signin");
            }}
            className="block w-full rounded-lg px-3 py-3 text-left text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)]"
          >
            {signedIn ? "Open workspace" : "Judge demo · Sign in"}
          </button>
        </nav>
      )}

      <TrialDialog open={trialOpen} onOpenChange={setTrialOpen} />
    </header>
  );
}

export function SiteFooter() {
  const [, navigate] = useHashRoute();
  const year = new Date().getFullYear();

  const productLinks: { label: string; onClick: () => void }[] = [
    { label: "Command Center", onClick: () => navigate("dashboard") },
    { label: "Opponent Intelligence", onClick: () => navigate("scouting") },
    { label: "Draft Room", onClick: () => navigate("draft") },
    { label: "Series Lab", onClick: () => navigate("series-lab") },
    { label: "Playbook · Player Hub · VOD", onClick: () => navigate("playbook") },
    { label: "Practice Planner", onClick: () => navigate("practice") },
    { label: "Evidence Ledger", onClick: () => navigate("evidence") },
  ];

  const companyLinks: { label: string; onClick: () => void }[] = [
    { label: "Pricing", onClick: () => navigate("pricing") },
    { label: "Terms of Service", onClick: () => navigate("terms") },
    { label: "Privacy Policy", onClick: () => navigate("privacy") },
    { label: "Data Sources & GRID", onClick: () => navigate("data-sources") },
    { label: "Workspace Settings", onClick: () => navigate("settings") },
  ];

  return (
    <footer className="mt-auto border-t border-[var(--border-subtle)] bg-[var(--bg-void)] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <SeriesightWordmark />
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-[var(--text-secondary)]">
              League of Legends coaching intelligence and Fearless Draft management — the series, in focus.
            </p>
            <p className="mt-3 text-[13px] text-[var(--text-muted)]" lang="ar" dir="rtl">
              منصة التحليل والتخطيط لفرق دوري الأساطير — انطلاقاً من دبي إلى العالم.
            </p>
          </div>

          <nav aria-label="Product links">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Product</p>
            <ul className="mt-3 space-y-2.5">
              {productLinks.map((l) => (
                <li key={l.label}>
                  <button type="button" onClick={l.onClick} className="text-[13px] text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-cyan)]">
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Company links">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Company</p>
            <ul className="mt-3 space-y-2.5">
              {companyLinks.map((l) => (
                <li key={l.label}>
                  <button type="button" onClick={l.onClick} className="text-[13px] text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-cyan)]">
                    {l.label}
                  </button>
                </li>
              ))}
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-[13px] text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-cyan)]">
                  Contact — {CONTACT_EMAIL}
                </a>
              </li>
            </ul>
          </nav>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Registered office</p>
            <address className="mt-3 text-[13px] not-italic leading-relaxed text-[var(--text-secondary)]">
              {COMPANY.legalName}
              <br />
              {COMPANY.addressLine}
              <br />
              {COMPANY.city}, {COMPANY.country}
            </address>
            <p className="mt-3 text-[12px] text-[var(--text-muted)]">
              Support hours Sun–Thu, 09:00–18:00 Gulf Standard Time (UTC+4).
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-6 text-[11px] text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} {COMPANY.legalName}. All rights reserved. Prices in AED, VAT exclusive.</span>
          <span className="font-mono">
            Demo runs on an illustrative fixture dataset — not official Riot Games or GRID data. {TRIAL_DAYS}-day trial on paid plans.
          </span>
        </div>
      </div>
    </footer>
  );
}
