"use client";

/**
 * Macro Atlas workspace (PRD D4): objective modules with explicit unavailable
 * states, configurable interval breakdowns and a horizontal match timeline.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { Panel, StatTile, ConfidenceBadge, EmptyState, SkeletonBlock, ErrorState } from "@/components/common/primitives";
import { DragonGlyph, HeraldGlyph, BaronGlyph, TimelineGlyph, ObjectiveGlyph, RiskGlyph, PickGlyph } from "@/components/icons/seriesight-icons";
import { formatPct } from "@/domain/analytics/stats";
import { useWorkspaceStore } from "@/store/workspace";

interface MacroModule {
  id: string;
  title: string;
  description: string;
  status: "available" | "unavailable";
  unavailableReason?: string;
  stat: { definition: string; numerator: number; denominator: number; value: number | null; confidence: { lower: number; upper: number } | null; strength: "low" | "moderate" | "high" } | null;
  supportingStat?: { numerator: number; denominator: number; value: number | null; definition: string } | null;
  gameIds: string[];
}
interface MacroAnalysis {
  teamId: string;
  gamesAnalyzed: number;
  objectiveCoverage: number;
  excludedGames: string[];
  modules: MacroModule[];
  intervals: { label: string; dragons: number; heralds: number; barons: number; turrets: number; kills: number; gamesContributing: number }[];
  timeline: { gameId: string; gameNumber: number; seriesId: string; patch: string; durationSec: number; blueTeamId: string; redTeamId: string; events: { id: string; type: string; timestampSec: number; teamId: string | null; value?: number }[] }[];
}
interface TeamRow { id: string; shortName: string; name: string }

const EVENT_META: Record<string, { label: string; color: string; Glyph: (p: { size?: number }) => React.ReactNode }> = {
  dragon: { label: "Dragon", color: "#55DBAA", Glyph: DragonGlyph },
  herald: { label: "Herald", color: "#9B8CFF", Glyph: HeraldGlyph },
  baron: { label: "Baron", color: "#F3BD69", Glyph: BaronGlyph },
  turret: { label: "Turret", color: "#42D9FF", Glyph: ObjectiveGlyph },
  kill: { label: "Kill", color: "#FF7488", Glyph: PickGlyph },
};

export function MacroAtlas() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamId, setTeamId] = useState("NVX");
  const [intervalMin, setIntervalMin] = useState(10);
  const [analysis, setAnalysis] = useState<MacroAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<{ id?: string; gameId: string; type: string; timestampSec: number; teamId: string | null; value?: number } | null>(null);
  const setSelectedOpponent = useWorkspaceStore((s) => s.setSelectedOpponent);

  useEffect(() => {
    apiFetch<TeamRow[]>("/api/teams").then((ts) => {
      setTeams(ts.filter((t) => t.id !== "SGT"));
    }).catch(() => setTeams([]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiFetch<MacroAnalysis>(`/api/macro/teams/${teamId}`)
      .then(setAnalysis)
      .catch((e: ApiClientError) => setError(e))
      .finally(() => setLoading(false));
  }, [teamId]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  // Intervals are re-bucketed client-side from module gameIds? No — the API supplies
  // the default 10-min buckets; when the coach changes the boundary the UI recomputes
  // from timeline data (timestamps are present) and marks the source of truth.
  const customIntervals = useMemo(() => {
    if (!analysis) return [];
    const buckets: { label: string; from: number; to: number }[] = [];
    for (let i = 0; i < 4; i++) {
      buckets.push({ label: `${i * intervalMin}–${(i + 1) * intervalMin} min`, from: i * intervalMin * 60, to: (i + 1) * intervalMin * 60 });
    }
    buckets.push({ label: `${4 * intervalMin}+ min`, from: 4 * intervalMin * 60, to: Number.POSITIVE_INFINITY });
    return buckets.map((b) => {
      const agg = { dragons: 0, heralds: 0, barons: 0, turrets: 0, kills: 0, gamesContributing: 0 };
      const perGame = new Set<string>();
      for (const t of analysis.timeline) {
        let contributed = false;
        for (const e of t.events) {
          if (e.timestampSec < b.from || e.timestampSec >= b.to || e.teamId !== teamId) continue;
          contributed = true;
          if (e.type === "dragon") agg.dragons++;
          else if (e.type === "herald") agg.heralds++;
          else if (e.type === "baron") agg.barons++;
          else if (e.type === "turret") agg.turrets++;
          else if (e.type === "kill") agg.kills++;
        }
        if (contributed) perGame.add(t.gameId);
      }
      return { label: b.label, ...agg, gamesContributing: perGame.size };
    });
  }, [analysis, intervalMin, teamId]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Macro Atlas</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Strategic patterns behind the opponent&apos;s gameplay. Modules degrade independently when data is missing.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="macro-team" className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Team</label>
          <select
            id="macro-team"
            value={teamId}
            onChange={(e) => {
              setTeamId(e.target.value);
              setSelectedOpponent(e.target.value);
              setSelectedEvent(null);
            }}
            className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </header>

      {error ? (
        <ErrorState code={error.code} message={error.message} recovery={error.recovery} retryable={error.retryable} onRetry={load} />
      ) : loading || !analysis ? (
        <div className="grid gap-3 md:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-36" />)}</div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Games analyzed" value={analysis.gamesAnalyzed} detail={`${analysis.objectiveCoverage} with objective coverage`} />
            <StatTile label="Excluded games" value={analysis.excludedGames.length} detail="missing event coverage — shown, never estimated" tone="warn" />
            <StatTile label="Modules available" value={analysis.modules.filter((m) => m.status === "available").length} detail={`of ${analysis.modules.length} analytics modules`} tone="accent" />
            <StatTile label="Partial coverage" value={analysis.excludedGames.length > 0 ? "partial" : "complete"} detail={analysis.excludedGames.length > 0 ? "draft stats complete, macro partial" : "all metrics fully covered"} tone="violet" />
          </section>

          {/* Objective modules */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {analysis.modules.map((m) => (
              <article key={m.id} className={`rounded-xl border p-4 ${m.status === "available" ? "border-[var(--border-subtle)] bg-[var(--surface-1)]/80" : "border-dashed border-[var(--border-subtle)] bg-transparent"}`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium text-[var(--text-primary)]">{m.title}</h3>
                  {m.status === "available" && m.stat ? (
                    <ConfidenceBadge strength={m.stat.strength} sampleSize={m.stat.denominator} />
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--text-disabled)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                      <RiskGlyph size={11} /> Unavailable
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{m.description}</p>
                {m.status === "available" && m.stat ? (
                  <div className="mt-3">
                    <div className="flex items-end justify-between">
                      <span className="tnum text-3xl font-semibold text-[var(--accent-cyan)]">{formatPct(m.stat.value)}</span>
                      <span className="tnum text-[11px] text-[var(--text-muted)]">{m.stat.numerator}/{m.stat.denominator}</span>
                    </div>
                    {m.stat.confidence && (
                      <div className="mt-2">
                        <div className="relative h-1.5 rounded-full bg-[var(--surface-3)]">
                          <div
                            className="absolute h-1.5 rounded-full signal-gradient"
                            style={{ left: `${m.stat.confidence.lower * 100}%`, width: `${(m.stat.confidence.upper - m.stat.confidence.lower) * 100}%` }}
                          />
                        </div>
                        <p className="tnum mt-1 text-[10px] text-[var(--text-muted)]">Wilson 95%: {formatPct(m.stat.confidence.lower)} – {formatPct(m.stat.confidence.upper)}</p>
                      </div>
                    )}
                    {m.supportingStat && (
                      <p className="tnum mt-2 text-[11px] text-[var(--text-secondary)]">
                        Opponent side: {m.supportingStat.numerator} kills in {m.supportingStat.denominator} games
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 rounded-md border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/5 px-3 py-2 text-[11px] leading-relaxed text-[var(--accent-amber)]">
                    {m.unavailableReason}
                  </p>
                )}
              </article>
            ))}
          </div>

          {/* Interval breakdown (configurable) */}
          <Panel
            title="Interval breakdown"
            subtitle="Configurable boundaries; calculations respect actual game timestamps"
            actions={
              <label className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                Interval
                <select
                  value={intervalMin}
                  onChange={(e) => setIntervalMin(Number(e.target.value))}
                  className="rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text-primary)]"
                  aria-label="Interval length"
                >
                  {[5, 10, 15].map((v) => (
                    <option key={v} value={v}>{v} min</option>
                  ))}
                </select>
              </label>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  <tr>
                    <th className="pb-2 pr-4 font-medium">Window</th>
                    <th className="pb-2 pr-4 text-right font-medium">Dragons</th>
                    <th className="pb-2 pr-4 text-right font-medium">Heralds</th>
                    <th className="pb-2 pr-4 text-right font-medium">Barons</th>
                    <th className="pb-2 pr-4 text-right font-medium">Turrets</th>
                    <th className="pb-2 pr-4 text-right font-medium">Kills</th>
                    <th className="pb-2 text-right font-medium">Games</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                  {customIntervals.map((b) => (
                    <tr key={b.label}>
                      <td className="py-2 pr-4 text-[var(--text-primary)]">{b.label}</td>
                      <td className="tnum py-2 pr-4 text-right text-[var(--accent-green)]">{b.dragons}</td>
                      <td className="tnum py-2 pr-4 text-right text-[var(--accent-violet)]">{b.heralds}</td>
                      <td className="tnum py-2 pr-4 text-right text-[var(--accent-amber)]">{b.barons}</td>
                      <td className="tnum py-2 pr-4 text-right text-[var(--accent-cyan)]">{b.turrets}</td>
                      <td className="tnum py-2 pr-4 text-right text-[var(--accent-coral)]">{b.kills}</td>
                      <td className="tnum py-2 text-right text-[var(--text-muted)]">{b.gamesContributing}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Macro timeline */}
          <Panel title="Macro timeline" subtitle="Recorded objective events per game. Click any glyph for the detail panel.">
            {analysis.timeline.length === 0 ? (
              <EmptyState title="No macro events" message="No games with objective coverage match the current filters." />
            ) : (
              <div className="flex flex-col gap-5">
                {analysis.timeline.map((g) => {
                  const events = g.events.filter((e) => e.type !== "game_start" && e.type !== "game_end");
                  return (
                    <div key={g.gameId}>
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <p className="font-mono text-[11px] text-[var(--text-secondary)]">
                          {g.gameId} · patch {g.patch} · {Math.round(g.durationSec / 60)} min
                        </p>
                        <p className="font-mono text-[10px] text-[var(--text-muted)]">
                          {g.blueTeamId} (blue) vs {g.redTeamId} (red)
                        </p>
                      </div>
                      <div className="relative h-12 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/50">
                        <div className="absolute inset-x-3 top-1/2 h-px bg-[var(--border-active)]" />
                        {events.map((e) => {
                          const meta = EVENT_META[e.type];
                          if (!meta) return null;
                          const left = 3 + (e.timestampSec / g.durationSec) * 94;
                          return (
                            <button
                              key={e.id}
                              type="button"
                              onClick={() => setSelectedEvent({ id: e.id, gameId: g.gameId, type: e.type, timestampSec: e.timestampSec, teamId: e.teamId, value: e.value })}
                              title={`${meta.label} · ${Math.floor(e.timestampSec / 60)}:${String(e.timestampSec % 60).padStart(2, "0")}`}
                              aria-label={`${meta.label} at ${Math.floor(e.timestampSec / 60)} minutes in ${g.gameId}`}
                              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-transparent bg-[var(--bg-void)] p-1 transition-transform hover:scale-125"
                              style={{ left: `${left}%`, color: meta.color }}
                            >
                              <meta.Glyph size={15} />
                            </button>
                          );
                        })}
                        {[0, 5, 10, 15, 20, 25, 30, 35].filter((m) => m * 60 < g.durationSec).map((m) => (
                          <span key={m} className="tnum absolute bottom-0 -translate-x-1/2 font-mono text-[8px] text-[var(--text-muted)]" style={{ left: `${3 + ((m * 60) / g.durationSec) * 94}%` }}>
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Event detail panel */}
          {selectedEvent && (
            <Panel title="Event detail" actions={<button type="button" onClick={() => setSelectedEvent(null)} className="text-xs text-[var(--accent-cyan)]">Close</button>}>
              <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {(() => {
                  const meta = EVENT_META[selectedEvent.type];
                  const game = analysis.timeline.find((t) => t.gameId === selectedEvent.gameId);
                  const sec = selectedEvent.timestampSec;
                  const mmss = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
                  return (
                    <>
                      <Detail k="Event" v={<span className="inline-flex items-center gap-1.5" style={{ color: meta?.color }}>{meta && <meta.Glyph size={14} />}{meta?.label ?? selectedEvent.type}</span>} />
                      <Detail k="Timestamp" v={<span className="tnum font-mono">{mmss} ({sec}s)</span>} />
                      <Detail k="Game" v={<span className="font-mono">{selectedEvent.gameId}</span>} />
                      <Detail k="Series" v={<span className="font-mono">{game?.seriesId ?? "—"}</span>} />
                      <Detail k="Teams involved" v={game ? `${game.blueTeamId} vs ${game.redTeamId}` : "—"} />
                      <Detail k="Securing side" v={selectedEvent.teamId ?? "neutral"} />
                      <Detail k="Supporting values" v={selectedEvent.value ? `tier ${selectedEvent.value}` : "count 1"} />
                      <Detail k="Source" v="Fixture event timeline (labelled synthetic)" />
                      <Detail k="Data availability" v="Objective event recorded in provider payload" />
                    </>
                  );
                })()}
              </dl>
              <p className="mt-3 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                <TimelineGlyph size={13} />
                Objective conclusions derive from event sequences, never from the final match winner alone.
              </p>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function Detail({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{k}</dt>
      <dd className="mt-0.5 text-xs text-[var(--text-secondary)]">{v}</dd>
    </div>
  );
}
