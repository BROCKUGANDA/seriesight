/**
 * Macro Atlas service (PRD D4). Modules degrade independently — a missing
 * dimension never blocks the whole page; partial coverage is explicit.
 */
import type { Game, MetricStat } from "@/domain/types";
import { TEAM_INDEX } from "@/fixtures/teams";
import { FIXTURE_GAMES_INDEX, FIXTURE_SERIES_INDEX, gamesForTeam } from "@/fixtures/dataset";
import { ScoutingContext, type ScoutingFilters } from "@/domain/analytics/scouting-context";
import { DEFAULT_INTERVALS } from "@/domain/analytics/macro";
import { ERRORS } from "@/domain/errors";

export interface MacroModule {
  id: string;
  title: string;
  description: string;
  status: "available" | "unavailable";
  unavailableReason?: string;
  stat: MetricStat | null;
  supportingStat?: MetricStat | null;
  gameIds: string[];
  patchDistribution: Record<string, number>;
}

export interface MacroAnalysis {
  teamId: string;
  gamesAnalyzed: number;
  objectiveCoverage: number;
  excludedGames: string[];
  modules: MacroModule[];
  intervals: { label: string; dragons: number; heralds: number; barons: number; turrets: number; kills: number; gamesContributing: number }[];
  timeline: {
    gameId: string;
    gameNumber: number;
    seriesId: string;
    patch: string;
    durationSec: number;
    blueTeamId: string;
    redTeamId: string;
    events: { id: string; type: string; timestampSec: number; teamId: string | null; value?: number }[];
  }[];
  evidenceCount: number;
}

function toTimeline(games: Game[]): MacroAnalysis["timeline"] {
  return games.slice(0, 12).map((g) => ({
    gameId: g.id,
    gameNumber: g.gameNumber,
    seriesId: g.seriesId,
    patch: g.patch,
    durationSec: g.durationSec,
    blueTeamId: g.blueTeamId,
    redTeamId: g.redTeamId,
    events: g.events.map((e) => ({ id: e.id, type: e.type, timestampSec: e.timestampSec, teamId: e.teamId, value: e.value })),
  }));
}

export async function getMacroAnalysis(teamId: string, filters: ScoutingFilters): Promise<MacroAnalysis> {
  if (!TEAM_INDEX.has(teamId)) throw ERRORS.unknownTeam(teamId);
  const ctx = new ScoutingContext(teamId, filters);
  const m = ctx.macro();
  const games = ctx.eligibleGames;
  const patchDist = ctx.summary.patchDistribution;
  const excluded = games.filter((g) => !g.coverage.objectives).map((g) => g.id);

  const modules: MacroModule[] = [
    {
      id: "first-dragon",
      title: "First dragon acquisition",
      description: "Share of eligible games where the team secured the first recorded dragon.",
      status: m.firstDragon.stat.denominator > 0 ? "available" : "unavailable",
      unavailableReason: m.firstDragon.stat.denominator === 0 ? "No games in this filter carry objective event coverage." : undefined,
      stat: m.firstDragon.stat.denominator > 0 ? m.firstDragon.stat : null,
      gameIds: m.firstDragon.gameIds,
      patchDistribution: patchDist,
    },
    {
      id: "herald-control",
      title: "Herald control",
      description: "Share of games with a herald event where the team secured it.",
      status: m.herald.stat.denominator > 0 ? "available" : "unavailable",
      unavailableReason: m.herald.stat.denominator === 0 ? "No herald events in the filtered games." : undefined,
      stat: m.herald.stat.denominator > 0 ? m.herald.stat : null,
      gameIds: m.herald.gameIds,
      patchDistribution: patchDist,
    },
    {
      id: "baron-control",
      title: "Baron control",
      description: "Share of games with a baron event where the team secured at least one Baron.",
      status: m.baron.stat.denominator > 0 ? "available" : "unavailable",
      unavailableReason: m.baron.stat.denominator === 0 ? "No baron events in the filtered games." : undefined,
      stat: m.baron.stat.denominator > 0 ? m.baron.stat : null,
      gameIds: m.baron.gameIds,
      patchDistribution: patchDist,
    },
    {
      id: "first-turret",
      title: "Turret progression",
      description: "Rate of first turrets secured plus interval turret pressure.",
      status: m.firstTurret.stat.denominator > 0 ? "available" : "unavailable",
      unavailableReason: m.firstTurret.stat.denominator === 0 ? "No turret events in the filtered games." : undefined,
      stat: m.firstTurret.stat.denominator > 0 ? m.firstTurret.stat : null,
      gameIds: m.firstTurret.gameIds,
      patchDistribution: patchDist,
    },
    {
      id: "early-kills",
      title: "Early-game kill pattern",
      description: "Kills before 15:00 for the team and its opponents across eligible games.",
      status: m.earlyKills.stat.denominator > 0 ? "available" : "unavailable",
      unavailableReason: m.earlyKills.stat.denominator === 0 ? "No kill events in the filtered games." : undefined,
      stat: m.earlyKills.stat.denominator > 0 ? m.earlyKills.stat : null,
      supportingStat: m.earlyKills.opponentStat,
      gameIds: m.earlyKills.gameIds,
      patchDistribution: patchDist,
    },
    {
      id: "duration",
      title: "Game duration",
      description: "Average real game length across completed games in the filter.",
      status: m.duration.stat.denominator > 0 ? "available" : "unavailable",
      stat: m.duration.stat.denominator > 0 ? m.duration.stat : null,
      gameIds: m.duration.gameIds,
      patchDistribution: patchDist,
    },
    {
      id: "economy",
      title: "Early-game economic trend",
      description: "Interval gold / damage aggregates.",
      status: "unavailable",
      unavailableReason:
        "The connected provider does not expose interval gold/damage aggregates for this dataset. Seriesight shows an explicit unavailable state rather than an estimate.",
      stat: null,
      gameIds: [],
      patchDistribution: patchDist,
    },
  ];

  return {
    teamId,
    gamesAnalyzed: games.length,
    objectiveCoverage: m.objectiveCoverage,
    excludedGames: excluded,
    modules,
    intervals: m.intervals,
    timeline: toTimeline(games),
    evidenceCount: ctx.ledger.size(),
  };
}

export function gameDetail(gameId: string): Game | null {
  return FIXTURE_GAMES_INDEX.get(gameId) ?? null;
}

export function seriesDetail(seriesId: string) {
  return FIXTURE_SERIES_INDEX.get(seriesId) ?? null;
}

export function defaultIntervals() {
  return DEFAULT_INTERVALS;
}

export { gamesForTeam };
