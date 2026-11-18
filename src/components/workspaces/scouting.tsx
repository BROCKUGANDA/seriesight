"use client";

/**
 * Opponent Intelligence workspace (PRD D3): team directory, filters, profiles,
 * signature tendencies with evidence, and observed-fact vs interpretation briefs.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { Panel, StatTile, ConfidenceBadge, EvidenceChip, EmptyState, SkeletonBlock, ErrorState } from "@/components/common/primitives";
import { ROLE_GLYPHS, RadarGlyph, BanGlyph, PickGlyph, RiskGlyph } from "@/components/icons/seriesight-icons";
import type { ChampionUsage, OpponentSummary } from "@/domain/analytics/scouting-context";
import type { Insight, Player, Series } from "@/domain/types";
import { formatPct } from "@/domain/analytics/stats";

export interface ScoutingFiltersLike {
  tournamentId?: string;
  patch?: string;
  side?: "BLUE" | "RED" | "both";
  gameNumber?: number;
}

interface TeamRow { id: string; name: string; shortName: string; region: string; isOurTeam: boolean }
interface Profile {
  team: { id: string; name: string; shortName: string; region: string; roster: Player[] };
  isOurTeam: boolean;
  summary: OpponentSummary;
  usage: ChampionUsage[];
  insights: Insight[];
  players: { playerId: string; handle: string; role: string; flexRoles: string[]; games: number; champions: { championId: string; displayName: string; picks: number }[] }[];
  sideSplit: { BLUE: number; RED: number };
  evidenceCount: number;
}
interface TournamentRow { id: string; title: string }

const CHAMPION_USAGE_LIMIT = 10;

export function OpponentIntelligence() {
  const [teams, setTeams] = useState<TeamRow[] | null>(null);
  const [tournaments, setTournaments] = useState<TournamentRow[] | null>(null);
  const [series, setSeries] = useState<Series[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("NVX");
  const [filters, setFilters] = useState<ScoutingFiltersLike>({ side: "both" });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [openInsight, setOpenInsight] = useState<Insight | null>(null);

  useEffect(() => {
    apiFetch<TeamRow[]>("/api/teams").then(setTeams).catch(() => setTeams([]));
    apiFetch<TournamentRow[]>("/api/tournaments").then(setTournaments).catch(() => setTournaments([]));
    apiFetch<Series[]>("/api/series").then(setSeries).catch(() => setSeries([]));
  }, []);

  const loadProfile = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.tournamentId) params.set("tournamentId", filters.tournamentId);
    if (filters.patch) params.set("patch", filters.patch);
    if (filters.side && filters.side !== "both") params.set("side", filters.side);
    if (filters.gameNumber) params.set("gameNumber", String(filters.gameNumber));
    setLoading(true);
    setError(null);
    apiFetch<Profile>(`/api/scouting/opponents/${selected}?${params.toString()}`)
      .then((p) => {
        setProfile(p);
        setOpenInsight(p.insights[0] ?? null);
      })
      .catch((e: ApiClientError) => setError(e))
      .finally(() => setLoading(false));
  }, [selected, filters]);

  useEffect(() => {
    const t = setTimeout(loadProfile, 0);
    return () => clearTimeout(t);
  }, [loadProfile]);

  const filteredTeams = useMemo(() => {
    if (!teams) return [];
    const q = query.trim().toLowerCase();
    return teams.filter((t) => !q || t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q));
  }, [teams, query]);

  const patches = ["16.8", "16.9", "16.10"];
  const filteredSeries = useMemo(() => {
    if (!series) return [];
    return series.filter((s) => (s.teamAId === selected || s.teamBId === selected) && (!filters.tournamentId || s.tournamentId === filters.tournamentId));
  }, [series, selected, filters.tournamentId]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Opponent Intelligence</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Turn tournament history into structured opponent profiles. Every tendency links to its evidence.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="team-search" className="sr-only">Search team directory</label>
          <input
            id="team-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teams…"
            className="w-48 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Team directory */}
        <Panel title="Team directory" subtitle={`${filteredTeams.length} teams`}>
          <ul className="flex max-h-[420px] flex-col gap-1 overflow-y-auto" role="listbox" aria-label="Teams">
            {filteredTeams.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected === t.id}
                  onClick={() => setSelected(t.id)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors ${
                    selected === t.id ? "bg-[var(--surface-3)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{t.name}</span>
                    <span className="block font-mono text-[10px] text-[var(--text-muted)]">{t.shortName} · {t.region}{t.isOurTeam ? " · our squad" : ""}</span>
                  </span>
                  <RadarGlyph size={14} />
                </button>
              </li>
            ))}
            {filteredTeams.length === 0 && <li className="px-3 py-4 text-xs text-[var(--text-muted)]">No opponents match “{query}”.</li>}
          </ul>
        </Panel>

        <div className="flex min-w-0 flex-col gap-6">
          {/* Filters */}
          <Panel title="Match history filters" subtitle="Denoominators adapt to the filtered eligible games">
            <div className="flex flex-wrap items-center gap-3">
              <FilterSelect
                label="Tournament"
                value={filters.tournamentId ?? ""}
                onChange={(v) => setFilters((f) => ({ ...f, tournamentId: v || undefined }))}
                options={[["", "All tournaments"], ...(tournaments ?? []).map((t) => [t.id, t.title] as [string, string])]}
              />
              <FilterSelect
                label="Patch"
                value={filters.patch ?? ""}
                onChange={(v) => setFilters((f) => ({ ...f, patch: v || undefined }))}
                options={[["", "All patches"], ...patches.map((p) => [p, p] as [string, string])]}
              />
              <FilterSelect
                label="Side"
                value={filters.side ?? "both"}
                onChange={(v) => setFilters((f) => ({ ...f, side: v as "BLUE" | "RED" | "both" }))}
                options={[["both", "Both sides"], ["BLUE", "Blue side"], ["RED", "Red side"]]}
              />
              <FilterSelect
                label="Game #"
                value={filters.gameNumber ? String(filters.gameNumber) : ""}
                onChange={(v) => setFilters((f) => ({ ...f, gameNumber: v ? Number(v) : undefined }))}
                options={[["", "Any"], ["1", "Game 1"], ["2", "Game 2"], ["3", "Game 3"], ["4", "Game 4"], ["5", "Game 5"]]}
              />
              {(filters.tournamentId || filters.patch || (filters.side && filters.side !== "both") || filters.gameNumber) && (
                <button type="button" onClick={() => setFilters({ side: "both" })} className="text-xs text-[var(--accent-cyan)] hover:underline">
                  Clear filters
                </button>
              )}
            </div>
          </Panel>

          {error ? (
            <ErrorState code={error.code} message={error.message} recovery={error.recovery} retryable={error.retryable} onRetry={loadProfile} />
          ) : loading || !profile ? (
            <div className="grid gap-3 md:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-[86px]" />)}</div>
          ) : (
            <>
              {/* Team profile */}
              <section aria-label="Team profile" className="grid grid-cols-2 gap-3 md:grid-cols-6">
                <StatTile label="Series record" value={`${profile.summary.record.wins}–${profile.summary.record.losses}`} detail="within selected dataset" />
                <StatTile label="Games analyzed" value={profile.summary.gamesAnalyzed} detail={`${profile.summary.eligibleGames} draft-eligible`} tone="accent" />
                <StatTile label="Blue side" value={profile.sideSplit.BLUE} detail={`${Math.round((profile.sideSplit.BLUE / Math.max(1, profile.summary.gamesAnalyzed)) * 100)}% of games`} />
                <StatTile label="Red side" value={profile.sideSplit.RED} detail={`${Math.round((profile.sideSplit.RED / Math.max(1, profile.summary.gamesAnalyzed)) * 100)}% of games`} />
                <StatTile label="Objective coverage" value={profile.summary.coverage.objectives} detail="games with event timelines" tone="violet" />
                <StatTile label="Evidence records" value={profile.evidenceCount} detail="behind this profile" />
              </section>

              {/* Series history */}
              <Panel title="Series in dataset" subtitle={`Click a series to see its games against ${profile.team.shortName}`}>
                <ul className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                  {filteredSeries.map((s) => (
                    <li key={s.id} className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 font-mono text-[11px] text-[var(--text-secondary)]">
                      {s.id} · {s.format} · patch {s.patch}
                      {s.fearless !== "none" && <span className="ml-1.5 text-[var(--accent-violet)]">{s.fearless}</span>}
                    </li>
                  ))}
                  {filteredSeries.length === 0 && <li className="text-xs text-[var(--text-muted)]">No series for this opponent under the current tournament filter.</li>}
                </ul>
              </Panel>

              <div className="grid gap-6 xl:grid-cols-2">
                {/* Champion selection frequency */}
                <Panel title="Champion selection frequency" subtitle={`Top ${CHAMPION_USAGE_LIMIT} by combined pick+ban weight · denominator = eligible games`}>
                  <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[var(--surface-2)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                        <tr>
                          <th className="px-3 py-2 font-medium">Champion</th>
                          <th className="px-3 py-2 font-medium">Role</th>
                          <th className="px-3 py-2 text-right font-medium">Picks</th>
                          <th className="px-3 py-2 text-right font-medium">Pick rate</th>
                          <th className="px-3 py-2 text-right font-medium">Bans</th>
                          <th className="px-3 py-2 text-right font-medium">1st rot.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {profile.usage.slice(0, CHAMPION_USAGE_LIMIT).map((u) => {
                          const RoleGlyph = ROLE_GLYPHS[u.primaryRole as keyof typeof ROLE_GLYPHS] ?? PickGlyph;
                          return (
                            <tr key={u.championId} className="hover:bg-[var(--surface-2)]/60">
                              <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{u.displayName}</td>
                              <td className="px-3 py-2 text-[var(--text-muted)]"><span className="inline-flex items-center gap-1"><RoleGlyph size={13} />{u.primaryRole}</span></td>
                              <td className="tnum px-3 py-2 text-right text-[var(--text-secondary)]">{u.picks}</td>
                              <td className="tnum px-3 py-2 text-right text-[var(--text-primary)]">{formatPct(u.pickRate.value)}</td>
                              <td className="tnum px-3 py-2 text-right text-[var(--text-secondary)]">{u.bans}</td>
                              <td className="tnum px-3 py-2 text-right text-[var(--text-secondary)]">{u.firstRotationPicks}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-[var(--text-muted)]">Pick rate = picks / draft-eligible games ({profile.summary.eligibleGames}). Wilson 95% intervals shown in evidence records.</p>
                </Panel>

                {/* Signature tendencies */}
                <Panel title="Signature tendencies" subtitle="Engine-detected, each backed by an evidence record">
                  {profile.insights.length === 0 ? (
                    <EmptyState title="No tendencies detected" message="The current filter has too few observations. Widen the filters or import more series." />
                  ) : (
                    <ul className="flex max-h-[380px] flex-col gap-2.5 overflow-y-auto pr-1">
                      {profile.insights.map((insight) => (
                        <li key={insight.id}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setOpenInsight(insight)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setOpenInsight(insight);
                              }
                            }}
                            aria-expanded={openInsight?.id === insight.id}
                            className={`w-full cursor-pointer rounded-lg border p-3.5 text-left transition-colors ${
                              openInsight?.id === insight.id
                                ? "border-[var(--accent-cyan)]/60 bg-[var(--accent-cyan)]/5"
                                : "border-[var(--border-subtle)] bg-[var(--surface-2)]/50 hover:border-[var(--border-active)]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent-violet)]">{insight.insightType.replace("-", " ")}</span>
                              <ConfidenceBadge strength={insight.metric.strength} sampleSize={insight.metric.sampleSize} />
                            </div>
                            <p className="mt-1.5 text-sm font-medium text-[var(--text-primary)]">{insight.title}</p>
                            <p className="mt-1 text-xs text-[var(--text-secondary)]">{insight.summary}</p>
                            <div className="mt-2 flex items-center justify-between">
                              <EvidenceChip evidenceId={insight.evidenceId} />
                              <span className="font-mono text-[10px] text-[var(--text-muted)]">{insight.side} · {insight.patchContext}</span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>

              {/* Strategic interpretation */}
              {openInsight && (
                <Panel title="Strategic interpretation" subtitle="Observed fact separated from interpretation, with alternative responses">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-cyan)]">Observed fact</p>
                      <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{openInsight.observation}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="tnum text-lg font-semibold text-[var(--text-primary)]">{formatPct(openInsight.metric.value)}</span>
                        <EvidenceChip evidenceId={openInsight.evidenceId} />
                      </div>
                    </div>
                    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-violet)]">Interpretation</p>
                      <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{openInsight.interpretation ?? "No interpretation offered — insufficient evidence to support one."}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-amber)]">Insufficient evidence areas</p>
                      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                        <li className="flex items-start gap-1.5"><BanGlyph size={13} /> Late-game objective patterns lack interval aggregates in this provider.</li>
                        <li className="flex items-start gap-1.5"><RiskGlyph size={13} /> Player-role attribution is partial in {profile.summary.gamesAnalyzed - profile.summary.coverage.players} games.</li>
                        <li className="flex items-start gap-1.5"><PickGlyph size={13} /> Matchup-specific conclusions need more head-to-head series.</li>
                      </ul>
                    </div>
                  </div>
                </Panel>
              )}

              {/* Player profiles */}
              <Panel title="Player profiles" subtitle="Observed roles and champion pools from attributed picks (never inferred from static mappings)">
                {profile.players.length === 0 ? (
                  <EmptyState title="No attributed player data" message="The filtered games lack player attribution. Player pools remain unavailable rather than estimated." />
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {profile.players.map((p) => {
                      const total = p.games;
                      const RoleGlyph = ROLE_GLYPHS[p.role as keyof typeof ROLE_GLYPHS] ?? PickGlyph;
                      return (
                        <article key={p.playerId} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-[var(--accent-cyan)]"><RoleGlyph size={15} /></span>
                              <span className="text-sm font-semibold text-[var(--text-primary)]">{p.handle}</span>
                            </div>
                            <span className="font-mono text-[10px] text-[var(--text-muted)]">{total} picks</span>
                          </div>
                          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                            Observed role {p.role}{p.flexRoles.length > 0 ? ` · flex ${p.flexRoles.join("/")}` : ""}
                          </p>
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {p.champions.slice(0, 6).map((c) => (
                              <span key={c.championId} className="rounded bg-[var(--surface-3)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                                {c.displayName} <span className="tnum text-[var(--text-muted)]">×{c.picks}</span>
                              </span>
                            ))}
                          </div>
                          {total < 5 && (
                            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--accent-amber)]"><RiskGlyph size={12} /> Small sample — role conclusions are provisional</p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}
