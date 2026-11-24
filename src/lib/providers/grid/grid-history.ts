import { z } from "zod";
import { gridRequest, type GridClientConfig } from "./grid-client";
import { HISTORICAL_CENTRAL_SELECTION, HISTORICAL_STATE_SELECTION, inspectGridSchema } from "./grid-schema";
import { GridError } from "./grid-types";

const text = z.string().min(1).max(500);
const sequence = z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).pipe(z.number().int().positive());
const side = z.enum(["BLUE", "RED"]);
const role = z.enum(["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"]);
const entity = z.object({ id: text, name: text });
const player = entity.extend({ role: z.string().nullish(), character: entity.nullish() });
const action = z.object({ type: z.enum(["pick", "ban"]), sequenceNumber: sequence,
  drafter: z.object({ id: text, type: text }), draftable: entity.extend({ type: text }),
});
const centralSchema = z.object({ series: z.object({ id: text, startTimeScheduled: z.iso.datetime({ offset: true }),
  title: z.object({ nameShortened: text }), tournament: entity,
  teams: z.array(z.object({ baseInfo: entity })).length(2),
}) });
const stateSchema = z.object({ seriesState: z.object({ id: text, finished: z.literal(true), updatedAt: z.iso.datetime({ offset: true }),
  format: text, title: z.object({ nameShortened: text }),
  teams: z.array(entity.extend({ won: z.boolean() })).length(2),
  games: z.array(z.object({ id: text, sequenceNumber: sequence, finished: z.literal(true),
    duration: z.number().positive().nullish(), clock: z.object({ currentSeconds: z.number().positive() }).nullish(),
    teams: z.array(entity.extend({ side: z.string(), won: z.boolean(), players: z.array(player) })).length(2),
    draftActions: z.array(action).min(10).max(20),
  })).min(1).max(5),
}) });

export const historicalSeriesSchema = z.object({
  provider: z.literal("grid"), seriesId: text, datasetId: text, fetchedAt: z.iso.datetime({ offset: true }),
  providerUpdatedAt: z.iso.datetime({ offset: true }), startedAt: z.iso.datetime({ offset: true }),
  tournament: entity, teams: z.array(entity).length(2), winnerTeamId: text,
  format: z.enum(["BO1", "BO3", "BO5"]), patch: z.string().nullable(),
  games: z.array(z.object({
    id: text, gameNumber: sequence, blueTeamId: text, redTeamId: text, winnerTeamId: text,
    durationSec: z.number().positive().nullable(),
    picks: z.array(z.object({ championName: text, providerChampionId: text, teamId: text, side,
      order: sequence, playerId: z.string().nullable(), role: role.nullable(),
    })).length(10),
    bans: z.array(z.object({ championName: text, providerChampionId: text, teamId: text, side, order: sequence })).max(10),
  })).min(1).max(5),
  warnings: z.array(z.string()),
});
export type GridHistoricalSeries = z.infer<typeof historicalSeriesSchema>;

function invalid(message: string): never { throw new GridError("PARTIAL_GAME_DATA", message); }
function providerSide(value: string): "BLUE" | "RED" {
  const parsed = side.safeParse(value.toUpperCase());
  if (!parsed.success) return invalid("GRID game is missing an explicit blue/red side assignment.");
  return parsed.data;
}
function providerRole(value: string | null | undefined): z.infer<typeof role> | null {
  const aliases: Record<string, string> = { ADC: "BOT", BOTTOM: "BOT", JGL: "JUNGLE", SUP: "SUPPORT" };
  const upper = value?.toUpperCase() ?? "";
  const parsed = role.safeParse(aliases[upper] ?? upper);
  return parsed.success ? parsed.data : null;
}

/** Official aggregated completed-series state, never fixture data or inferred events. */
export function normalizeGridHistory(central: unknown, state: unknown, requestedId: string): GridHistoricalSeries {
  const c = centralSchema.safeParse(central);
  const s = stateSchema.safeParse(state);
  if (!c.success || !s.success) throw new GridError("INVALID_SCHEMA", "GRID completed series payload is incomplete or does not match the verified historical contract.");
  const meta = c.data.series;
  const raw = s.data.seriesState;
  if (meta.id !== requestedId || raw.id !== requestedId) invalid("GRID returned a different series identity.");
  if (![meta.title.nameShortened, raw.title.nameShortened].every((t) => ["lol", "league-of-legends"].includes(t.toLowerCase()))) {
    throw new GridError("UNSUPPORTED_TITLE", "Only League of Legends historical series are supported.");
  }
  const format = ({ "best-of-1": "BO1", "best-of-3": "BO3", "best-of-5": "BO5" } as const)[raw.format as "best-of-1"];
  if (!format) invalid("GRID series format is unsupported.");
  const ids = meta.teams.map((t) => t.baseInfo.id);
  if (new Set(ids).size !== 2 || raw.teams.some((t) => !ids.includes(t.id)) || new Set(raw.teams.map((t) => t.id)).size !== 2) invalid("GRID series team identities are inconsistent.");
  const winners = raw.teams.filter((t) => t.won);
  if (winners.length !== 1) invalid("GRID completed series has no unambiguous winner.");
  const games = raw.games.map((game) => {
    const teams = game.teams.map((t) => ({ ...t, side: providerSide(t.side) }));
    const blue = teams.find((t) => t.side === "BLUE");
    const red = teams.find((t) => t.side === "RED");
    if (!blue || !red || blue.id === red.id || teams.some((t) => !ids.includes(t.id))) invalid("GRID game team/side identities are inconsistent.");
    const won = teams.filter((t) => t.won);
    if (won.length !== 1) invalid("GRID completed game has no unambiguous winner.");
    const actions = [...game.draftActions].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    if (new Set(actions.map((a) => a.sequenceNumber)).size !== actions.length) invalid("GRID draft action order is ambiguous.");
    const picks: GridHistoricalSeries["games"][number]["picks"] = [];
    const bans: GridHistoricalSeries["games"][number]["bans"] = [];
    for (const a of actions) {
      if (!["champion", "character"].includes(a.draftable.type.toLowerCase())) invalid("GRID draftable is not a champion.");
      const team = teams.find((t) => a.drafter.type === "team" ? t.id === a.drafter.id : a.drafter.type === "player" && t.players.some((p) => p.id === a.drafter.id));
      if (!team) invalid("GRID draft action cannot be attributed to a team.");
      const base = { championName: a.draftable.name, providerChampionId: a.draftable.id, teamId: team.id, side: team.side };
      if (a.type === "ban") bans.push({ ...base, order: bans.length + 1 });
      else {
        const participants = team.players.filter((p) => p.character?.id === a.draftable.id);
        if (participants.length > 1) invalid("GRID champion has ambiguous player attribution.");
        const p = participants[0];
        picks.push({ ...base, order: picks.length + 1, playerId: p?.id ?? null, role: providerRole(p?.role) });
      }
    }
    if (picks.length !== 10 || teams.some((t) => picks.filter((p) => p.teamId === t.id).length !== 5) || new Set(picks.map((p) => p.providerChampionId)).size !== 10) invalid("GRID completed game requires ten unique attributed champion picks.");
    if (new Set(bans.map((b) => b.providerChampionId)).size !== bans.length || bans.some((b) => picks.some((p) => p.providerChampionId === b.providerChampionId))) invalid("GRID picks and bans are inconsistent.");
    return { id: game.id, gameNumber: game.sequenceNumber, blueTeamId: blue.id, redTeamId: red.id,
      winnerTeamId: won[0].id, durationSec: game.duration ?? game.clock?.currentSeconds ?? null, picks, bans };
  }).sort((a, b) => a.gameNumber - b.gameNumber);
  if (new Set(games.map((g) => g.id)).size !== games.length || games.some((g, i) => g.gameNumber !== i + 1)) invalid("GRID game sequence is incomplete or duplicated.");
  const winsNeeded = (Number(format.slice(2)) + 1) / 2;
  const winnerGames = games.filter((g) => g.winnerTeamId === winners[0].id).length;
  if (winnerGames !== winsNeeded || games.filter((g) => g.winnerTeamId !== winners[0].id).length >= winsNeeded || games[games.length - 1].winnerTeamId !== winners[0].id) invalid("GRID game results do not match the completed series outcome.");
  return historicalSeriesSchema.parse({ provider: "grid", seriesId: requestedId, datasetId: `grid:${requestedId}`,
    fetchedAt: new Date().toISOString(), providerUpdatedAt: raw.updatedAt, startedAt: meta.startTimeScheduled,
    tournament: meta.tournament, teams: meta.teams.map((t) => t.baseInfo), winnerTeamId: winners[0].id, format, patch: null, games,
    warnings: ["Match patch and draft policy are not supplied by this projection; they are unknown.", "Objective timelines and macro intervals are not supplied by aggregated state.",
      ...(games.some((g) => g.picks.some((p) => !p.role)) ? ["Some player roles are unavailable; no roles were inferred."] : [])],
  });
}

/** Fetch by official series ID. Schema introspection is required for this account. */
export async function fetchGridHistoricalSeries(seriesId: string, config?: GridClientConfig): Promise<GridHistoricalSeries> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(seriesId)) throw new GridError("INVALID_QUERY", "A valid GRID series ID is required.");
  const central = await inspectGridSchema("centralData", config);
  const state = await inspectGridSchema("seriesState", config);
  const metadata = await gridRequest<unknown>({ endpoint: "centralData", query: central.query("series", "id", HISTORICAL_CENTRAL_SELECTION), variables: { id: seriesId } }, config);
  const snapshot = await gridRequest<unknown>({ endpoint: "seriesState", query: state.query("seriesState", "id", HISTORICAL_STATE_SELECTION), variables: { id: seriesId } }, config);
  return normalizeGridHistory(metadata, snapshot, seriesId);
}