/**
 * Macro metric calculators (PRD I8). Each calculator is independent, documents its
 * input requirements and returns null (unavailable) instead of estimating when the
 * event sequence it needs is missing. Provenance travels with every result.
 */
import type { Game, GameEvent, MetricStat, Side } from "@/domain/types";
import { rateStat } from "./stats";

export interface MacroSample {
  game: Game;
  /** Team whose perspective the metric is computed from. */
  teamId: string;
  side: Side;
  events: GameEvent[];
}

/** Eligible = game has objective event coverage. Ineligible games are counted, not silently dropped. */
export function eligibleObjectiveGames(games: Game[], teamId: string): MacroSample[] {
  return games
    .filter((g) => g.coverage.objectives)
    .map((g) => ({
      game: g,
      teamId,
      side: g.blueTeamId === teamId ? "BLUE" : "RED",
      events: g.events.filter((e) => e.teamId === teamId || e.type === "game_start" || e.type === "game_end"),
    }));
}

export function firstObjectiveEvent(events: GameEvent[], type: GameEvent["type"]): GameEvent | null {
  return events.filter((e) => e.type === type).sort((a, b) => a.timestampSec - b.timestampSec)[0] ?? null;
}

/** Rate of games where the team secured the FIRST dragon of the game. */
export function firstDragonRate(games: Game[], teamId: string): { stat: MetricStat; gameIds: string[]; winningGameIds: string[] } {
  const eligible = eligibleObjectiveGames(games, teamId);
  let hits = 0;
  const gameIds: string[] = [];
  const winning: string[] = [];
  for (const s of eligible) {
    gameIds.push(s.game.id);
    const first = s.game.events.filter((e) => e.type === "dragon").sort((a, b) => a.timestampSec - b.timestampSec)[0];
    if (first && first.teamId === teamId) {
      hits++;
      winning.push(s.game.id);
    }
  }
  return { stat: rateStat({ definition: "first_dragon_rate (eligible games)", numerator: hits, denominator: eligible.length }), gameIds, winningGameIds: winning };
}

/** Rate of games where the team secured the Rift Herald (when a herald event exists). */
export function heraldControlRate(games: Game[], teamId: string): { stat: MetricStat; gameIds: string[] } {
  const eligible = eligibleObjectiveGames(games, teamId).filter((s) =>
    s.game.events.some((e) => e.type === "herald"),
  );
  let hits = 0;
  const gameIds: string[] = [];
  for (const s of eligible) {
    gameIds.push(s.game.id);
    if (s.game.events.some((e) => e.type === "herald" && e.teamId === teamId)) hits++;
  }
  return { stat: rateStat({ definition: "herald_secured_rate (games with a herald event)", numerator: hits, denominator: eligible.length }), gameIds };
}

/** Rate of games where the team secured at least one Baron. */
export function baronControlRate(games: Game[], teamId: string): { stat: MetricStat; gameIds: string[] } {
  const eligible = eligibleObjectiveGames(games, teamId).filter((s) => s.game.events.some((e) => e.type === "baron"));
  let hits = 0;
  const gameIds: string[] = [];
  for (const s of eligible) {
    gameIds.push(s.game.id);
    if (s.game.events.some((e) => e.type === "baron" && e.teamId === teamId)) hits++;
  }
  return { stat: rateStat({ definition: "baron_secured_rate (games with a baron event)", numerator: hits, denominator: eligible.length }), gameIds };
}

/** Rate of games where the team took the first turret. */
export function firstTurretRate(games: Game[], teamId: string): { stat: MetricStat; gameIds: string[] } {
  const eligible = eligibleObjectiveGames(games, teamId);
  let hits = 0;
  const gameIds: string[] = [];
  for (const s of eligible) {
    gameIds.push(s.game.id);
    const first = s.game.events.filter((e) => e.type === "turret").sort((a, b) => a.timestampSec - b.timestampSec)[0];
    if (first && first.teamId === teamId) hits++;
  }
  return { stat: rateStat({ definition: "first_turret_rate (eligible games)", numerator: hits, denominator: eligible.length }), gameIds };
}

/** Kills before the configured boundary (default 15:00) per game, team vs opponent. */
export function earlyKillPattern(games: Game[], teamId: string, boundarySec = 900): { stat: MetricStat; opponentStat: MetricStat; gameIds: string[] } {
  const eligible = eligibleObjectiveGames(games, teamId);
  let ours = 0;
  let theirs = 0;
  const gameIds: string[] = [];
  for (const s of eligible) {
    gameIds.push(s.game.id);
    const kills = s.game.events.filter((e) => e.type === "kill" && e.timestampSec <= boundarySec);
    ours += kills.filter((e) => e.teamId === teamId).length;
    theirs += kills.filter((e) => e.teamId !== teamId && e.teamId !== null).length;
  }
  return {
    stat: rateStat({ definition: `kills_first_${Math.round(boundarySec / 60)}_min (count)`, numerator: ours, denominator: eligible.length, unit: "count" }),
    opponentStat: rateStat({ definition: `opponent_kills_first_${Math.round(boundarySec / 60)}_min (count)`, numerator: theirs, denominator: eligible.length, unit: "count" }),
    gameIds,
  };
}

/** Average game duration in seconds; null when no completed games carry duration. */
export function averageDuration(games: Game[]): { stat: MetricStat; gameIds: string[] } {
  const withDuration = games.filter((g) => g.durationSec > 0);
  const total = withDuration.reduce((s, g) => s + g.durationSec, 0);
  return {
    stat: rateStat({
      definition: "average_game_duration (seconds)",
      numerator: withDuration.length > 0 ? total : 0,
      denominator: withDuration.length,
      unit: "seconds",
    }),
    gameIds: withDuration.map((g) => g.id),
  };
}

/** Interval breakdown of objective/kill events. Boundaries are configurable minutes. */
export const DEFAULT_INTERVALS = [
  { label: "0–10 min", from: 0, to: 600 },
  { label: "10–20 min", from: 600, to: 1200 },
  { label: "20–30 min", from: 1200, to: 1800 },
  { label: "30+ min", from: 1800, to: Number.POSITIVE_INFINITY },
];

export interface IntervalBucket {
  label: string;
  dragons: number;
  heralds: number;
  barons: number;
  turrets: number;
  kills: number;
  gamesContributing: number;
}

export function intervalBreakdown(games: Game[], teamId: string, intervals = DEFAULT_INTERVALS): IntervalBucket[] {
  const eligible = eligibleObjectiveGames(games, teamId);
  return intervals.map((iv) => {
    const b: IntervalBucket = { label: iv.label, dragons: 0, heralds: 0, barons: 0, turrets: 0, kills: 0, gamesContributing: 0 };
    for (const s of eligible) {
      const inRange = s.game.events.filter((e) => e.timestampSec >= iv.from && e.timestampSec < iv.to);
      if (inRange.length === 0) continue;
      b.gamesContributing++;
      for (const e of inRange) {
        if (e.teamId !== teamId) continue;
        if (e.type === "dragon") b.dragons++;
        else if (e.type === "herald") b.heralds++;
        else if (e.type === "baron") b.barons++;
        else if (e.type === "turret") b.turrets++;
        else if (e.type === "kill") b.kills++;
      }
    }
    return b;
  });
}
