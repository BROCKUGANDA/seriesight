"use client";

/**
 * Global application shell (PRD D1): left nav 248px on desktop (≥lg), a
 * bottom tab bar with safe-area insets on phones/tablets (<lg), top command
 * bar 64px, flexible content. Selected nav state is visible via colour +
 * glyph + underline (never colour alone). Every control carries a label.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useHashRoute, type WorkspaceRoute } from "@/hooks/use-hash-route";
import { useWorkspaceStore } from "@/store/workspace";
import { SeriesightWordmark } from "@/components/brand/logo";
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
import { FixtureBadge } from "@/components/common/primitives";
import { GlobalEvidenceDrawer } from "@/components/common/evidence-drawer";

const NAV: { id: WorkspaceRoute; label: string; glyph: (p: { size?: number }) => ReactNode; hint: string }[] = [
  { id: "dashboard", label: "Command Center", glyph: ApertureGlyph, hint: "Preparation overview" },
  { id: "scouting", label: "Opponent Intelligence", glyph: RadarGlyph, hint: "Tendencies & profiles" },
  { id: "macro", label: "Macro Atlas", glyph: TimelineGlyph, hint: "Objective & timeline analytics" },
  { id: "draft", label: "Draft Room", glyph: PickGlyph, hint: "Pick/ban workspace" },
  { id: "series-lab", label: "Series Lab", glyph: SeriesGlyph, hint: "Fearless series simulation" },
  { id: "evidence", label: "Evidence Ledger", glyph: EvidenceGlyph, hint: "Provenance for every finding" },
  { id: "data-sources", label: "Data Sources", glyph: ImportGlyph, hint: "GRID & fixture connections" },
  { id: "settings", label: "Workspace Settings", glyph: CompositionGlyph, hint: "Roles, haptics, retention" },
];

/** Bottom tab bar: the four highest-traffic destinations + "All workspaces". */
const TABS: { id: WorkspaceRoute; label: string; glyph: (p: { size?: number }) => ReactNode }[] = [
  { id: "dashboard", label: "Home", glyph: ApertureGlyph },
  { id: "scouting", label: "Scout", glyph: RadarGlyph },
  { id: "draft", label: "Draft", glyph: PickGlyph },
  { id: "series-lab", label: "Series", glyph: SeriesGlyph },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [route, navigate] = useHashRoute();
  const toast = useWorkspaceStore((s) => s.toast);
  const clearToast = useWorkspaceStore((s) => s.clearToast);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 4200);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  // Close the nav drawer on Escape for keyboard users.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  const activeLabel = NAV.find((n) => n.id === route)?.label ?? "Command Center";

  return (
    <div className="flex min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-[var(--surface-3)] focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>

      {/* Backdrop for the drawer nav (mobile + tablet) */}
      {navOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-label="Close navigation"
        />
      )}

      {/* Left navigation — drawer on <lg, fixed column on ≥lg */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[272px] max-w-[86vw] flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-void)]/95 backdrop-blur transition-transform lg:z-40 lg:translate-x-0 lg:bg-[var(--bg-void)]/90 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Primary navigation"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-5">
          <button type="button" onClick={() => navigate("dashboard")} className="text-left" aria-label="Seriesight home — Command Center">
            <SeriesightWordmark />
          </button>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] lg:hidden"
            aria-label="Close navigation"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV.map((item) => {
            const active = route === item.id;
            const Glyph = item.glyph;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  navigate(item.id);
                  setNavOpen(false);
                }}
                aria-current={active ? "page" : undefined}
                data-active={active}
                className={`nav-underline flex min-h-[48px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  active
                    ? "bg-[var(--surface-2)] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)]"
                }`}
              >
                <span className={active ? "text-[var(--accent-cyan)]" : "text-[var(--text-muted)]"}>
                  <Glyph size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium leading-tight">{item.label}</span>
                  <span className="block truncate text-[10px] leading-tight text-[var(--text-muted)]">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-[var(--border-subtle)] px-4 py-3">
          <FixtureBadge className="w-full justify-center" />
          <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
            Illustrative fixture dataset. Not actual team performance and not an official GRID dataset.
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px]">
            <button type="button" onClick={() => navigate("pricing")} className="text-[var(--accent-cyan)] hover:underline">
              Pricing
            </button>
            <button type="button" onClick={() => navigate("terms")} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Terms
            </button>
            <button type="button" onClick={() => navigate("privacy")} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Privacy
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-screen w-full flex-col lg:pl-[248px]">
        {/* Command bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-void)]/85 px-4 backdrop-blur lg:px-6">
          <button
            type="button"
            className="flex min-h-[40px] items-center gap-2 rounded-md border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] lg:hidden"
            onClick={() => setNavOpen(true)}
            aria-expanded={navOpen}
            aria-label="Open workspace navigation"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Menu
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{activeLabel}</p>
            <p className="hidden text-[11px] text-[var(--text-muted)] sm:block">
              Seriesight Demo Workspace · Patch 16.10 · Cloud9 × JetBrains Sky&apos;s the Limit 2026 — Category 2 submission
            </p>
          </div>
          <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 font-mono text-[11px] text-[var(--text-muted)] md:flex">
            <span>workspace</span>
            <span aria-hidden="true">/</span>
            <span className="text-[var(--accent-cyan)]">{route}</span>
          </nav>
        </header>

        <main
          id="main-content"
          className="mx-auto w-full max-w-[1600px] flex-1 px-3 pb-28 pt-4 sm:px-4 sm:pt-6 lg:px-6 lg:pb-6"
        >
          {children}
        </main>

        <footer className="mt-auto border-t border-[var(--border-subtle)] px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] py-3 text-[11px] text-[var(--text-muted)] lg:pb-3 lg:px-6">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2">
            <span className="max-w-[60ch]">
              Seriesight — pre-match coaching intelligence. Does not lock picks or inject into the live game.
            </span>
            <span className="flex items-center gap-3">
              <button type="button" onClick={() => navigate("pricing")} className="text-[var(--accent-cyan)] hover:underline">
                Pricing
              </button>
              <button type="button" onClick={() => navigate("terms")} className="hover:text-[var(--text-secondary)]">
                Terms
              </button>
              <button type="button" onClick={() => navigate("privacy")} className="hover:text-[var(--text-secondary)]">
                Privacy
              </button>
              <span className="font-mono">v1.0 · analytics-1.0.0</span>
            </span>
          </div>
        </footer>
      </div>

      {/* Bottom tab bar (phones + tablets <lg) with iOS safe-area padding */}
      <nav
        aria-label="Primary workspace tabs"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--bg-void)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="grid grid-cols-5">
          {TABS.map((tab) => {
            const active = route === tab.id;
            const Glyph = tab.glyph;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigate(tab.id)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 px-2 pt-1.5 ${
                  active ? "text-[var(--accent-cyan)]" : "text-[var(--text-muted)]"
                }`}
              >
                <Glyph size={20} />
                <span className="text-[10px] font-medium leading-none">{tab.label}</span>
                <span
                  aria-hidden="true"
                  className={`mt-0.5 h-0.5 w-8 rounded-full ${active ? "bg-[var(--accent-cyan)]" : "bg-transparent"}`}
                />
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-expanded={navOpen}
            aria-haspopup="dialog"
            className={`flex min-h-[56px] flex-col items-center justify-center gap-1 px-2 pt-1.5 ${
              ["macro", "evidence", "data-sources", "settings"].includes(route) ? "text-[var(--accent-cyan)]" : "text-[var(--text-muted)]"
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="5" cy="12" r="1.8" fill="currentColor" />
              <circle cx="12" cy="12" r="1.8" fill="currentColor" />
              <circle cx="19" cy="12" r="1.8" fill="currentColor" />
            </svg>
            <span className="text-[10px] font-medium leading-none">More</span>
            <span
              aria-hidden="true"
              className={`mt-0.5 h-0.5 w-8 rounded-full ${
                ["macro", "evidence", "data-sources", "settings"].includes(route) ? "bg-[var(--accent-cyan)]" : "bg-transparent"
              }`}
            />
          </button>
        </div>
      </nav>

      {/* Global evidence drawer (PRD D7) */}
      <GlobalEvidenceDrawer />

      {/* Toast — dismissible, positioned above the tab bar on mobile */}
      {toast && (
        <div
          role={toast.tone === "error" ? "alert" : "status"}
          aria-live={toast.tone === "error" ? "assertive" : "polite"}
          className={`fixed bottom-20 right-4 z-50 flex max-w-[calc(100vw-32px)] items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-xl sm:bottom-5 sm:right-5 sm:max-w-sm ${
            toast.tone === "ok"
              ? "border-[var(--accent-green)]/50 bg-[var(--surface-3)] text-[var(--text-primary)]"
              : toast.tone === "warn"
                ? "border-[var(--accent-amber)]/50 bg-[var(--surface-3)] text-[var(--accent-amber)]"
                : "border-[var(--accent-coral)]/50 bg-[var(--surface-3)] text-[var(--accent-coral)]"
          }`}
        >
          <span className="min-w-0 flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={clearToast}
            aria-label="Dismiss notification"
            className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
