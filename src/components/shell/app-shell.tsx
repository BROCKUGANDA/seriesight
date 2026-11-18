"use client";

/**
 * Global application shell (PRD D1): left nav 248px on desktop (≥lg), a
 * bottom tab bar with safe-area insets on phones/tablets (<lg), top command
 * bar 64px, flexible content. Selected nav state is visible via colour +
 * glyph + underline (never colour alone). Every control carries a label.
 *
 * VOLT ARENA additions: user session chip with sign-out, staff notification
 * centre, ⌘K command palette and haptic feedback on every navigation action.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useHashRoute, type WorkspaceRoute } from "@/hooks/use-hash-route";
import { useWorkspaceStore, haptic } from "@/store/workspace";
import { useAuthStore } from "@/store/auth";
import { useCoachStore } from "@/store/coach";
import { SeriesightWordmark } from "@/components/brand/logo";
import {
  ApertureGlyph,
  RadarGlyph,
  TimelineGlyph,
  PickGlyph,
  SeriesGlyph,
  EvidenceGlyph,
  ImportGlyph,
  BookGlyph,
  TeamGlyph,
  FilmGlyph,
  CalendarGlyph,
  CompositionGlyph,
  SeamGlyph,
} from "@/components/icons/seriesight-icons";
import { FixtureBadge } from "@/components/common/primitives";
import { GlobalEvidenceDrawer } from "@/components/common/evidence-drawer";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

const NAV: { id: WorkspaceRoute; label: string; glyph: (p: { size?: number }) => ReactNode; hint: string; group: string }[] = [
  { id: "dashboard", label: "Command Center", glyph: ApertureGlyph, hint: "Preparation overview", group: "Prepare" },
  { id: "scouting", label: "Opponent Intelligence", glyph: RadarGlyph, hint: "Tendencies & profiles", group: "Prepare" },
  { id: "macro", label: "Macro Atlas", glyph: TimelineGlyph, hint: "Objective & timeline analytics", group: "Prepare" },
  { id: "draft", label: "Draft Room", glyph: PickGlyph, hint: "Pick/ban workspace", group: "Compete" },
  { id: "series-lab", label: "Series Lab", glyph: SeriesGlyph, hint: "Fearless series simulation", group: "Compete" },
  { id: "playbook", label: "Playbook", glyph: BookGlyph, hint: "Strategies & match briefs", group: "Compete" },
  { id: "players", label: "Player Hub", glyph: TeamGlyph, hint: "Roster form & goals", group: "Develop" },
  { id: "vod", label: "VOD Review", glyph: FilmGlyph, hint: "Clip tagging & film sessions", group: "Develop" },
  { id: "practice", label: "Practice Planner", glyph: CalendarGlyph, hint: "Scrims, drills, veto meetings", group: "Develop" },
  { id: "evidence", label: "Evidence Ledger", glyph: EvidenceGlyph, hint: "Provenance for every finding", group: "Operate" },
  { id: "data-sources", label: "Data Sources", glyph: ImportGlyph, hint: "GRID & fixture connections", group: "Operate" },
  { id: "integration", label: "Integration Hub", glyph: SeamGlyph, hint: "Controllers, consumers, sinks & adapters", group: "Operate" },
  { id: "settings", label: "Workspace Settings", glyph: CompositionGlyph, hint: "Roles, haptics, retention", group: "Operate" },
];

/** Bottom tab bar: the four highest-traffic destinations + "All workspaces". */
const TABS: { id: WorkspaceRoute; label: string; glyph: (p: { size?: number }) => ReactNode }[] = [
  { id: "dashboard", label: "Home", glyph: ApertureGlyph },
  { id: "scouting", label: "Scout", glyph: RadarGlyph },
  { id: "draft", label: "Draft", glyph: PickGlyph },
  { id: "playbook", label: "Playbook", glyph: BookGlyph },
];

const MORE_ROUTES: WorkspaceRoute[] = ["macro", "series-lab", "players", "vod", "practice", "evidence", "data-sources", "integration", "settings"];

export function AppShell({ children }: { children: ReactNode }) {
  const [route, navigate] = useHashRoute();
  const toast = useWorkspaceStore((s) => s.toast);
  const clearToast = useWorkspaceStore((s) => s.clearToast);
  const pushToast = useWorkspaceStore((s) => s.pushToast);
  const hapticsEnabled = useWorkspaceStore((s) => s.hapticsEnabled);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const notifications = useCoachStore((s) => s.notifications);
  const markAllRead = useCoachStore((s) => s.markAllRead);
  const markRead = useCoachStore((s) => s.markRead);

  const [navOpen, setNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const unread = notifications.filter((n) => !n.read).length;

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

  // Global command palette: ⌘K / Ctrl+K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (r: WorkspaceRoute) => {
    navigate(r);
    setNavOpen(false);
    setPaletteOpen(false);
    setUserMenuOpen(false);
    setNotifOpen(false);
    haptic("pick", hapticsEnabled);
  };

  const activeLabel = NAV.find((n) => n.id === route)?.label ?? "Command Center";

  const runCommand = (cmd: string) => {
    switch (cmd) {
      case "signout":
        signOut();
        pushToast("Signed out — session cleared from this device.", "ok");
        break;
      case "pricing":
        go("pricing");
        break;
      default:
        go(cmd as WorkspaceRoute);
    }
  };

  const paletteItems: { id: string; label: string; hint?: string; group: string }[] = [
    ...NAV.map((n) => ({ id: n.id as string, label: n.label, hint: n.hint, group: n.group })),
    { id: "pricing", label: "Plans & pricing", hint: "Commercial overview", group: "Commercial" },
    { id: "signout", label: "Sign out of Seriesight", hint: "Clear this device session", group: "Account" },
  ];

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

      {/* Invisible backdrop that closes the header dropdowns on outside click */}
      {(notifOpen || userMenuOpen) && (
        <button
          type="button"
          className="fixed inset-0 z-30 cursor-default"
          onClick={() => {
            setNotifOpen(false);
            setUserMenuOpen(false);
          }}
          aria-label="Close menus"
          tabIndex={-1}
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
          <button type="button" onClick={() => go("dashboard")} className="text-left" aria-label="Seriesight home — Command Center">
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
          {["Prepare", "Compete", "Develop", "Operate"].map((group) => (
            <div key={group}>
              <p className="px-3 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">{group}</p>
              {NAV.filter((n) => n.group === group).map((item) => {
                const active = route === item.id;
                const Glyph = item.glyph;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => go(item.id)}
                    aria-current={active ? "page" : undefined}
                    data-active={active}
                    className={`nav-underline press-fx flex min-h-[48px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
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
            </div>
          ))}
        </nav>
        <div className="space-y-2 border-t border-[var(--border-subtle)] px-4 py-3">
          <FixtureBadge className="w-full justify-center" />
          <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
            Illustrative fixture dataset. Not actual team performance and not an official GRID dataset.
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px]">
            <button type="button" onClick={() => go("pricing")} className="text-[var(--accent-cyan)] hover:underline">
              Pricing
            </button>
            <button type="button" onClick={() => go("terms")} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Terms
            </button>
            <button type="button" onClick={() => go("privacy")} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Privacy
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-screen w-full flex-col lg:pl-[248px]">
        {/* Command bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-void)]/85 px-3 backdrop-blur sm:px-4 lg:px-6">
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

          {/* Command palette trigger */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="press-fx hidden min-h-[36px] items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[12px] text-[var(--text-muted)] transition-colors hover:border-[var(--border-active)] hover:text-[var(--text-secondary)] md:flex"
            aria-label="Open command palette (Cmd+K)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Search
            <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
          </button>

          {/* Notification centre */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setNotifOpen((v) => !v);
                setUserMenuOpen(false);
                if (!notifOpen && unread > 0) markAllRead();
                haptic("pick", hapticsEnabled);
              }}
              className="press-fx relative flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              aria-label={`Notifications — ${unread} unread`}
              aria-expanded={notifOpen}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10 19a2.2 2.2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              {unread > 0 && (
                <span className="tnum absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent-violet)] px-1 text-[10px] font-bold text-[#0e1405]">
                  {unread}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-12 z-50 w-[min(92vw,360px)] rounded-xl border border-[var(--border-active)] bg-[var(--surface-1)] shadow-2xl">
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-2.5">
                  <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-primary)]">Staff notifications</p>
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">{notifications.length} total</span>
                </div>
                <ul className="max-h-[320px] overflow-y-auto py-1">
                  {notifications.length === 0 && (
                    <li className="px-4 py-6 text-center text-[12px] text-[var(--text-muted)]">No notifications yet — results and alerts land here.</li>
                  )}
                  {notifications.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => {
                          markRead(n.id);
                          setNotifOpen(false);
                          if (n.title.includes("tendency")) go("scouting");
                          else if (n.title.includes("availability")) go("players");
                          else if (n.title.includes("scrim") || n.title.includes("Practice")) go("practice");
                        }}
                        className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ background: n.tone === "alert" ? "var(--accent-coral)" : n.tone === "success" ? "var(--accent-green)" : "var(--accent-cyan)", opacity: n.read ? 0.35 : 1 }}
                        />
                        <span className="min-w-0">
                          <span className={`block text-[12px] font-medium ${n.read ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"}`}>{n.title}</span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)]">{n.body}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* User chip + menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setUserMenuOpen((v) => !v);
                setNotifOpen(false);
                haptic("pick", hapticsEnabled);
              }}
              className="press-fx flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] py-1 pl-1 pr-2.5 transition-colors hover:border-[var(--border-active)]"
              aria-expanded={userMenuOpen}
              aria-label="Account menu"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md signal-gradient text-[12px] font-bold text-[#0e1405]">
                {(user?.name ?? "C").slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden min-w-0 text-left sm:block">
                <span className="block max-w-[140px] truncate text-[12px] font-semibold leading-tight text-[var(--text-primary)]">{user?.name ?? "Coach"}</span>
                <span className="block max-w-[140px] truncate text-[10px] leading-tight text-[var(--text-muted)]">{user?.kind === "judge" ? "Judge demo access" : "Coach access"}</span>
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-[var(--text-muted)]">
                <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-12 z-50 w-[min(92vw,280px)] rounded-xl border border-[var(--border-active)] bg-[var(--surface-1)] p-3 shadow-2xl">
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 px-3 py-2.5">
                  <p className="text-[13px] font-semibold text-[var(--text-primary)]">{user?.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{user?.email}</p>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{user?.role}</p>
                </div>
                <button
                  type="button"
                  onClick={() => go("settings")}
                  className="press-fx mt-2 flex min-h-[40px] w-full items-center gap-2 rounded-lg px-3 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
                >
                  <CompositionGlyph size={15} />
                  Workspace settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    signOut();
                    pushToast("Signed out — session cleared from this device.", "ok");
                  }}
                  className="press-fx mt-1 flex min-h-[40px] w-full items-center gap-2 rounded-lg px-3 text-[13px] text-[var(--accent-coral)] transition-colors hover:bg-[var(--accent-coral)]/10"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M14 4h4a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 18 20h-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M10 8 6 12l4 4M6 12h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
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
              <button type="button" onClick={() => go("pricing")} className="text-[var(--accent-cyan)] hover:underline">
                Pricing
              </button>
              <button type="button" onClick={() => go("terms")} className="hover:text-[var(--text-secondary)]">
                Terms
              </button>
              <button type="button" onClick={() => go("privacy")} className="hover:text-[var(--text-secondary)]">
                Privacy
              </button>
              <span className="font-mono">v2.0 · volt-arena</span>
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
                onClick={() => go(tab.id)}
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
              MORE_ROUTES.includes(route) ? "text-[var(--accent-cyan)]" : "text-[var(--text-muted)]"
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
              className={`mt-0.5 h-0.5 w-8 rounded-full ${MORE_ROUTES.includes(route) ? "bg-[var(--accent-cyan)]" : "bg-transparent"}`}
            />
          </button>
        </div>
      </nav>

      {/* Global evidence drawer (PRD D7) */}
      <GlobalEvidenceDrawer />

      {/* ⌘K command palette */}
      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen} title="Command palette" description="Jump to any workspace or run an action">
        <CommandInput placeholder="Search workspaces and actions…" />
        <CommandList>
          <CommandEmpty>No matching destination — try “draft”, “playbook” or “pricing”.</CommandEmpty>
          {["Prepare", "Compete", "Develop", "Operate", "Commercial", "Account"].map((group) => (
            <CommandGroup key={group} heading={group}>
              {paletteItems
                .filter((i) => i.group === group)
                .map((i) => (
                  <CommandItem key={i.id} onSelect={() => runCommand(i.id)}>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px]">{i.label}</span>
                      {i.hint && <span className="truncate text-[11px] text-[var(--text-muted)]">{i.hint}</span>}
                    </span>
                  </CommandItem>
                ))}
            </CommandGroup>
          ))}
          <CommandSeparator />
          <CommandGroup heading="Tip">
            <div className="px-2 py-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
              Press ⌘K (or Ctrl+K) anywhere to reopen the palette. Every workspace is one selection away.
            </div>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

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
