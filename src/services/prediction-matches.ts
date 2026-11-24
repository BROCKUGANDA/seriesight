import type { Game } from "@/domain/types";
import type { LabelledMatch } from "@/domain/prediction";
import type { GridHistoricalSeries } from "@/lib/providers/grid/grid-history";
import { CHAMPIONS } from "@/fixtures/champions";

const canonical = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const championNames = new Map(CHAMPIONS.flatMap((c) => [[canonical(c.id), c.id], [canonical(c.canonicalName), c.id], [canonical(c.displayName), c.id]]));
export function historicalPredictionMatches(history: readonly GridHistoricalSeries[]): LabelledMatch[] {
  return history.flatMap((series) => series.games.map((game) => ({
    matchId: `grid:${series.seriesId}:${game.id}`, seriesId: `grid:${series.seriesId}`, startedAt: series.startedAt,
    blueChampions: game.picks.filter((pick) => pick.side === "BLUE").sort((a, b) => a.order - b.order).map((pick) => championNames.get(canonical(pick.championName)) ?? canonical(pick.championName)),
    redChampions: game.picks.filter((pick) => pick.side === "RED").sort((a, b) => a.order - b.order).map((pick) => championNames.get(canonical(pick.championName)) ?? canonical(pick.championName)),
    winner: game.winnerTeamId === game.blueTeamId ? "blue" as const : "red" as const,
    provenance: { kind: "real" as const, source: "grid", sourceMatchId: `${series.seriesId}:${game.id}` },
  })));
}

export function predictionMatches(games: readonly Game[]): LabelledMatch[] {
  return games.filter((game) => game.sourceProvider === "grid" && game.coverage.draft &&
    (game.winnerTeamId === game.blueTeamId || game.winnerTeamId === game.redTeamId))
    .map((game) => ({
      matchId: game.id, seriesId: game.seriesId, startedAt: game.startedAt,
      blueChampions: game.draft.picks.filter((pick) => pick.side === "BLUE").sort((a, b) => a.order - b.order).map((pick) => pick.championId),
      redChampions: game.draft.picks.filter((pick) => pick.side === "RED").sort((a, b) => a.order - b.order).map((pick) => pick.championId),
      winner: game.winnerTeamId === game.blueTeamId ? "blue" : "red",
      provenance: { kind: "real", source: "grid", sourceMatchId: game.id },
    }));
}
