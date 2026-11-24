"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiClientError, apiFetch, apiPost } from "@/lib/api-client";
import { useHashRoute } from "@/hooks/use-hash-route";
import { Panel, StatTile, ConfidenceBadge, EvidenceChip, FixtureBadge, EmptyState, SkeletonBlock, ErrorState } from "@/components/common/primitives";
import { useWorkspaceStore, haptic } from "@/store/workspace";
import type { DraftSession, Insight } from "@/domain/types";
import { RadarGlyph, PickGlyph, SeriesGlyph, ImportGlyph, RiskGlyph } from "@/components/icons/seriesight-icons";

interface DashboardData {
  dataset: {
    provider: "fixture" | "grid";
    label: string;
    seriesCount: number;
    gameCount: number;
    opponents: number;
    championCoverage: number;
    freshness: string;
    datasetId: string;
    evidenceIds: { seriesCount: string; gameCount: string; opponents: string; championCoverage: string; freshness: string };
  };
  opponentTeams: { id: string; name: string; shortName: string }[];
  upcoming: { id: string; opponent: string; tournament: string; date: string; format: string; fearless: string }[];
  priorityInsights: (Insight & { opponentName: string })[];
  recentSessions: DraftSession[];
}

export function CommandCenter() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const setSelectedOpponent = useWorkspaceStore((s) => s.setSelectedOpponent);
  const [, navigate] = useHashRoute();
  const setActiveSession = useWorkspaceStore((s) => s.setActiveSession);
  const pushToast = useWorkspaceStore((s) => s.pushToast);
  const hapticsEnabled = useWorkspaceStore((s) => s.hapticsEnabled);
  const [preparing, setPreparing] = useState(false);
  const primaryOpponent = data?.opponentTeams.find((team) => team.id === data.priorityInsights[0]?.opponentTeamId) ?? data?.opponentTeams[0];
  const secondaryOpponent = data?.opponentTeams.find((team) => team.id !== primaryOpponent?.id) ?? primaryOpponent;

  const load = useCallback(() => {
    setError(null);
    setData(null);
    apiFetch<DashboardData>("/api/dashboard")
      .then((d) => {
        setData(d);
        if (d.priorityInsights[0]) setSelectedOpponent(d.priorityInsights[0].opponentTeamId);
      })
      .catch((e: ApiClientError) => setError(e));
  }, [setSelectedOpponent]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const prepare = async (opponent: string, format: "BO3" | "BO5", rulesetId: string, mode: "none" | "hard" | "soft") => {
    if (data?.dataset.provider === "grid") {
      navigate("draft");
      pushToast("Choose our team and opponent from the imported GRID teams.");
      return;
    }
    setPreparing(true);
    haptic("pick", hapticsEnabled);
    try {
      const session = await apiPost<DraftSession>("/api/draft/sessions", {
        opponentTeamId: opponent,
        format,
        rulesetId,
        modeOverride: mode,
      });
      setActiveSession(session);
      haptic("complete", hapticsEnabled);
      pushToast(`Draft session ready vs ${opponent} (${format}, ${mode === "none" ? "standard" : `${mode} fearless`}). Opening the Draft Room…`);
      navigate("draft");
    } catch (e) {
      pushToast(
        e instanceof ApiClientError
          ? `Could not create the draft session — ${e.message} (${e.code}). Check the connection in Data Sources and try again.`
          : "Could not create the draft session. Check your connection and try again.",
        "error",
      );
    } finally {
      setPreparing(false);
    }
  };

  if (error) {
    return <ErrorState code={error.code} message={error.message} recovery={error.recovery} retryable={error.retryable} onRetry={load} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* A. Header */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-6 py-6 shadow-sm sm:px-8 sm:py-8">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="editorial-title text-3xl leading-tight text-[var(--text-primary)] sm:text-4xl">
                Prepare with the series in view.
              </h1>
              {data?.dataset.provider === "fixture" && <FixtureBadge />}
            </div>
            <p className="mt-1.5 max-w-xl text-sm text-[var(--text-secondary)]">
              Upcoming preparation:{" "}
              {data?.upcoming[0] ? (
                <span className="text-[var(--text-primary)]">
                  {data.upcoming[0].opponent} · {data.upcoming[0].tournament} · {data.upcoming[0].date} ({data.upcoming[0].format}, {data.upcoming[0].fearless})
                </span>
              ) : (
                data ? "no scheduled series — start a practice draft below" : "loading fixture schedule…"
              )}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full border border-[var(--border-active)] bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[var(--text-secondary)]">dataset {data?.dataset.datasetId ?? "…"}</span>
              <span className="rounded-full border border-[var(--accent-green)]/40 bg-[var(--accent-green)]/10 px-2.5 py-1 text-[var(--accent-green)]">{data?.dataset.label ?? "Loading data source…"}</span>
            </div>
          </div>
          <div className="max-w-60 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Match-day sequence</p>
            <p className="editorial-title mt-3 text-xl">Scout. Draft. Review.</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">Move from opponent tendencies to a versioned series plan.</p>
          </div>
        </div>
      </section>

      {/* B. Intelligence overview — verified values only */}
      <section aria-label="Intelligence overview" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {data ? (
          <>
            <StatTile label="Series processed" value={data.dataset.seriesCount} detail="completed fixture series" evidenceId={data.dataset.evidenceIds.seriesCount} />
            <StatTile label="Games analyzed" value={data.dataset.gameCount} detail="with draft + result coverage" tone="accent" evidenceId={data.dataset.evidenceIds.gameCount} />
            <StatTile label="Opponents available" value={data.dataset.opponents} detail="fixture roster profiles" tone="violet" evidenceId={data.dataset.evidenceIds.opponents} />
            <StatTile label="Champion coverage" value={data.dataset.championCoverage} detail="distinct champions picked" evidenceId={data.dataset.evidenceIds.championCoverage} />
            <StatTile label="Dataset freshness" value={data.dataset.freshness} detail="latest covered fixture game" evidenceId={data.dataset.evidenceIds.freshness} />
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-[86px]" />)
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* C. Priority intelligence */}
        <Panel
          title="Priority intelligence"
          subtitle="Three most relevant opponent tendencies, each traceable to evidence"
          className="xl:col-span-2"
          actions={<button type="button" onClick={() => navigate("scouting")} className="min-h-[36px] px-1 text-xs font-medium text-[var(--accent-cyan)] hover:underline">Open Opponent Intelligence →</button>}
        >
          {data ? (
            data.priorityInsights.length ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {data.priorityInsights.map((insight) => (
                  <article key={insight.id} className="flex flex-col gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent-violet)]">{insight.insightType.replace("-", " ")}</span>
                      <ConfidenceBadge strength={insight.metric.strength} />
                    </div>
                    <h3 className="text-sm font-medium leading-snug text-[var(--text-primary)]">{insight.title}</h3>
                    <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{insight.summary}</p>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2.5">
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">
                        vs {insight.opponentName} · {insight.side} · {insight.patchContext}
                      </span>
                      <EvidenceChip evidenceId={insight.evidenceId} compact />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No priority findings" message="There are no qualifying fixture tendencies yet. Open scouting to inspect available opponent profiles." action={<button type="button" onClick={() => navigate("scouting")} className="min-h-[44px] rounded-md border border-[var(--border-active)] px-3 text-xs font-medium">Open scouting</button>} />
            )
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-40" />
              ))}
            </div>
          )}
        </Panel>

        {/* D. Series preparation */}
        <Panel title="Series preparation" subtitle="Start a draft workspace against any opponent">
          {data ? (
            <div className="flex flex-col gap-3">
              {data.upcoming.length > 0 ? (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Scheduled</p>
                  {data.upcoming.map((u) => (
                    <p key={u.id} className="mt-1 text-sm text-[var(--text-primary)]">
                      vs <span className="font-semibold">{u.opponent}</span> — {u.tournament} ({u.format}, {u.fearless} fearless)
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={preparing || !primaryOpponent}
                  onClick={() => primaryOpponent && prepare(primaryOpponent.id, "BO5", "ff-hard-bo5", "hard")}
                  className="flex items-center justify-center gap-2 rounded-lg border border-[var(--accent-cyan)]/50 bg-[var(--accent-cyan)]/10 px-3 py-2.5 text-xs font-medium text-[var(--accent-cyan)] transition-colors hover:bg-[var(--accent-cyan)]/20 disabled:opacity-50"
                >
                  <PickGlyph size={14} /> BO5 Hard Fearless vs {primaryOpponent?.shortName ?? "opponent unavailable"}
                </button>
                <button
                  type="button"
                  disabled={preparing || !primaryOpponent}
                  onClick={() => primaryOpponent && prepare(primaryOpponent.id, "BO3", "std-bo3", "none")}
                  className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-active)] bg-[var(--surface-2)] px-3 py-2.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-cyan)] disabled:opacity-50"
                >
                  <PickGlyph size={14} /> BO3 Standard vs {primaryOpponent?.shortName ?? "opponent unavailable"}
                </button>
                <button
                  type="button"
                  disabled={preparing || !secondaryOpponent}
                  onClick={() => secondaryOpponent && prepare(secondaryOpponent.id, "BO5", "ff-soft-bo5", "soft")}
                  className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-active)] bg-[var(--surface-2)] px-3 py-2.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-violet)] disabled:opacity-50"
                >
                  <SeriesGlyph size={14} /> BO5 Soft Fearless vs {secondaryOpponent?.shortName ?? "opponent unavailable"}
                </button>
                <button
                  type="button"
                  onClick={() => navigate("series-lab")}
                  className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[var(--border-active)] bg-[var(--surface-2)] px-3 py-2.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-violet)]"
                >
                  <RadarGlyph size={14} /> Open Fearless Lab
                </button>
              </div>
              <button
                type="button"
                onClick={() => navigate("data-sources")}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-cyan)]"
              >
                <ImportGlyph size={14} /> Inspect the data source
              </button>
            </div>
          ) : (
            <SkeletonBlock className="h-52" />
          )}
        </Panel>
      </div>

      {/* E. Signal activity */}
      <Panel title="Signal activity" subtitle="Most recent completed imports, analyses and draft sessions">
        {data ? (
          data.recentSessions.length > 0 ? (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {data.recentSessions.slice(0, 5).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${s.status === "completed" ? "bg-[var(--accent-green)]/10 text-[var(--accent-green)]" : s.status === "active" ? "bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]"}`}>
                      {s.status}
                    </span>
                    <span className="text-sm text-[var(--text-primary)]">
                      {s.format} draft vs {s.opponentTeamId} · {s.mode === "none" ? "standard" : `${s.mode} fearless`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px] text-[var(--text-muted)]">
                    <span>game {s.currentGame}</span>
                    <span>v{s.stateVersion}</span>
                    <span>{new Date(s.updatedAt).toLocaleTimeString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No draft sessions yet"
              message="Create your first draft session from Series preparation, or start one directly in the Draft Room."
              action={
                <button type="button" onClick={() => prepare("NVX", "BO3", "std-bo3", "none")} className="rounded-md border border-[var(--accent-cyan)]/50 px-3 py-1.5 text-xs text-[var(--accent-cyan)]">
                  Create a BO3 vs NVX
                </button>
              }
            />
          )
        ) : (
          <SkeletonBlock className="h-40" />
        )}
      </Panel>

      {/* F. Quick start */}
      <Panel title="Quick start" subtitle="Four actions that cover the full preparation loop">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Scout an opponent", route: "scouting" as const, glyph: RadarGlyph },
            { label: "Start a draft", route: "draft" as const, glyph: PickGlyph },
            { label: "Open the Fearless Lab", route: "series-lab" as const, glyph: SeriesGlyph },
            { label: "Inspect the data source", route: "data-sources" as const, glyph: ImportGlyph },
          ].map((q) => (
            <button
              key={q.route}
              type="button"
              onClick={() => navigate(q.route)}
              className="flex min-h-[44px] items-center gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 px-4 py-3 text-left text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-cyan)]"
            >
              <span className="text-[var(--accent-cyan)]"><q.glyph size={16} /></span>
              {q.label}
            </button>
          ))}
        </div>
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/5 px-3 py-2 text-[11px] leading-relaxed text-[var(--accent-amber)]">
          <RiskGlyph size={13} />
          Each statistic opens its evidence record. Fixture data is illustrative, not a live feed or official competition result.
        </p>
      </Panel>
    </div>
  );
}
