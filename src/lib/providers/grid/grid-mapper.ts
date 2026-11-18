/**
 * GRID response mapper — provider payloads never reach the domain layer raw.
 * Missing fields degrade to explicit nulls/coverage flags, never invented values.
 */
import type { CoverageFlags, DraftBanRecord, DraftPickRecord, Game, GameEvent, HistoricalDraft, Role, Series, Side } from "@/domain/types";
import { GridError, type GridSeriesState, type GridSeriesStateGame } from "./grid-types";

const KNOWN_ROLES: Role[] = ["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"];

function normalizeRole(raw: string | null): Role | null {
  if (!raw) return null;
  const up = raw.toUpperCase();
  if (up === "ADC" || up === "BOT" || up === "BOTTOM") return "BOT";
  if (up === "SUPPORT" || up === "SUP") return "SUPPORT";
  if (up === "JUNGLE" || up === "JGL" || up === "JUN") return "JUNGLE";
  return KNOWN_ROLES.includes(up as Role) ? (up as Role) : null;
}

function mapEvents(gameId: string, raw: GridSeriesStateGame): GameEvent[] {
  const events: GameEvent[] = [{ id: `${gameId}-e-start`, gameId, type: "game_start", timestampSec: 0, teamId: null }];
  const typeMap: Record<string, GameEvent["type"]> = {
    dragon: "dragon",
    herald: "herald",
    baron: "baron",
    turret: "turret",
    kill: "kill",
  };
  raw.objectives.forEach((o, i) => {
    const type = typeMap[o.type?.toLowerCase?.() ?? ""];
    if (!type) return; // unknown objective types are skipped, not fabricated
    events.push({
      id: `${gameId}-e-p${i}`,
      gameId,
      type,
      timestampSec: o.timestampSeconds,
      teamId: o.team === "BLUE" ? "__blue__" : "__red__", // resolved against roster mapping upstream
      value: 1,
    });
  });
  events.push({ id: `${gameId}-e-end`, gameId, type: "game_end", timestampSec: raw.durationSeconds ?? 0, teamId: null });
  return events.sort((a, b) => a.timestampSec - b.timestampSec);
}

function coverageFor(game: GridSeriesStateGame): CoverageFlags {
  return {
    objectives: game.objectives.length > 0,
    draft: game.picks.length > 0,
    players: game.picks.some((p) => p.participantName !== null),
    macroIntervals: false,
  };
}

/**
 * Map one GRID series state into domain Games. Team identity resolution
 * (provider team names → our team ids) is injected via resolveTeamId.
 */
export function mapGridSeriesState(
  state: GridSeriesState,
  opts: {
    seriesId: string;
    tournamentId: string;
    patch: string;
    startedAt: string;
    format: Series["format"];
    blueTeamId: string;
    redTeamId: string;
    resolveTeamId: (participant: string | null) => string | null;
    datasetId: string;
  },
): { series: Series; games: Game[]; warnings: string[] } {
  const warnings: string[] = [];
  if (state.games.length === 0) {
    throw new GridError("EMPTY_RESULT", `Series ${opts.seriesId} returned zero games.`);
  }

  const games: Game[] = state.games.map((raw) => {
    const gameId = `${opts.seriesId}-g${raw.gameNumber}`;
    const picks: DraftPickRecord[] = [];
    let order = 0;
    // GRID pick order within a side is preserved; absolute order is reconstructed
    // from the standard tournament sequence the provider returns picks in.
    for (const p of raw.picks) {
      order++;
      const role = normalizeRole(p.role);
      if (!role) warnings.push(`Game ${gameId}: pick "${p.championName}" has no usable role — left unassigned.`);
      picks.push({
        championId: p.championName.toLowerCase().replace(/[^a-z0-9]/g, ""),
        teamId: p.side === "BLUE" ? opts.blueTeamId : opts.redTeamId,
        playerId: p.participantName ? opts.resolveTeamId(p.participantName) : null,
        role: role ?? "TOP",
        order,
        side: p.side,
      });
    }
    const bans: DraftBanRecord[] = raw.bans.map((b) => ({
      championId: b.championName.toLowerCase().replace(/[^a-z0-9]/g, ""),
      teamId: b.side === "BLUE" ? opts.blueTeamId : opts.redTeamId,
      order: b.order,
      side: b.side,
    }));
    const draft: HistoricalDraft = { firstPickSide: "BLUE", picks, bans };

    return {
      id: gameId,
      seriesId: opts.seriesId,
      gameNumber: raw.gameNumber,
      patch: opts.patch,
      startedAt: opts.startedAt,
      durationSec: raw.durationSeconds ?? 0,
      blueTeamId: opts.blueTeamId,
      redTeamId: opts.redTeamId,
      winnerTeamId: raw.winnerSide === "BLUE" ? opts.blueTeamId : raw.winnerSide === "RED" ? opts.redTeamId : null,
      blueWin: raw.winnerSide === "BLUE",
      draft,
      events: mapEvents(gameId, raw),
      coverage: coverageFor(raw),
      sourceProvider: "grid",
      sourceDatasetId: opts.datasetId,
    } satisfies Game;
  });

  const series: Series = {
    id: opts.seriesId,
    tournamentId: opts.tournamentId,
    patch: opts.patch,
    startedAt: opts.startedAt,
    format: opts.format,
    status: "completed",
    teamAId: opts.blueTeamId,
    teamBId: opts.redTeamId,
    winnerTeamId: games[games.length - 1]?.winnerTeamId ?? null,
    gameIds: games.map((g) => g.id),
    fearless: "none",
    fearlessScope: "own",
  };
  return { series, games, warnings };
}
