"use client";

/**
 * Global application shell (PRD D1): left nav 248px, top command bar 64px,
 * flexible content, responsive down to 390px. Selected nav state is visible
 * via colour + glyph + underline (never colour alone).
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

export function AppShell({ children }: { children: ReactNode }) {
  const [route, navigate] = useHashRoute();
  const toast = useWorkspaceStore((s) => s.toast);
  const clearToast = useWorkspaceStore((s) => s.clearToast);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 3600);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  return (
    <div className="flex min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-[var(--surface-3)] focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>

      {/* Left navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-void)]/90 backdrop-blur transition-transform lg:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Primary navigation"
      >
        <div className="flex h-16 items-center border-b border-[var(--border-subtle)] px-5">
          <button type="button" onClick={() => navigate("dashboard")} className="text-left" aria-label="Seriesight home">
            <SeriesightWordmark />
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
                  setMobileNavOpen(false);
                }}
                aria-current={active ? "page" : undefined}
                data-active={active}
                className={`nav-underline flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
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
            Illustrative fixture data. Not actual Cloud9 performance and not an official GRID dataset.
          </p>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-screen w-full flex-col lg:pl-[248px]">
        {/* Command bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-void)]/80 px-4 backdrop-blur lg:px-6">
          <button
            type="button"
            className="rounded-md border border-[var(--border-subtle)] px-2 py-1.5 text-xs lg:hidden"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-expanded={mobileNavOpen}
            aria-label="Toggle navigation"
          >
            Menu
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
              Seriesight Demo Workspace
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">Patch 16.10 · Cloud9 × JetBrains Sky&apos;s the Limit 2026 — Category 2 submission</p>
          </div>
          <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 font-mono text-[11px] text-[var(--text-muted)] md:flex">
            <span>workspace</span>
            <span aria-hidden="true">/</span>
            <span className="text-[var(--accent-cyan)]">{route}</span>
          </nav>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 lg:px-6">
          {children}
        </main>

        <footer className="mt-auto border-t border-[var(--border-subtle)] px-6 py-4 text-[11px] text-[var(--text-muted)]">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2">
            <span>Seriesight — pre-match coaching intelligence. Does not lock picks or inject into the live game.</span>
            <span className="font-mono">v1.0 · analytics-1.0.0</span>
          </div>
        </footer>
      </div>

      {/* Global evidence drawer (PRD D7) */}
      <GlobalEvidenceDrawer />

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm shadow-xl ${
            toast.tone === "ok"
              ? "border-[var(--accent-green)]/50 bg-[var(--surface-3)] text-[var(--text-primary)]"
              : toast.tone === "warn"
                ? "border-[var(--accent-amber)]/50 bg-[var(--surface-3)] text-[var(--accent-amber)]"
                : "border-[var(--accent-coral)]/50 bg-[var(--surface-3)] text-[var(--accent-coral)]"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
