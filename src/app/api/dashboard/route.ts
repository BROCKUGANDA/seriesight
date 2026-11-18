import { ok, handler } from "@/lib/api/respond";
import { FIXTURE_GAMES, FIXTURE_SERIES, FIXTURE_INFO } from "@/fixtures/dataset";
import { TEAMS, TEAM_INDEX } from "@/fixtures/teams";
import { ScoutingContext, buildInsights } from "@/domain/analytics/scouting-context";
import type { Insight } from "@/domain/types";
import { listSessions } from "@/services/draft";
import { registerLedgerRecords } from "@/services/evidence";

export const dynamic = "force-dynamic";

/**
 * Command Center aggregate. Every value is computed from the fixture dataset —
 * nothing on the dashboard is hardcoded (PRD D2: "Display only verified values").
 */
export const GET = handler(async (req) => {
  const completedSeries = FIXTURE_SERIES.filter((s) => s.status === "completed");
  const gamesAnalyzed = FIXTURE_GAMES.filter((g) => g.coverage.draft && g.winnerTeamId !== null);
  const championCoverage = new Set(gamesAnalyzed.flatMap((g) => g.draft.picks.map((p) => p.championId))).size;
  const freshness = gamesAnalyzed.map((g) => g.startedAt).sort().at(-1) ?? FIXTURE_INFO.generatedAt;

  // Priority intelligence: strongest insights across all opponents, sorted by strength then sample.
  const rank = { high: 3, moderate: 2, low: 1 } as const;
  const all: (Insight & { opponentName: string })[] = [];
  for (const team of TEAMS.filter((t) => t.id !== "SGT")) {
    const ctx = new ScoutingContext(team.id);
    const insights = buildInsights(ctx);
    for (const insight of insights) {
      const rec = ctx.ledger.get(insight.evidenceId);
      if (rec) rec.insightId = insight.id;
    }
    registerLedgerRecords(ctx.ledger);
    for (const i of insights) all.push({ ...i, opponentName: team.shortName });
  }
  const priorityInsights = all
    .sort((a, b) => rank[b.metric.strength] - rank[a.metric.strength] || b.metric.sampleSize - a.metric.sampleSize)
    .slice(0, 3);

  const upcoming = FIXTURE_SERIES.filter((s) => s.status === "upcoming").map((s) => ({
    id: s.id,
    opponent: (s.teamAId === "SGT" ? s.teamBId : s.teamAId) && TEAM_INDEX.get(s.teamAId === "SGT" ? s.teamBId : s.teamAId)?.shortName,
    tournament: s.tournamentId,
    date: s.startedAt.slice(0, 10),
    format: s.format,
    fearless: s.fearless === "none" ? "standard" : `${s.fearless}`,
  }));

  const recentSessions = await listSessions(6);

  return ok(
    {
      dataset: {
        seriesCount: completedSeries.length,
        gameCount: gamesAnalyzed.length,
        opponents: TEAMS.filter((t) => t.id !== "SGT").length,
        championCoverage,
        freshness: freshness.slice(0, 10),
        datasetId: FIXTURE_INFO.datasetId,
      },
      upcoming,
      priorityInsights,
      recentSessions,
    },
    req,
  );
});
