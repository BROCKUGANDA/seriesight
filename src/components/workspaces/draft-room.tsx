"use client";

/**
 * Draft Room (PRD D5) — the primary interactive product demonstration.
 * Board state is validated locally (same engine semantics) and every mutation is
 * applied through the API with optimistic-concurrency version checks; the server
 * response is the single source of truth for the board.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, apiFetch, apiPost } from "@/lib/api-client";
import { Panel, EmptyState, SkeletonBlock, ErrorState, ConfidenceBadge, EvidenceChip } from "@/components/common/primitives";
import { ROLE_GLYPHS, PickGlyph, BanGlyph, HardFearlessGlyph, SoftFearlessGlyph, CompositionGlyph, ConfidenceGlyph, RiskGlyph, SeriesGlyph } from "@/components/icons/seriesight-icons";
import { useWorkspaceStore, haptic } from "@/store/workspace";
import type { Champion, DraftGameState, DraftSession, Recommendation, CompositionProfile, Role, Side } from "@/domain/types";
import { ALL_ROLES } from "@/domain/types";
import { getChampion } from "@/fixtures/champions";
import { formatPct } from "@/domain/analytics/stats";

interface ChampionCatalogue { champions: Champion[]; metadataVersion: string; metadataSource: string; warnings: string[] }
interface RecommendationsPayload { picks: Recommendation[]; bans: Recommendation[]; alternatives: CompositionProfile[] }
interface ActionResult { session: DraftSession; availability: Record<string, { available: boolean; reasons: { kind: string; detail: string }[] }>; progress: { applied: number; total: number; pct: number } }
interface TeamRow { id: string; shortName: string; name: string; isOurTeam: boolean }

const SEQUENCE_LABEL = ["B", "R", "B", "R", "B", "R", "B", "R", "R", "B", "R", "B", "R", "B", "B", "R", "R", "B", "B", "R"];
const SEQUENCE_TYPE = ["ban", "ban", "ban", "ban", "ban", "ban", "pick", "pick", "pick", "pick", "ban", "ban", "ban", "ban", "pick", "pick", "pick", "pick", "pick", "pick"];

export function DraftRoom() {
  const activeSession = useWorkspaceStore((s) => s.activeSession);
  const setActiveSession = useWorkspaceStore((s) => s.setActiveSession);
  const pushToast = useWorkspaceStore((s) => s.pushToast);
  const hapticsEnabled = useWorkspaceStore((s) => s.hapticsEnabled);

  // catalogue
  const [catalogue, setCatalogue] = useState<ChampionCatalogue | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  // config
  const [cfgOpponent, setCfgOpponent] = useState("NVX");
  const [cfgFormat, setCfgFormat] = useState<"BO1" | "BO3" | "BO5">("BO3");
  const [cfgMode, setCfgMode] = useState<"none" | "hard" | "soft">("hard");
  const [cfgScope, setCfgScope] = useState<"both" | "own">("both");
  const [cfgSide, setCfgSide] = useState<Side>("BLUE");
  // board
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [recs, setRecs] = useState<RecommendationsPayload | null>(null);
  const [recsLoading, setRecsLoading] = useState(false);
  const [expandedRec, setExpandedRec] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<ChampionCatalogue>("/api/champions").then(setCatalogue).catch(() => setCatalogue(null));
    apiFetch<TeamRow[]>("/api/teams").then(setTeams).catch(() => setTeams([]));
  }, []);

  const session = activeSession;
  const game = session?.games.find((g) => g.gameNumber === session.currentGame) ?? null;

  const refreshRecs = useCallback((sessionId: string) => {
    setRecsLoading(true);
    apiPost<RecommendationsPayload>("/api/draft/recommendations", { sessionId })
      .then(setRecs)
      .catch(() => setRecs(null))
      .finally(() => setRecsLoading(false));
  }, []);

  useEffect(() => {
    if (session) refreshRecs(session.id);
  }, [session, refreshRecs]);

  const createSession = async () => {
    setBusy(true);
    setError(null);
    try {
      const rulesetId = cfgMode === "none" ? `std-${cfgFormat.toLowerCase()}` : `ff-${cfgMode}-${cfgFormat.toLowerCase()}`;
      const s = await apiPost<DraftSession>("/api/draft/sessions", {
        opponentTeamId: cfgOpponent,
        format: cfgFormat,
        rulesetId,
        modeOverride: cfgMode,
        scopeOverride: cfgMode === "none" ? undefined : cfgScope,
        ourSide: cfgSide,
      });
      setActiveSession(s);
      setSelected(null);
      pushToast(`Session created — ${cfgFormat} vs ${cfgOpponent} (${cfgMode === "none" ? "standard" : `${cfgMode} fearless`}).`);
    } catch (e) {
      setError(e instanceof ApiClientError ? e : new ApiClientError({ code: "INTERNAL_ERROR", message: "Failed to create session.", retryable: true, recovery: "Retry." }));
    } finally {
      setBusy(false);
    }
  };

  const mutate = useCallback(
    async (fn: (id: string, version: number) => Promise<ActionResult>, successMsg?: string) => {
      if (!session) return;
      setBusy(true);
      setError(null);
      try {
        const result = await fn(session.id, session.stateVersion);
        setActiveSession(result.session);
        setSelected(null);
        if (successMsg) pushToast(successMsg);
        haptic("pick", hapticsEnabled);
      } catch (e) {
        if (e instanceof ApiClientError) {
          setError(e);
          haptic("invalid", hapticsEnabled);
          if (e.code === "DRAFT_STALE_VERSION") {
            const fresh = await apiFetch<DraftSession>(`/api/draft/sessions/${session.id}`).catch(() => null);
            if (fresh) setActiveSession(fresh);
            pushToast("Board was stale — reloaded the latest state. No corruption occurred.", "warn");
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [session, setActiveSession, pushToast, hapticsEnabled],
  );

  const applyAction = (type: "ban" | "pick", championId: string) =>
    mutate(
      (id, v) => apiPost<ActionResult>(`/api/draft/sessions/${id}/actions`, { type, championId, expectedStateVersion: v }),
      `${type === "ban" ? "Ban" : "Pick"} locked: ${getChampion(championId)?.displayName ?? championId}`,
    );

  const currentTurn = useMemo(() => {
    if (!game || !session) return null;
    const idx = game.actions.length;
    if (game.status !== "drafting" || idx >= 20) return null;
    return { index: idx, type: SEQUENCE_TYPE[idx] as "ban" | "pick", side: (SEQUENCE_LABEL[idx] === "B" ? "BLUE" : "RED") as Side };
  }, [game, session]);

  const availability = useMemo(() => {
    // Client-side mirror for instant visual feedback; the server remains
    // authoritative on lock. Fearless restriction is turn-aware in soft/own mode.
    if (!game || !session || !catalogue) return null;
    const map: Record<string, { available: boolean; reasons: string[] }> = {};
    const banned = new Set([...game.blue.bans.filter(Boolean), ...game.red.bans.filter(Boolean)] as string[]);
    const picked = [...game.blue.picks, ...game.red.picks].map((p) => p.championId);
    const priorByTeam: Record<string, Set<string>> = {};
    for (const g of session.games) {
      if (g.status !== "finalized") continue;
      for (const [teamId, picks] of Object.entries({
        [g.blueTeamId]: g.blue.picks.map((p) => p.championId),
        [g.redTeamId]: g.red.picks.map((p) => p.championId),
      })) {
        const set = priorByTeam[teamId] ?? new Set<string>();
        picks.forEach((p) => set.add(p));
        priorByTeam[teamId] = set;
      }
    }
    const idx = game.actions.length;
    const actingSide = idx < 20 ? (SEQUENCE_LABEL[idx] === "B" ? "BLUE" : "RED") : null;
    const actingTeamId = actingSide === "BLUE" ? game.blueTeamId : actingSide === "RED" ? game.redTeamId : null;
    const restrictedFor = (championId: string): string | null => {
      if (session.mode === "none") return null;
      const restrictedOwn = priorByTeam[actingTeamId ?? ""]?.has(championId);
      if (session.mode === "hard" || session.restrictionsScope === "both") {
        const any = [...new Set([...priorByTeam[game.blueTeamId] ?? [], ...priorByTeam[game.redTeamId] ?? []])];
        return any.includes(championId) ? "Hard Fearless — locked from an earlier game" : null;
      }
      return restrictedOwn ? "Soft Fearless — locked via our earlier pick" : null;
    };
    for (const c of catalogue.champions) {
      const reasons: string[] = [];
      if (banned.has(c.id)) reasons.push(`banned this game (${game.blue.bans.includes(c.id) ? "blue" : "red"})`);
      if (picked.includes(c.id)) reasons.push("picked this game");
      if (!picked.includes(c.id)) {
        const fr = restrictedFor(c.id);
        if (fr) reasons.push(fr);
      }
      map[c.id] = { available: reasons.length === 0, reasons };
    }
    return map;
  }, [game, session, catalogue]);

  const filteredChampions = useMemo(() => {
    if (!catalogue) return [];
    const q = search.trim().toLowerCase();
    return catalogue.champions.filter(
      (c) => (roleFilter === "all" || [c.primaryRole, ...c.flexRoles].includes(roleFilter)) && (!q || c.displayName.toLowerCase().includes(q) || c.id.includes(q)),
    );
  }, [catalogue, search, roleFilter]);

  // Composition analysis of our current picks (client-side trait aggregation).
  const compProfile = useMemo(() => {
    if (!game || !session) return null;
    const ourTeamId = session.ourTeamId;
    const ourPicks = game.blueTeamId === ourTeamId ? game.blue.picks : game.red.picks;
    const dims = ["engage", "disengage", "frontline", "crowdControl", "physicalDamage", "magicDamage", "scaling", "siege", "pickPotential", "objectiveControl"] as const;
    const out: Record<string, number | null> = {};
    for (const d of dims) {
      const vals = ourPicks.map((p) => getChampion(p.championId)?.traits[d]).filter((v): v is number => v !== null);
      out[d] = vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100 : null;
    }
    return out;
  }, [game, session]);

  const ourSideInGame: Side | null = game ? ((game.blueTeamId === session?.ourTeamId ? "BLUE" : "RED")) : null;
  const weAct = currentTurn && ourSideInGame === currentTurn.side;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Draft Room</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Interactive pick/ban workspace. Every action is validated by the deterministic engine and persisted with a version stamp.</p>
        </div>
        {session && (
          <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--text-muted)]">
            <span className="rounded border border-[var(--border-subtle)] px-2 py-1">session {session.id.slice(0, 8)}</span>
            <span className="rounded border border-[var(--border-subtle)] px-2 py-1">persisted v{session.stateVersion}</span>
          </div>
        )}
      </header>

      {/* Configuration */}
      {!session && (
        <Panel title="Draft configuration" subtitle="Opponent, format, tournament sequence, Fearless ruleset, sides">
          {error && <ErrorState code={error.code} message={error.message} recovery={error.recovery} />}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Opponent">
              <select value={cfgOpponent} onChange={(e) => setCfgOpponent(e.target.value)} className="cfg-select" aria-label="Opponent">
                {teams.filter((t) => !t.isOurTeam).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Format">
              <select value={cfgFormat} onChange={(e) => setCfgFormat(e.target.value as "BO1" | "BO3" | "BO5")} className="cfg-select" aria-label="Series format">
                {["BO1", "BO3", "BO5"].map((f) => <option key={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Fearless ruleset">
              <select value={cfgMode} onChange={(e) => setCfgMode(e.target.value as "none" | "hard" | "soft")} className="cfg-select" aria-label="Fearless mode">
                <option value="none">Standard draft</option>
                <option value="hard">Hard / Full Fearless</option>
                <option value="soft">Soft Fearless</option>
              </select>
            </Field>
            {cfgMode !== "none" && (
              <Field label="Restriction scope">
                <select value={cfgScope} onChange={(e) => setCfgScope(e.target.value as "both" | "own")} className="cfg-select" aria-label="Restriction scope">
                  <option value="both">Both teams</option>
                  <option value="own">Own picks only</option>
                </select>
              </Field>
            )}
            <Field label="Our side (Game 1)">
              <select value={cfgSide} onChange={(e) => setCfgSide(e.target.value as Side)} className="cfg-select" aria-label="Our side">
                <option value="BLUE">Blue side (first pick)</option>
                <option value="RED">Red side</option>
              </select>
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-[11px] leading-relaxed text-[var(--text-muted)]">
              Tournament sequence: 6 bans → 4 picks → 4 bans → 6 picks. Bans, picks and Fearless-restricted champions are tracked as separate states — bans never count as completed picks.
            </p>
            <button
              type="button"
              onClick={createSession}
              disabled={busy}
              className="rounded-lg border border-[var(--accent-cyan)]/60 bg-[var(--accent-cyan)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--accent-cyan)] transition-colors hover:bg-[var(--accent-cyan)]/20 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create draft session"}
            </button>
          </div>
        </Panel>
      )}

      {session && game && (
        <>
          {/* Session strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/70 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-[var(--text-primary)]">{session.format} vs {session.opponentTeamId}</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-active)] px-2.5 py-0.5 text-[var(--accent-cyan)]">
                {session.mode === "none" ? <><PickGlyph size={12} /> Standard</> : session.mode === "hard" ? <><HardFearlessGlyph size={12} /> Hard Fearless</> : <><SoftFearlessGlyph size={12} /> Soft Fearless</>}
                {session.mode !== "none" && <span className="text-[var(--text-muted)]">· {session.restrictionsScope}</span>}
              </span>
              <span className="font-mono text-[var(--text-muted)]">Game {game.gameNumber} · our side {ourSideInGame}</span>
              {game.status === "finalized" && <span className="rounded-full bg-[var(--accent-green)]/10 px-2 py-0.5 text-[var(--accent-green)]">finalized</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy || game.actions.length === 0 || game.status !== "drafting"} onClick={() => mutate((id, v) => apiPost(`/api/draft/sessions/${id}/undo`, { expectedStateVersion: v }))} className="ctrl-btn">Undo</button>
              <button type="button" disabled={busy || game.redoStack.length === 0 || game.status !== "drafting"} onClick={() => mutate((id, v) => apiPost(`/api/draft/sessions/${id}/redo`, { expectedStateVersion: v }))} className="ctrl-btn">Redo</button>
              <button type="button" disabled={busy || game.status !== "drafting"} onClick={() => mutate((id, v) => apiPost(`/api/draft/sessions/${id}/reset`, { expectedStateVersion: v }), "Board reset.")} className="ctrl-btn">Reset</button>
              <button
                type="button"
                disabled={busy || game.status !== "drafting" || game.actions.length < 20}
                onClick={() => mutate((id, v) => apiPost(`/api/draft/sessions/${id}/finalize`, { expectedStateVersion: v }), "Game finalized — Fearless restrictions propagate to the next game.")}
                className="rounded-md border border-[var(--accent-green)]/60 bg-[var(--accent-green)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent-green)] disabled:opacity-40"
                title={game.actions.length < 20 ? "All 20 actions must be locked first" : "Assign roles to all picks, then finalize"}
              >
                Finalize game
              </button>
              {game.status === "finalized" && session.currentGame < (session.format === "BO1" ? 1 : session.format === "BO3" ? 3 : 5) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => mutate((id, v) => apiPost(`/api/draft/sessions/${id}/next-game`, { expectedStateVersion: v }), "Next game started — restricted champions updated.")}
                  className="rounded-md border border-[var(--accent-cyan)]/60 bg-[var(--accent-cyan)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent-cyan)]"
                >
                  <span className="inline-flex items-center gap-1.5"><SeriesGlyph size={13} /> Start Game {game.gameNumber + 1}</span>
                </button>
              )}
            </div>
          </div>

          {error && <ErrorState code={error.code} message={error.message} recovery={error.recovery} />}

          <div className="grid gap-6 xl:grid-cols-[240px_1fr_320px]">
            {/* Left: opponent profile */}
            <div className="order-2 flex flex-col gap-4 xl:order-1">
              <Panel title="Opponent profile" subtitle="Fixture-scouted priorities">
                <OpponentMini teamId={session.opponentTeamId} />
              </Panel>
            </div>

            {/* Center: draft board + champion grid */}
            <div className="order-1 flex min-w-0 flex-col gap-4 xl:order-2">
              {/* Turn indicator */}
              <div className={`rounded-xl border px-4 py-3 ${weAct ? "active-trace border-[var(--accent-cyan)]/60 bg-[var(--accent-cyan)]/5" : "border-[var(--border-subtle)] bg-[var(--surface-1)]/70"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    {game.status !== "drafting" ? (
                      <span className="text-[var(--accent-green)]">Draft completed — restrictions recorded.</span>
                    ) : currentTurn ? (
                      <>
                        <span className="font-semibold text-[var(--text-primary)]">{currentTurn.side} side {currentTurn.type}</span>
                        <span className="ml-2 text-[var(--text-secondary)]">
                          {weAct ? "Our turn — select a champion below and lock." : `Waiting on ${currentTurn.side === "BLUE" ? game.blueTeamId : game.redTeamId}.`}
                        </span>
                      </>
                    ) : (
                      "Sequence complete — assign roles and finalize."
                    )}
                  </p>
                  <span className="tnum font-mono text-[11px] text-[var(--text-muted)]">{game.actions.length}/20 · phase {game.phase.replace("_", " ")}</span>
                </div>
                <div className="mt-2 flex gap-1" aria-hidden="true">
                  {SEQUENCE_TYPE.map((t, i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full ${i < game.actions.length ? (t === "ban" ? "bg-[var(--accent-coral)]/70" : "bg-[var(--accent-cyan)]/70") : i === game.actions.length ? "bg-[var(--accent-white)]/80" : "bg-[var(--surface-3)]"}`}
                    />
                  ))}
                </div>
              </div>

              {/* Draft board */}
              <div className="grid gap-3 md:grid-cols-2">
                <SideBoard game={game} side="BLUE" label={game.blueTeamId} isOur={ourSideInGame === "BLUE"} onAssignRole={(pickIndex, role) => mutate((id, v) => apiPost(`/api/draft/sessions/${id}/roles`, { side: "BLUE", pickIndex, role, expectedStateVersion: v }))} />
                <SideBoard game={game} side="RED" label={game.redTeamId} isOur={ourSideInGame === "RED"} onAssignRole={(pickIndex, role) => mutate((id, v) => apiPost(`/api/draft/sessions/${id}/roles`, { side: "RED", pickIndex, role, expectedStateVersion: v }))} />
              </div>

              {/* Champion grid */}
              <Panel
                title="Champion availability"
                subtitle={catalogue ? `Pool of ${catalogue.champions.length} · metadata ${catalogue.metadataVersion} (${catalogue.metadataSource})` : "Loading catalogue…"}
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search champions…"
                      aria-label="Search champions"
                      className="w-40 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs"
                    />
                    <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | "all")} aria-label="Filter by role" className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2 py-1.5 text-xs">
                      <option value="all">All roles</option>
                      {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                }
              >
                {!catalogue ? (
                  <SkeletonBlock className="h-56" />
                ) : (
                  <div ref={gridRef} className="grid max-h-[340px] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6 lg:grid-cols-8" role="listbox" aria-label="Champion grid">
                    {filteredChampions.map((c) => {
                      const av = availability?.[c.id] ?? { available: true, reasons: [] };
                      const isTurnTypeOk = currentTurn?.type;
                      const actionable = av.available && isTurnTypeOk && game.status === "drafting";
                      const RoleGlyph = ROLE_GLYPHS[c.primaryRole];
                      return (
                        <button
                          key={c.id}
                          type="button"
                          disabled={!actionable}
                          onClick={() => setSelected(selected === c.id ? null : c.id)}
                          title={av.available ? `${c.displayName} — available (${c.primaryRole}${c.flexRoles.length ? ` / ${c.flexRoles.join("/")}` : ""})` : `Unavailable: ${av.reasons.join("; ")}`}
                          aria-label={`${c.displayName}, ${av.available ? "available" : `unavailable: ${av.reasons.join("; ")}`}`}
                          className={`champ-tile flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-center ${
                            !av.available
                              ? "border-[var(--border-subtle)] bg-[var(--surface-1)]/40 opacity-45"
                              : selected === c.id
                                ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10"
                                : "border-[var(--border-subtle)] bg-[var(--surface-2)]/60"
                          }`}
                        >
                          <span className={`text-lg font-semibold ${av.available ? "text-[var(--text-primary)]" : "text-[var(--text-disabled)] line-through decoration-[var(--accent-coral)]/60"}`}>
                            {c.displayName.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="w-full truncate text-[10px] leading-tight text-[var(--text-secondary)]">{c.displayName}</span>
                          <span className={`inline-flex items-center gap-0.5 text-[9px] ${av.available ? "text-[var(--text-muted)]" : "text-[var(--accent-coral)]"}`}>
                            {!av.available ? <BanGlyph size={10} /> : <RoleGlyph size={10} />}
                            {c.primaryRole}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Selection strip */}
                {selected && currentTurn && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--accent-cyan)]/50 bg-[var(--accent-cyan)]/5 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{getChampion(selected)?.displayName}</span>
                      <span className="text-xs text-[var(--text-secondary)]">
                        Lock as {currentTurn.type} for {currentTurn.side} side?
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setSelected(null)} className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">Cancel</button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => applyAction(currentTurn.type, selected)}
                        className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold ${
                          currentTurn.type === "ban"
                            ? "border border-[var(--accent-coral)]/60 bg-[var(--accent-coral)]/10 text-[var(--accent-coral)]"
                            : "border border-[var(--accent-cyan)]/60 bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)]"
                        }`}
                      >
                        {currentTurn.type === "ban" ? <BanGlyph size={13} /> : <PickGlyph size={13} />} Lock {currentTurn.type}
                      </button>
                    </div>
                  </div>
                )}
              </Panel>

              {/* Event history */}
              <Panel title="Draft event history" subtitle="Every action carries id, timestamp, actor, phase and prior version">
                <ol className="flex max-h-40 flex-col gap-1 overflow-y-auto font-mono text-[11px]">
                  {game.actions.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 rounded bg-[var(--surface-2)]/50 px-2.5 py-1.5">
                      <span className="text-[var(--text-secondary)]">
                        <span className="tnum">{String(a.order).padStart(2, "0")}</span> · {a.type.toUpperCase()} · {a.side} · <span className="text-[var(--text-primary)]">{getChampion(a.championId)?.displayName}</span>
                      </span>
                      <span className="text-[var(--text-muted)]">{a.phase.replace("_", " ").toLowerCase()} · v{a.priorStateVersion}→v{a.priorStateVersion + 1}</span>
                    </li>
                  ))}
                  {game.actions.length === 0 && <li className="text-[var(--text-muted)]">No actions yet — the board is empty and validated.</li>}
                </ol>
              </Panel>
            </div>

            {/* Right: recommendations + composition */}
            <div className="order-3 flex flex-col gap-4">
              <Panel title="Recommended picks" subtitle={recsLoading ? "Refreshing…" : "Transparent 0–100 suitability score — not a win probability"}>
                {!recs ? (
                  recsLoading ? <SkeletonBlock className="h-44" /> : <EmptyState title="No recommendations yet" message="Make the first draft action to refresh the recommendation engine." />
                ) : (
                  <div className="flex flex-col gap-2">
                    {recs.picks.map((r) => (
                      <RecCard key={r.championId} rec={r} expanded={expandedRec === r.championId} onToggle={() => setExpandedRec(expandedRec === r.championId ? null : r.championId)} />
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Candidate bans" subtitle="Deny value from observed opponent usage">
                {!recs ? (
                  <SkeletonBlock className="h-36" />
                ) : (
                  <div className="flex flex-col gap-2">
                    {recs.bans.map((r) => (
                      <RecCard key={r.championId} rec={r} expanded={expandedRec === `b-${r.championId}`} onToggle={() => setExpandedRec(expandedRec === `b-${r.championId}` ? null : `b-${r.championId}`)} />
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Composition balance" subtitle="Our picks so far — coach-curated trait vectors">
                {!compProfile ? (
                  <SkeletonBlock className="h-40" />
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {Object.entries(compProfile).map(([dim, v]) => (
                      <div key={dim}>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-[var(--text-secondary)]">{dim.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                          <span className="tnum text-[var(--text-muted)]">{v === null ? "unknown" : v}</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-[var(--surface-3)]">
                          <div className={`h-1.5 rounded-full ${v === null ? "bg-[var(--surface-3)]" : "signal-gradient"}`} style={{ width: v === null ? "6px" : `${v}%` }} />
                        </div>
                      </div>
                    ))}
                    <p className="flex items-start gap-1.5 pt-1 text-[10px] text-[var(--text-muted)]">
                      <ConfidenceGlyph size={12} /> Unknown dimensions stay unknown — they are excluded from scores, never invented.
                    </p>
                  </div>
                )}
              </Panel>

              {recs && recs.alternatives.length > 0 && (
                <Panel title="Alternative compositions" subtitle="Greedy builds from the available pool">
                  <div className="flex flex-col gap-2">
                    {recs.alternatives.map((a, i) => (
                      <div key={i} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-3">
                        <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--accent-violet)]"><CompositionGlyph size={13} /> Variant {i + 1} {a.score !== null && <span className="tnum text-[var(--text-muted)]">· comp score {a.score}</span>}</p>
                        <p className="mt-1.5 flex flex-wrap gap-1.5">
                          {a.championIds.map((id) => (
                            <span key={id} className="rounded bg-[var(--surface-3)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">{getChampion(id)?.displayName ?? id}</span>
                          ))}
                        </p>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------ subcomponents ----------------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
      {label}
      <span className="cfg-select-wrap">{children}</span>
    </label>
  );
}

function SideBoard({
  game,
  side,
  label,
  isOur,
  onAssignRole,
}: {
  game: DraftGameState;
  side: Side;
  label: string;
  isOur: boolean;
  onAssignRole: (pickIndex: number, role: Role) => void;
}) {
  const bucket = side === "BLUE" ? game.blue : game.red;
  return (
    <div className={`rounded-xl border p-3.5 ${isOur ? "border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/[0.04]" : "border-[var(--border-subtle)] bg-[var(--surface-1)]/70"}`}>
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-xs font-semibold text-[var(--text-primary)]">
          {side === "BLUE" ? "■" : "□"} {label} <span className="font-normal text-[var(--text-muted)]">({side.toLowerCase()}{isOur ? " · us" : ""})</span>
        </p>
        <span className="font-mono text-[10px] text-[var(--text-muted)]">{bucket.bans.filter(Boolean).length} bans / {bucket.picks.length} picks</span>
      </div>
      <div className="mb-2 grid grid-cols-5 gap-1.5">
        {bucket.bans.map((b, i) => {
          const champ = b ? getChampion(b) : null;
          return (
            <div key={i} aria-label={champ ? `Ban ${i + 1}: ${champ.displayName}` : `Ban slot ${i + 1} (empty)`} className={`flex h-9 items-center justify-center rounded border ${b ? "ban-eliminate border-[var(--accent-coral)]/50 bg-[var(--accent-coral)]/10" : "border-dashed border-[var(--border-subtle)]"}`}>
              <span className={`truncate px-1 text-[10px] ${b ? "font-mono text-[var(--accent-coral)]" : "text-[var(--text-disabled)]"}`}>{champ?.displayName ?? "—"}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5">
        {bucket.picks.length === 0 && (
          <p className="rounded border border-dashed border-[var(--border-subtle)] px-2 py-2 text-center text-[10px] text-[var(--text-disabled)]">No picks yet</p>
        )}
        {bucket.picks.map((p, i) => {
          const champ = getChampion(p.championId);
          const RoleGlyph = p.role ? ROLE_GLYPHS[p.role] : null;
          return (
            <div key={`${p.championId}-${i}`} className="pick-confirm flex items-center justify-between gap-2 rounded border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-2.5 py-1.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-xs font-medium text-[var(--text-primary)]">{champ?.displayName}</span>
                {RoleGlyph && <span className="text-[var(--text-muted)]"><RoleGlyph size={12} /></span>}
              </span>
              {game.status === "drafting" ? (
                <select
                  value={p.role ?? ""}
                  onChange={(e) => e.target.value && onAssignRole(i, e.target.value as Role)}
                  aria-label={`Assign role to ${champ?.displayName}`}
                  className="rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
                >
                  <option value="">role…</option>
                  {[champ?.primaryRole, ...(champ?.flexRoles ?? [])].filter(Boolean).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              ) : (
                <span className="font-mono text-[10px] text-[var(--text-muted)]">{p.role ?? "unassigned"}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecCard({ rec, expanded, onToggle }: { rec: Recommendation; expanded: boolean; onToggle: () => void }) {
  const isBan = rec.recommendationType === "ban";
  return (
    <div className={`rounded-lg border p-3 ${isBan ? "border-[var(--accent-coral)]/30 bg-[var(--accent-coral)]/[0.04]" : "border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/[0.04]"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
          {isBan ? <span className="text-[var(--accent-coral)]"><BanGlyph size={14} /></span> : <span className="text-[var(--accent-cyan)]"><PickGlyph size={14} /></span>}
          {rec.candidateName}
        </p>
        <span className="tnum rounded bg-[var(--surface-3)] px-2 py-0.5 text-xs font-semibold text-[var(--text-primary)]">{rec.score}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">{rec.explanation}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {rec.supportingEvidence[0] && <EvidenceChip evidenceId={rec.supportingEvidence[0].id} compact />}
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="text-[11px] text-[var(--accent-cyan)] hover:underline">
          {expanded ? "Hide breakdown" : "Score breakdown"}
        </button>
        {rec.confidenceInterval && (
          <span className="tnum text-[10px] text-[var(--text-muted)]">CI {formatPct(rec.confidenceInterval.lower)}–{formatPct(rec.confidenceInterval.upper)}</span>
        )}
      </div>
      {expanded && (
        <div className="mt-2.5 space-y-1.5 border-t border-[var(--border-subtle)] pt-2.5">
          {rec.scoreBreakdown.map((b) => (
            <div key={b.component} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="text-[var(--text-secondary)]">{b.component} <span className="text-[var(--text-muted)]">(w {b.weight})</span></span>
              <span className="tnum text-[var(--text-muted)]">{b.weighted === null ? "excluded" : b.weighted.toFixed(1)} · {b.note}</span>
            </div>
          ))}
          {rec.positiveFactors.map((f) => (
            <p key={f} className="text-[10px] text-[var(--accent-green)]">+ {f}</p>
          ))}
          {rec.riskFactors.map((f) => (
            <p key={f} className="text-[10px] text-[var(--accent-amber)]">⚠ {f}</p>
          ))}
          <p className="text-[10px] text-[var(--text-muted)]">Alternatives: {rec.alternatives.join(", ") || "none in pool"}</p>
        </div>
      )}
    </div>
  );
}

function OpponentMini({ teamId }: { teamId: string }) {
  const [data, setData] = useState<{ usage: { championId: string; displayName: string; picks: number; bans: number; pickRate: { value: number | null }; primaryRole: string }[] } | null>(null);
  useEffect(() => {
    apiFetch<{ usage: { championId: string; displayName: string; picks: number; bans: number; pickRate: { value: number | null }; primaryRole: string }[] }>(`/api/scouting/opponents/${teamId}`)
      .then((p) => setData({ usage: p.usage.slice(0, 8) }))
      .catch(() => setData(null));
  }, [teamId]);
  if (!data) return <SkeletonBlock className="h-48" />;
  return (
    <ul className="flex flex-col gap-1.5 text-xs">
      {data.usage.map((u) => (
        <li key={u.championId} className="flex items-center justify-between gap-2 rounded bg-[var(--surface-2)]/60 px-2.5 py-1.5">
          <span className="min-w-0 truncate text-[var(--text-primary)]">{u.displayName}</span>
          <span className="tnum shrink-0 font-mono text-[10px] text-[var(--text-muted)]">{u.picks}p/{u.bans}b · {formatPct(u.pickRate.value)}</span>
        </li>
      ))}
    </ul>
  );
}
