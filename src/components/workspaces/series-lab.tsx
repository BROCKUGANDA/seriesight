"use client";

/**
 * Series Lab (PRD D6) — the signature feature. Five-game interactive series board
 * with progressive Fearless availability, counterfactual cloning and the series
 * strategy map (Game 1 choices → restrictions → next-game pool).
 */
import { useCallback, useEffect, useState } from "react";
import { ApiClientError, apiFetch, apiPost } from "@/lib/api-client";
import { Panel, EmptyState, SkeletonBlock, StatTile, ConfidenceBadge } from "@/components/common/primitives";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SeriesGlyph, HardFearlessGlyph, SoftFearlessGlyph, CounterfactualGlyph, RiskGlyph, PickGlyph, BanGlyph } from "@/components/icons/seriesight-icons";
import { useWorkspaceStore, haptic } from "@/store/workspace";
import type { DraftSession, FearlessMode, SeriesFormat } from "@/domain/types";
import { getChampion } from "@/fixtures/champions";

interface RestrictionsPayload {
  sessionId: string;
  mode: FearlessMode;
  scope: string;
  restrictions: { gameNumber: number; introducedByTeam: Record<string, string[]>; poolRemaining: number; restrictedNext: string[] }[];
}
interface CounterfactualPayload {
  base: { gameNumber: number; picks: string[]; restrictedForNext: string[]; poolRemaining: number };
  variant: { gameNumber: number; picks: string[]; restrictedForNext: string[]; poolRemaining: number };
  delta: { newlyAvailable: string[]; newlyRestricted: string[] };
}
interface TeamRow { id: string; shortName: string; name?: string; isOurTeam: boolean }

export function SeriesLab() {
  const activeSession = useWorkspaceStore((s) => s.activeSession);
  const setActiveSession = useWorkspaceStore((s) => s.setActiveSession);
  const pushToast = useWorkspaceStore((s) => s.pushToast);
  const hapticsEnabled = useWorkspaceStore((s) => s.hapticsEnabled);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [cfgOpponent, setCfgOpponent] = useState("NVX");
  const [cfgMode, setCfgMode] = useState<"hard" | "soft" | "none">("hard");
  const [cfgFormat, setCfgFormat] = useState<SeriesFormat>("BO5");
  const [restrictions, setRestrictions] = useState<RestrictionsPayload | null>(null);
  const [cf, setCf] = useState<CounterfactualPayload | null>(null);
  const [cfSource, setCfSource] = useState<{ gameNumber: number; remove: string } | null>(null);
  const [cfAdd, setCfAdd] = useState("ksante");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [progressHelpOpen, setProgressHelpOpen] = useState(false);

  useEffect(() => {
    apiFetch<TeamRow[]>("/api/teams").then(setTeams).catch(() => setTeams([]));
  }, []);

  const loadRestrictions = useCallback((sessionId: string) => {
    apiFetch<RestrictionsPayload>(`/api/draft/sessions/${sessionId}/restrictions`).then(setRestrictions).catch(() => setRestrictions(null));
  }, []);

  useEffect(() => {
    if (activeSession) loadRestrictions(activeSession.id);
    else setRestrictions(null);
  }, [activeSession, loadRestrictions]);

  const createSeries = async () => {
    setBusy(true);
    setError(null);
    try {
      const rulesetId = cfgMode === "none" ? `std-${cfgFormat.toLowerCase()}` : `ff-${cfgMode}-${cfgFormat.toLowerCase()}`;
      const s = await apiPost<DraftSession>("/api/draft/sessions", {
        opponentTeamId: cfgOpponent,
        format: cfgFormat,
        rulesetId,
        modeOverride: cfgMode,
      });
      setActiveSession(s);
      setCf(null);
      setCfSource(null);
      pushToast(`Series Lab ready — ${cfgFormat} vs ${cfgOpponent}.`);
      haptic("pick", hapticsEnabled);
    } catch (e) {
      setError(e instanceof ApiClientError ? e : new ApiClientError({ code: "INTERNAL_ERROR", message: "Failed to create series.", retryable: true, recovery: "Retry." }));
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    if (!activeSession) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiPost<{ session: DraftSession }>(`/api/draft/sessions/${activeSession.id}/next-game`, {
        expectedStateVersion: activeSession.stateVersion,
      });
      setActiveSession(result.session);
      pushToast(`Game ${result.session.currentGame} opened — availability recalculated.`);
      haptic("complete", hapticsEnabled);
    } catch (e) {
      setError(e instanceof ApiClientError ? e : null);
    } finally {
      setBusy(false);
    }
  };

  const runCounterfactual = async (gameNumber: number, remove: string) => {
    if (!activeSession) return;
    setBusy(true);
    try {
      const result = await apiPost<CounterfactualPayload>("/api/series-lab/counterfactual", {
        sessionId: activeSession.id,
        baseGameNumber: gameNumber,
        removeChampionId: remove,
        addChampionId: cfAdd,
      });
      setCf(result);
      setCfSource({ gameNumber, remove });
    } catch (e) {
      pushToast(
        e instanceof ApiClientError
          ? `The simulation could not run — ${e.message} (${e.code}). ${e.recovery ?? "Finalize the game first, then retry."}`
          : "The simulation could not run. Check your connection and try again.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const session = activeSession;
  const maxGames = session ? (session.format === "BO1" ? 1 : session.format === "BO3" ? 3 : 5) : 5;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Series Lab</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
            Simulate strategy evolution across an entire series. A pick in one game changes the strategic possibilities of the next — Seriesight calculates those restrictions automatically.
          </p>
        </div>
        {session && (
          <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--text-muted)]">
            <span className="rounded border border-[var(--border-subtle)] px-2 py-1">{session.format} vs {session.opponentTeamId}</span>
            <span className="rounded border border-[var(--border-subtle)] px-2 py-1">{session.mode === "none" ? "standard" : `${session.mode} fearless`}</span>
          </div>
        )}
      </header>

      {/* Create series */}
      {!session && (
        <Panel title="Start a series simulation" subtitle="Configure the Fearless ruleset, then draft game by game">
          {error && <p role="alert" className="mb-3 rounded border border-[var(--accent-coral)]/40 bg-[var(--accent-coral)]/10 px-3 py-2 text-xs text-[var(--accent-coral)]">{error.message}</p>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              Opponent
              <select value={cfgOpponent} onChange={(e) => setCfgOpponent(e.target.value)} className="cfg-select" aria-label="Opponent">
                {teams.filter((t) => !t.isOurTeam).map((t) => <option key={t.id} value={t.id}>{t.shortName} — {t.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              Format
              <select value={cfgFormat} onChange={(e) => setCfgFormat(e.target.value as SeriesFormat)} className="cfg-select" aria-label="Format">
                {["BO3", "BO5"].map((f) => <option key={f}>{f}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              Fearless ruleset
              <select value={cfgMode} onChange={(e) => setCfgMode(e.target.value as "hard" | "soft" | "none")} className="cfg-select" aria-label="Fearless ruleset">
                <option value="hard">Hard / Full Fearless (both teams)</option>
                <option value="soft">Soft Fearless (own picks)</option>
                <option value="none">Standard draft</option>
              </select>
            </label>
          </div>
          <button type="button" onClick={createSeries} disabled={busy} className="mt-4 rounded-lg border border-[var(--accent-violet)]/60 bg-[var(--accent-violet)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--accent-violet)] disabled:opacity-50">
            {busy ? "Creating…" : "Create series board"}
          </button>
        </Panel>
      )}

      {session && (
        <>
          {error && <p role="alert" className="rounded border border-[var(--accent-coral)]/40 bg-[var(--accent-coral)]/10 px-3 py-2 text-xs text-[var(--accent-coral)]">{error.message} — {error.recovery}</p>}

          {/* Five-game board */}
          <Panel
            title="Series board"
            subtitle={`Games 1–${maxGames} · each panel shows draft status, selections and introduced restrictions`}
            actions={
              session.games.some((g) => g.status === "finalized") && session.currentGame < maxGames ? (
                <button type="button" onClick={advance} disabled={busy} className="rounded-md border border-[var(--accent-cyan)]/60 bg-[var(--accent-cyan)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent-cyan)]">
                  Advance to Game {session.currentGame + 1}
                </button>
              ) : null
            }
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {Array.from({ length: maxGames }).map((_, i) => {
                const n = i + 1;
                const g = session.games.find((x) => x.gameNumber === n);
                const active = session.currentGame === n;
                const restr = restrictions?.restrictions.find((r) => r.gameNumber === n);
                return (
                  <article
                    key={n}
                    aria-label={`Game ${n}`}
                    className={`flex flex-col gap-2.5 rounded-xl border p-3.5 ${
                      active
                        ? "active-trace border-[var(--accent-violet)]/60 bg-[var(--accent-violet)]/[0.06]"
                        : g
                          ? "border-[var(--border-subtle)] bg-[var(--surface-1)]/70"
                          : "border-dashed border-[var(--border-subtle)] bg-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${active ? "text-[var(--accent-violet)]" : g ? "text-[var(--text-primary)]" : "text-[var(--text-disabled)]"}`}>
                        <SeriesGlyph size={14} /> Game {n}
                      </span>
                      {g ? (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${g.status === "finalized" ? "bg-[var(--accent-green)]/10 text-[var(--accent-green)]" : "bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]"}`}>
                          {g.status === "finalized" ? "drafted" : "drafting"}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--text-disabled)]">locked</span>
                      )}
                    </div>
                    {g ? (
                      <>
                        <div className="grid grid-cols-5 gap-1">
                          {(g.blueTeamId === session.ourTeamId ? g.blue.picks : g.red.picks).map((p, idx) => (
                            <div key={idx} className="flex h-8 items-center justify-center rounded border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10" title={getChampion(p.championId)?.displayName}>
                              <span className="truncate px-1 text-[9px] text-[var(--text-primary)]">{getChampion(p.championId)?.displayName.slice(0, 6)}</span>
                            </div>
                          ))}
                          {Array.from({ length: 5 - (g.blueTeamId === session.ourTeamId ? g.blue.picks.length : g.red.picks.length) }).map((_, idx) => (
                            <div key={`e${idx}`} className="h-8 rounded border border-dashed border-[var(--border-subtle)]" />
                          ))}
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Restrictions introduced</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(restr?.introducedByTeam[session.ourTeamId] ?? []).map((c) => (
                              <span key={c} className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-secondary)]" title={getChampion(c)?.displayName}>
                                {getChampion(c)?.displayName.slice(0, 9) ?? c}
                              </span>
                            ))}
                            {(restr?.introducedByTeam[session.ourTeamId] ?? []).length === 0 && <span className="text-[10px] text-[var(--text-disabled)]">none yet</span>}
                          </div>
                        </div>
                        {restr && (
                          <p className="tnum mt-auto text-[10px] text-[var(--text-muted)]">
                            Remaining pool for this game: <span className="font-semibold text-[var(--text-primary)]">{restr.poolRemaining}</span> of 80
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                        Drafted after Game {n - 1} is finalized. Restrictions from earlier games will apply automatically.
                      </p>
                    )}
                    <textarea
                      value={notes[n] ?? ""}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [n]: e.target.value }))}
                      placeholder="Strategy notes…"
                      aria-label={`Strategy notes for game ${n}`}
                      className="mt-1 min-h-[46px] rounded border border-[var(--border-subtle)] bg-[var(--surface-2)]/70 px-2 py-1.5 text-[10px] text-[var(--text-secondary)] placeholder:text-[var(--text-disabled)]"
                    />
                  </article>
                );
              })}
            </div>
            {session.currentGame > 1 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setRouteSafe("draft")} className="min-h-[44px] rounded-md border border-[var(--border-active)] px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
                  Open Game {session.currentGame} in the Draft Room
                </button>
                <button type="button" onClick={() => setProgressHelpOpen(true)} className="min-h-[44px] rounded-md border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
                  How does progression work?
                </button>
              </div>
            )}
          </Panel>

          {/* Series strategy map */}
          <Panel title="Series strategy map" subtitle="Game 1 choices → restrictions → next-game pool → adaptation">
            {restrictions && restrictions.restrictions.length > 0 ? (
              <div className="overflow-x-auto pb-2">
                <svg viewBox="0 0 900 220" className="min-w-[720px]" role="img" aria-label="Series strategy map connecting picks to restrictions across games">
                  <defs>
                    <linearGradient id="map-line" x1="0" x2="1">
                      <stop offset="0%" stopColor="#C6FF3E" />
                      <stop offset="100%" stopColor="#9D7BFF" />
                    </linearGradient>
                  </defs>
                  {restrictions.restrictions.map((r, i) => {
                    const x = 70 + i * 190;
                    const introduced = Object.values(r.introducedByTeam).flat().length;
                    return (
                      <g key={r.gameNumber}>
                        <line x1={x} y1="110" x2={x + 150} y2="110" stroke="url(#map-line)" strokeWidth="2" strokeDasharray={i < restrictions.restrictions.length - 1 ? "6 4" : undefined} opacity="0.7" />
                        <circle cx={x} cy="110" r="26" fill="var(--surface-2)" stroke={r.gameNumber === session.currentGame ? "#9D7BFF" : "#464C5E"} strokeWidth={r.gameNumber === session.currentGame ? 2.5 : 1.2} />
                        <text x={x} y="114" textAnchor="middle" fill="#F5F7FB" fontSize="13" fontWeight="600">G{r.gameNumber}</text>
                        <text x={x} y="66" textAnchor="middle" fill="#C3CAD8" fontSize="10">picks locked</text>
                        <text x={x} y="80" textAnchor="middle" fill="#C6FF3E" fontSize="12" fontWeight="700">{introduced}</text>
                        <text x={x} y="150" textAnchor="middle" fill="#8D96A9" fontSize="10">pool</text>
                        <text x={x} y="166" textAnchor="middle" fill="#FFC46B" fontSize="12" fontWeight="700">{r.poolRemaining}</text>
                      </g>
                    );
                  })}
                  {restrictions.restrictions.length > 0 &&
                    (() => {
                      const last = restrictions.restrictions[restrictions.restrictions.length - 1];
                      const x = 70 + (restrictions.restrictions.length - 1) * 190 + 150;
                      return (
                        <g>
                          <circle cx={x} cy="110" r="22" fill="var(--surface-1)" stroke="#3FE8A4" strokeWidth="1.4" />
                          <text x={x} y="106" textAnchor="middle" fill="#3FE8A4" fontSize="9">next</text>
                          <text x={x} y="118" textAnchor="middle" fill="#3FE8A4" fontSize="9">{last.poolRemaining} champs</text>
                        </g>
                      );
                    })()}
                  <text x="20" y="20" fill="#8D96A9" fontSize="10">Fearless mode: {restrictions.mode !== "none" ? `${restrictions.mode} (scope ${restrictions.scope})` : "standard"}</text>
                </svg>
              </div>
            ) : (
              <EmptyState title="Strategy map waiting" message="Finalize Game 1 to populate the restriction flow across the series." />
            )}
          </Panel>

          {/* Counterfactual */}
          <Panel
            title="Counterfactual simulator"
            subtitle="Clone a drafted game, swap one pick, and diff the Fearless fallout for the next game"
            actions={
              <div className="flex items-center gap-2">
                <label htmlFor="cf-add" className="text-[10px] uppercase text-[var(--text-muted)]">Replacement pick</label>
                <select id="cf-add" value={cfAdd} onChange={(e) => setCfAdd(e.target.value)} className="min-h-[44px] rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2 text-sm">
                  {["ksante", "rumble", "ornn", "jax", "camille", "vi", "sejuani", "azir", "orianna", "ashe", "jinx", "nautilus", "rakan", "thresh"].map((id) => (
                    <option key={id} value={id}>{getChampion(id)?.displayName ?? id}</option>
                  ))}
                </select>
              </div>
            }
          >
            {cf && cfSource ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {[cf.base, cf.variant].map((v, idx) => (
                  <div key={idx} className={`rounded-xl border p-4 ${idx === 0 ? "border-[var(--border-subtle)] bg-[var(--surface-2)]/60" : "border-[var(--accent-violet)]/50 bg-[var(--accent-violet)]/[0.06]"}`}>
                    <p className="text-xs font-semibold text-[var(--text-primary)]">{idx === 0 ? "Actual Game 1" : `Counterfactual (${getChampion(cfSource.remove)?.displayName} → ${getChampion(cfAdd)?.displayName})`}</p>
                    <p className="mt-2 flex flex-wrap gap-1.5">
                      {v.picks.map((p) => (
                        <span key={p} className={`rounded px-2 py-0.5 text-[10px] ${idx === 1 && p === cfAdd ? "bg-[var(--accent-violet)]/25 text-[var(--accent-violet)]" : idx === 1 && p === cfSource.remove ? "hidden" : "bg-[var(--surface-3)] text-[var(--text-secondary)]"}`}>
                          {getChampion(p)?.displayName ?? p}
                        </span>
                      ))}
                    </p>
                    <p className="tnum mt-3 text-[11px] text-[var(--text-muted)]">Game 2 pool: <span className="font-semibold text-[var(--text-primary)]">{v.poolRemaining}</span> champions · {v.restrictedForNext.length} locked</p>
                  </div>
                ))}
                <div className="rounded-xl border border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/[0.05] p-4">
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-amber)]"><CounterfactualGlyph size={14} /> Divergence</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                    Newly available in Game 2: {cf.delta.newlyAvailable.length > 0 ? cf.delta.newlyAvailable.map((c) => getChampion(c)?.displayName).join(", ") : "none"}.
                    <br />
                    Newly restricted: {cf.delta.newlyRestricted.length > 0 ? cf.delta.newlyRestricted.map((c) => getChampion(c)?.displayName).join(", ") : "none"}.
                  </p>
                  <p className="tnum mt-2 text-[11px] text-[var(--text-muted)]">Pool delta: {cf.variant.poolRemaining - cf.base.poolRemaining >= 0 ? "+" : ""}{cf.variant.poolRemaining - cf.base.poolRemaining} champions</p>
                </div>
              </div>
            ) : (
              <EmptyState
                title="No counterfactual yet"
                message="Pick a locked champion from a drafted game below. The simulator clones the board and compares restriction propagation."
              />
            )}
            <div className="mt-4">
              <p className="mb-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Clone from a drafted game</p>
              <div className="flex flex-wrap gap-2">
                {session.games.filter((g) => g.status === "finalized").length === 0 && (
                  <p className="text-xs text-[var(--text-muted)]">Finalize at least one game to enable cloning.</p>
                )}
                {session.games.filter((g) => g.status === "finalized").map((g) =>
                  (g.blueTeamId === session.ourTeamId ? g.blue.picks : g.red.picks).map((p) => (
                    <button
                      key={`${g.gameNumber}-${p.championId}`}
                      type="button"
                      disabled={busy}
                      onClick={() => runCounterfactual(g.gameNumber, p.championId)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2 text-[11px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-violet)]"
                    >
                      <PickGlyph size={12} />
                      G{g.gameNumber}: swap out {getChampion(p.championId)?.displayName}
                    </button>
                  )),
                )}
              </div>
            </div>
          </Panel>

          {/* Series stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Games drafted" value={`${session.games.filter((g) => g.status === "finalized").length}/${maxGames}`} detail="finalized draft boards" />
            <StatTile label="Fearless locks" value={restrictions?.restrictions.reduce((s, r) => s + Object.values(r.introducedByTeam).flat().length, 0) ?? 0} detail="champions removed from the pool" tone="violet" />
            <StatTile label="Current pool" value={restrictions?.restrictions.at(-1)?.poolRemaining ?? 80} detail="champions available next" tone="accent" />
            <StatTile label="Session version" value={`v${session.stateVersion}`} detail="optimistic-concurrency stamp" />
          </div>
        </>
      )}

      {!session && (
        <Panel title="How the Fearless Lab works">
          <ul className="grid gap-2 text-xs leading-relaxed text-[var(--text-secondary)] md:grid-cols-2">
            <li className="flex items-start gap-2"><HardFearlessGlyph size={14} /> <span><strong className="text-[var(--text-primary)]">Hard Fearless:</strong> any champion picked by either team in an earlier game is unavailable to both teams afterwards.</span></li>
            <li className="flex items-start gap-2"><SoftFearlessGlyph size={14} /> <span><strong className="text-[var(--text-primary)]">Soft Fearless:</strong> a team cannot re-pick its own earlier picks; the opponent&apos;s picks stay available.</span></li>
            <li className="flex items-start gap-2"><BanGlyph size={14} /> <span>Bans, picks and Fearless restrictions are tracked as separate states — bans never count as completed picks.</span></li>
            <li className="flex items-start gap-2"><RiskGlyph size={14} /> <span>Restrictions reset per series configuration; tournament rules may differ — Seriesight lets the coach configure each ruleset explicitly.</span></li>
          </ul>
        </Panel>
      )}

      {/* Progression explanation — replaces the previous one-line toast dead-end */}
      <Dialog open={progressHelpOpen} onOpenChange={setProgressHelpOpen}>
        <DialogContent className="max-h-[86dvh] overflow-y-auto border-[var(--border-subtle)] bg-[var(--bg-primary)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-primary)]">How series progression works</DialogTitle>
            <DialogDescription className="text-[var(--text-secondary)]">
              Four gates take a series board from empty to finalized, game by game.
            </DialogDescription>
          </DialogHeader>
          <ol className="mt-1 space-y-3 text-sm leading-relaxed text-[var(--text-secondary)]">
            <li className="flex gap-3">
              <span className="tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--accent-cyan)]/50 text-xs font-semibold text-[var(--accent-cyan)]">1</span>
              <span><strong className="text-[var(--text-primary)]">Draft all 20 actions.</strong> Every ban and pick in the tournament sequence must be locked before the game can close.</span>
            </li>
            <li className="flex gap-3">
              <span className="tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--accent-cyan)]/50 text-xs font-semibold text-[var(--accent-cyan)]">2</span>
              <span><strong className="text-[var(--text-primary)]">Assign a role to every pick.</strong> Open roles block finalization so the evidence ledger stays attributable.</span>
            </li>
            <li className="flex gap-3">
              <span className="tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--accent-cyan)]/50 text-xs font-semibold text-[var(--accent-cyan)]">3</span>
              <span><strong className="text-[var(--text-primary)]">Finalize the game.</strong> The board locks, and Fearless restrictions propagate to the following game automatically.</span>
            </li>
            <li className="flex gap-3">
              <span className="tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--accent-cyan)]/50 text-xs font-semibold text-[var(--accent-cyan)]">4</span>
              <span><strong className="text-[var(--text-primary)]">Advance.</strong> The next game unlocks on the Series board and in the Draft Room with the updated champion pool.</span>
            </li>
          </ol>
          <p className="mt-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 px-3 py-2.5 text-xs leading-relaxed text-[var(--text-muted)]">
            Progress is never guessed: a game stays “drafting” until its 20 actions and role assignments are complete, so the restriction ledger always reflects verified boards only.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function setRouteSafe(route: "draft") {
  window.location.hash = `/${route}`;
}
