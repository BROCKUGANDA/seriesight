import { ok, handler } from "@/lib/api/respond";
import { ScoutingContext, buildInsights, analyticsDataset, datasetTeams } from "@/domain/analytics/scouting-context";
import { EvidenceLedger } from "@/domain/evidence/builder";
import type { Insight } from "@/domain/types";
import { listSessions } from "@/services/draft";
import { registerLedgerRecords } from "@/services/evidence";

export const dynamic = "force-dynamic";

/**
 * Command Center aggregate. Every value is computed from the selected dataset —
 * nothing on the dashboard is hardcoded (PRD D2: "Display only verified values").
 */
export const GET = handler(async (req) => {
  const dataset = analyticsDataset();
  const teams = datasetTeams(dataset);
  const teamIndex = new Map(teams.map((t) => [t.id, t]));
  const completedSeries = dataset.series.filter((s) => s.status === "completed");
  const gamesAnalyzed = dataset.provider === "grid"
    ? teams.flatMap((t) => new ScoutingContext(t.id).draftGames).filter((g, i, all) => all.findIndex((other) => other.id === g.id) === i && g.coverage.draft)
    : dataset.games.filter((g) => g.coverage.draft && g.winnerTeamId !== null);
  const opponentTeams = teams.filter((team) => team.id !== "SGT").map(({ id, name, shortName }) => ({ id, name, shortName }));
  const championCoverage = new Set(gamesAnalyzed.flatMap((g) => g.draft.picks.map((p) => p.championId))).size;
  const freshness = gamesAnalyzed.map((g) => g.startedAt).sort().at(-1) ?? null;
  const metricLedger = new EvidenceLedger();
  const analyzedGameIds = gamesAnalyzed.map((game) => game.id);
  const metricEvidenceIds = {
    seriesCount: metricLedger.addStat({
      provider: dataset.provider,
      sourceId: dataset.datasetId,
      gameIds: analyzedGameIds,
      stat: { definition: "completed selected series count", numerator: completedSeries.length, denominator: 1, value: completedSeries.length, sampleSize: completedSeries.length, confidence: null },
    }).id,
    gameCount: metricLedger.addStat({
      provider: dataset.provider,
      sourceId: dataset.datasetId,
      gameIds: analyzedGameIds,
      stat: { definition: "selected games with draft and result coverage", numerator: gamesAnalyzed.length, denominator: 1, value: gamesAnalyzed.length, sampleSize: gamesAnalyzed.length, confidence: null },
    }).id,
    opponents: metricLedger.addStat({
      provider: dataset.provider,
      sourceId: dataset.datasetId,
      gameIds: [],
      extraLimitations: ["Roster count excludes the configured home team and is not a game-level sample."],
      stat: { definition: "distinct selected opponent teams", numerator: opponentTeams.length, denominator: 1, value: opponentTeams.length, sampleSize: opponentTeams.length, confidence: null },
    }).id,
    championCoverage: metricLedger.addStat({
      provider: dataset.provider,
      sourceId: dataset.datasetId,
      gameIds: analyzedGameIds,
      stat: { definition: "distinct champions picked in covered selected games", numerator: championCoverage, denominator: 1, value: championCoverage, sampleSize: gamesAnalyzed.length, confidence: null },
    }).id,
    freshness: metricLedger.addStat({
      provider: dataset.provider,
      sourceId: dataset.datasetId,
      gameIds: gamesAnalyzed.filter((game) => game.startedAt === freshness).map((game) => game.id),
      stat: { definition: `most recent covered selected game date (${freshness?.slice(0, 10) ?? "unavailable"})`, numerator: freshness ? 1 : 0, denominator: freshness ? 1 : 0, value: null, sampleSize: freshness ? 1 : 0, confidence: null },
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

  const upcoming = dataset.series.filter((s) => s.status === "upcoming").map((s) => ({
    id: s.id,
    opponent: teamIndex.get(s.teamAId === "SGT" ? s.teamBId : s.teamAId)?.shortName,
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
        freshness: freshness?.slice(0, 10) ?? null,
        datasetId: dataset.datasetId,
        provider: dataset.provider,
        label: dataset.label,
        warnings: dataset.warnings,
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
