import { ok, handler } from "@/lib/api/respond";
import { FIXTURE_GAMES, FIXTURE_SERIES, FIXTURE_INFO } from "@/fixtures/dataset";
import { TEAMS, TEAM_INDEX } from "@/fixtures/teams";
import { ScoutingContext, buildInsights } from "@/domain/analytics/scouting-context";
import { EvidenceLedger } from "@/domain/evidence/builder";
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
  const opponentTeams = TEAMS.filter((team) => team.id !== "SGT").map(({ id, name, shortName }) => ({ id, name, shortName }));
  const championCoverage = new Set(gamesAnalyzed.flatMap((g) => g.draft.picks.map((p) => p.championId))).size;
  const freshness = gamesAnalyzed.map((g) => g.startedAt).sort().at(-1) ?? FIXTURE_INFO.generatedAt;
  const metricLedger = new EvidenceLedger();
  const analyzedGameIds = gamesAnalyzed.map((game) => game.id);
  const metricEvidenceIds = {
    seriesCount: metricLedger.addStat({
      provider: "fixture",
      sourceId: FIXTURE_INFO.datasetId,
      gameIds: completedSeries.flatMap((series) => series.gameIds),
      stat: { definition: "completed fixture series count", numerator: completedSeries.length, denominator: 1, value: completedSeries.length, sampleSize: completedSeries.length, confidence: null },
    }).id,
    gameCount: metricLedger.addStat({
      provider: "fixture",
      sourceId: FIXTURE_INFO.datasetId,
      gameIds: analyzedGameIds,
      stat: { definition: "fixture games with draft and result coverage", numerator: gamesAnalyzed.length, denominator: 1, value: gamesAnalyzed.length, sampleSize: gamesAnalyzed.length, confidence: null },
    }).id,
    opponents: metricLedger.addStat({
      provider: "fixture",
      sourceId: FIXTURE_INFO.datasetId,
      gameIds: [],
      extraLimitations: ["Roster count excludes the configured home team and is not a game-level sample."],
      stat: { definition: "distinct fixture opponent teams", numerator: opponentTeams.length, denominator: 1, value: opponentTeams.length, sampleSize: opponentTeams.length, confidence: null },
    }).id,
    championCoverage: metricLedger.addStat({
      provider: "fixture",
      sourceId: FIXTURE_INFO.datasetId,
      gameIds: analyzedGameIds,
      stat: { definition: "distinct champions picked in covered fixture games", numerator: championCoverage, denominator: 1, value: championCoverage, sampleSize: gamesAnalyzed.length, confidence: null },
    }).id,
    freshness: metricLedger.addStat({
      provider: "fixture",
      sourceId: FIXTURE_INFO.datasetId,
      gameIds: gamesAnalyzed.filter((game) => game.startedAt === freshness).map((game) => game.id),
      stat: { definition: `most recent covered fixture game date (${freshness.slice(0, 10)})`, numerator: 1, denominator: 1, value: null, sampleSize: 1, confidence: null },
    }).id,
  };
  registerLedgerRecords(metricLedger);

  // Priority intelligence: strongest insights across all opponents, sorted by strength then sample.
  const rank = { high: 3, moderate: 2, low: 1 } as const;
  const all: (Insight & { opponentName: string })[] = [];
  for (const team of opponentTeams) {
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
        opponents: opponentTeams.length,
        championCoverage,
        freshness: freshness.slice(0, 10),
        datasetId: FIXTURE_INFO.datasetId,
        evidenceIds: metricEvidenceIds,
      },
      opponentTeams,
      upcoming,
      priorityInsights,
      recentSessions,
    },
    req,
  );
});
