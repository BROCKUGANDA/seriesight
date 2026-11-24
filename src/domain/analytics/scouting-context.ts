/**
 * Scouting context — the single source of computed opponent/team statistics.
 * Deterministic: same team + same filters + same dataset ⇒ identical output.
 */
import type {
  ConfidenceInterval,
  Game,
  Insight,
  MetricStat,
  Role,
  Side,
  Tournament,
} from "@/domain/types";
import { CHAMPIONS, getChampion } from "@/fixtures/champions";
import { FIXTURE_GAMES, FIXTURE_SERIES, FIXTURE_INFO } from "@/fixtures/dataset";
import { TEAMS, TOURNAMENTS } from "@/fixtures/teams";
import { selectedDataset, type SelectedDataset, type DatasetSeries } from "@/services/dataset";
import { identityContext } from "@/lib/auth";
import { ANALYSIS_VERSION, EvidenceLedger } from "@/domain/evidence/builder";
import { evidenceStrength, rateStat, wilsonInterval, Z_95 } from "./stats";
import {
  baronControlRate,
  earlyKillPattern,
  firstDragonRate,
  firstTurretRate,
  heraldControlRate,
  intervalBreakdown,
} from "./macro";

export interface ScoutingFilters {
  tournamentId?: string;
  patch?: string;
  side?: Side | "both";
  fromDate?: string;
  toDate?: string;
  gameNumber?: number;
  role?: Role | "all";
}

export function analyticsDataset(): SelectedDataset {
  const identity = identityContext.getStore();
  const dataset = identity ? selectedDataset() : undefined;
  return (dataset?.provider !== "grid" || identity?.kind === "coach" ? dataset : undefined) ?? {
    provider: "fixture", datasetId: FIXTURE_INFO.datasetId, label: FIXTURE_INFO.label,
    games: FIXTURE_GAMES, series: FIXTURE_SERIES, historicalSeries: [],
    warnings: ["Illustrative fixture data, not official GRID results."],
  };
}

export function datasetTeams(dataset = analyticsDataset()) {
  if (dataset.provider === "fixture") return TEAMS;
  return [...new Map(dataset.historicalSeries.flatMap((s) => s.teams).map((t) => [t.id, {
    id: `grid:${t.id}`, name: t.name, shortName: t.name, region: "unknown", roster: [],
  }])).values()];
}

type DatasetTournament = Omit<Tournament, "tier" | "startDate" | "endDate" | "draftPolicy"> & {
  tier: Tournament["tier"] | null;
  startDate: string | null;
  endDate: string | null;
  draftPolicy: Tournament["draftPolicy"] | null;
};

export function datasetTournaments(dataset = analyticsDataset()): DatasetTournament[] {
  if (dataset.provider === "fixture") return TOURNAMENTS;
  return [...new Map(dataset.historicalSeries.map((s) => [s.tournament.id, {
    id: `grid:${s.tournament.id}`, title: s.tournament.name, tier: null, region: "unknown",
    startDate: null, endDate: null, draftPolicy: null,
  }])).values()];
}

type DraftGame = Omit<Game, "draft" | "durationSec"> & {
  durationSec: number | null;
  draft: Omit<Game["draft"], "picks"> & {
    picks: (Omit<Game["draft"]["picks"][number], "role"> & { role: Role | null })[];
  };
};

function draftGames(dataset: SelectedDataset): DraftGame[] {
  if (dataset.provider === "fixture") return dataset.games;
  const canonical = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const names = new Map(CHAMPIONS.flatMap((c) => [c.id, c.canonicalName, c.displayName].map((n) => [canonical(n), c.id])));
  return dataset.historicalSeries.flatMap((s) => s.games.map((g): DraftGame => {
    const mapped = (p: { championName: string }) => names.get(canonical(p.championName));
    const covered = [...g.picks, ...g.bans].every((p) => mapped(p));
    return {
      id: `grid:${s.seriesId}:${g.id}`, seriesId: `grid:${s.seriesId}`, gameNumber: g.gameNumber,
      patch: s.patch ?? "unknown", startedAt: s.startedAt, durationSec: g.durationSec,
      blueTeamId: `grid:${g.blueTeamId}`, redTeamId: `grid:${g.redTeamId}`,
      winnerTeamId: `grid:${g.winnerTeamId}`, blueWin: g.winnerTeamId === g.blueTeamId,
      draft: { firstPickSide: g.picks[0].side,
        picks: covered ? g.picks.map((p) => ({ championId: mapped(p)!, teamId: `grid:${p.teamId}`, playerId: p.playerId ? `grid:${p.playerId}` : null, role: p.role, side: p.side, order: p.order })) : [],
        bans: covered ? g.bans.map((p) => ({ championId: mapped(p)!, teamId: `grid:${p.teamId}`, side: p.side, order: p.order })) : [],
      }, events: [], coverage: { draft: covered, objectives: false, players: g.picks.every((p) => p.playerId !== null && p.role !== null), macroIntervals: false },
      sourceProvider: "grid", sourceDatasetId: s.datasetId,
    };
  }));
}

export interface ChampionUsage {
  championId: string;
  displayName: string;
  primaryRole: Role;
  picks: number;
  bans: number;
  wins: number;
  /** Games where the team could have picked/banned (draft coverage). */
  eligibleGames: number;
  pickRate: MetricStat;
  banRate: MetricStat;
  winRate: MetricStat | null;
  bySide: { BLUE: { picks: number; games: number }; RED: { picks: number; games: number } };
  /** Picks inside the team's first two pick slots of the draft. */
  firstRotationPicks: number;
  avgPickOrder: number | null;
  gameIds: string[];
  players: string[];
}

export interface OpponentSummary {
  teamId: string;
  gamesAnalyzed: number;
  seriesAnalyzed: number;
  record: { wins: number; losses: number };
  eligibleGames: number;
  sideDistribution: { BLUE: number; RED: number };
  patchDistribution: Record<string, number>;
  coverage: { objectives: number; players: number; draft: number };
}

function inFilters(game: DraftGame, teamId: string, f: ScoutingFilters, seriesIndex: Map<string, DatasetSeries>): boolean {
  // The team must actually participate in the game — otherwise every denominator
  // would silently include games the team did not play.
  if (game.blueTeamId !== teamId && game.redTeamId !== teamId) return false;
  const side = game.blueTeamId === teamId ? "BLUE" : "RED";
  if (f.side && f.side !== "both" && side !== f.side) return false;
  if (f.patch && game.patch !== f.patch) return false;
  if (f.fromDate && game.startedAt < f.fromDate) return false;
  if (f.toDate && game.startedAt > `${f.toDate}T23:59:59Z`) return false;
  if (f.gameNumber && game.gameNumber !== f.gameNumber) return false;
  if (f.tournamentId) {
    const series = seriesIndex.get(game.seriesId);
    if (!series || series.tournamentId !== f.tournamentId) return false;
  }
  return true;
}

export class ScoutingContext {
  readonly teamId: string;
  readonly filters: ScoutingFilters;
  readonly nowISO: string;
  readonly ledger = new EvidenceLedger();
  readonly games: Game[];
  readonly eligibleGames: Game[];
  readonly summary: OpponentSummary;
  readonly usage: Map<string, ChampionUsage>;
  readonly tournamentsUsed: ReturnType<typeof datasetTournaments>;
  readonly dataset = analyticsDataset();
  readonly workspaceId = identityContext.getStore()?.workspaceId ?? "ws-demo";
  readonly seriesIndex = new Map(this.dataset.series.map((s) => [s.id, s]));
  readonly draftGames: DraftGame[];

  constructor(teamId: string, filters: ScoutingFilters = {}, nowISO = new Date().toISOString()) {
    this.teamId = teamId;
    this.filters = filters;
    this.nowISO = nowISO;
    this.games = [...this.dataset.games];
    this.games.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    this.eligibleGames = this.games.filter((g) => inFilters(g, teamId, filters, this.seriesIndex));
    this.draftGames = draftGames(this.dataset).filter((g) => inFilters(g, teamId, filters, this.seriesIndex));
    this.usage = this.computeUsage();
    this.summary = this.computeSummary();
    const tournamentIds = new Set(this.draftGames.map((g) => this.seriesIndex.get(g.seriesId)?.tournamentId));
    this.tournamentsUsed = datasetTournaments(this.dataset).filter((t) => tournamentIds.has(t.id));
  }

  /** Games in the dataset where the analysed team faced this opponent. */
  private computeUsage(): Map<string, ChampionUsage> {
    const map = new Map<string, ChampionUsage>();
    const draftEligible = this.draftGames.filter((g) => g.coverage.draft);
    for (const game of draftEligible) {
      const side = game.blueTeamId === this.teamId ? "BLUE" : "RED";
      const picks = game.draft.picks.filter((p) => p.teamId === this.teamId && (!this.filters.role || this.filters.role === "all" || p.role === this.filters.role));
      const bans = game.draft.bans.filter((b) => b.teamId === this.teamId);
      const won = game.winnerTeamId === this.teamId;

      for (const pick of picks) {
        const champ = getChampion(pick.championId);
        if (!champ) continue;
        const u =
          map.get(champ.id) ??
          ({
            championId: champ.id,
            displayName: champ.displayName,
            primaryRole: champ.primaryRole,
            picks: 0,
            bans: 0,
            wins: 0,
            eligibleGames: draftEligible.length,
            pickRate: rateStat({ definition: `pick_rate (${champ.displayName}, team games)`, numerator: 0, denominator: draftEligible.length }),
            banRate: rateStat({ definition: `ban_rate (${champ.displayName}, team games)`, numerator: 0, denominator: draftEligible.length }),
            winRate: null,
            bySide: { BLUE: { picks: 0, games: 0 }, RED: { picks: 0, games: 0 } },
            firstRotationPicks: 0,
            avgPickOrder: null,
            gameIds: [],
            players: [],
          } satisfies ChampionUsage);
        u.picks++;
        if (won) u.wins++;
        u.bySide[side].picks++;
        u.gameIds.push(game.id);
        if (pick.playerId) u.players.push(pick.playerId);
        if (pick.order <= 2) u.firstRotationPicks++;
        map.set(champ.id, u);
      }
      for (const ban of bans) {
        const u = map.get(ban.championId);
        if (u) {
          u.bans++;
          if (!u.gameIds.includes(game.id)) u.gameIds.push(game.id);
        }
        else {
          const champ = getChampion(ban.championId);
          if (!champ) continue;
          map.set(champ.id, {
            championId: champ.id,
            displayName: champ.displayName,
            primaryRole: champ.primaryRole,
            picks: 0,
            bans: 1,
            wins: 0,
            eligibleGames: draftEligible.length,
            pickRate: rateStat({ definition: `pick_rate (${champ.displayName}, team games)`, numerator: 0, denominator: draftEligible.length }),
            banRate: rateStat({ definition: `ban_rate (${champ.displayName}, team games)`, numerator: 0, denominator: draftEligible.length }),
            winRate: null,
            bySide: { BLUE: { picks: 0, games: 0 }, RED: { picks: 0, games: 0 } },
            firstRotationPicks: 0,
            avgPickOrder: null,
            gameIds: [game.id],
            players: [],
          });
        }
      }
    }

    for (const u of map.values()) {
      u.pickRate = rateStat({
        definition: `pick_rate (${u.displayName}, ${this.teamId} draft-covered games)`,
        numerator: u.picks,
        denominator: u.eligibleGames,
      });
      u.banRate = rateStat({
        definition: `ban_rate (${u.displayName}, ${this.teamId} draft-covered games)`,
        numerator: u.bans,
        denominator: u.eligibleGames,
      });
      if (u.picks >= 3) {
        u.winRate = rateStat({
          definition: `win_rate_when_played (${u.displayName}, ${this.teamId})`,
          numerator: u.wins,
          denominator: u.picks,
        });
      }
      const blueGames = draftEligible.filter((g) => g.blueTeamId === this.teamId).length;
      const redGames = draftEligible.filter((g) => g.redTeamId === this.teamId).length;
      u.bySide.BLUE.games = blueGames;
      u.bySide.RED.games = redGames;
      const orders = draftEligible
        .flatMap((g) => g.draft.picks.filter((p) => p.teamId === this.teamId && p.championId === u.championId).map((p) => p.order));
      u.avgPickOrder = orders.length ? orders.reduce((s, v) => s + v, 0) / orders.length : null;
    }
    return map;
  }

  private computeSummary(): OpponentSummary {
    const games = this.draftGames;
    const seriesIds = new Set(games.map((g) => g.seriesId));
    let wins = 0;
    let losses = 0;
    const bySeries = new Map<string, { teamA: string; teamB: string; winner: string | null; games: number }>();
    for (const g of games) {
      const s = this.seriesIndex.get(g.seriesId)!;
      bySeries.set(s.id, { teamA: s.teamAId, teamB: s.teamBId, winner: s.winnerTeamId, games: (bySeries.get(s.id)?.games ?? 0) + 1 });
      if (g.winnerTeamId === this.teamId) wins++;
      else if (g.winnerTeamId) losses++;
    }
    let seriesWins = 0;
    let seriesLosses = 0;
    for (const s of bySeries.values()) {
      if (s.winner === this.teamId) seriesWins++;
      else if (s.winner) seriesLosses++;
    }
    void seriesWins;
    void seriesLosses;
    const patchDistribution: Record<string, number> = {};
    for (const g of games) patchDistribution[g.patch] = (patchDistribution[g.patch] ?? 0) + 1;
    return {
      teamId: this.teamId,
      gamesAnalyzed: games.length,
      seriesAnalyzed: bySeries.size,
      record: { wins: seriesWins, losses: seriesLosses },
      eligibleGames: games.filter((g) => g.coverage.draft).length,
      sideDistribution: {
        BLUE: games.filter((g) => g.blueTeamId === this.teamId).length,
        RED: games.filter((g) => g.redTeamId === this.teamId).length,
      },
      patchDistribution,
      coverage: {
        objectives: games.filter((g) => g.coverage.objectives).length,
        players: games.filter((g) => g.coverage.players).length,
        draft: games.filter((g) => g.coverage.draft).length,
      },
    };
  }

  usageList(minActivity = 1): ChampionUsage[] {
    return [...this.usage.values()]
      .filter((u) => u.picks + u.bans >= minActivity)
      .sort((a, b) => b.picks + b.bans * 0.6 - (a.picks + a.bans * 0.6));
  }

  usageFor(championId: string): ChampionUsage | undefined {
    return this.usage.get(championId);
  }

  /** Side-difference analysis for one champion; returns null when either side lacks observations. */
  sideDependence(championId: string): {
    blue: MetricStat;
    red: MetricStat;
    delta: number;
    intervalsDisjoint: boolean;
  } | null {
    const u = this.usage.get(championId);
    if (!u) return null;
    const blue = rateStat({
      definition: `pick_rate_blue (${u.displayName})`,
      numerator: u.bySide.BLUE.picks,
      denominator: u.bySide.BLUE.games,
    });
    const red = rateStat({
      definition: `pick_rate_red (${u.displayName})`,
      numerator: u.bySide.RED.picks,
      denominator: u.bySide.RED.games,
    });
    if (u.bySide.BLUE.games === 0 || u.bySide.RED.games === 0) return null;
    if (u.bySide.BLUE.picks + u.bySide.RED.picks < 3) return null;
    const delta = (blue.value ?? 0) - (red.value ?? 0);
    const ciB = blue.confidence!;
    const ciR = red.confidence!;
    const intervalsDisjoint = ciB.lower > ciR.upper || ciR.lower > ciB.upper;
    return { blue, red, delta, intervalsDisjoint };
  }

  /** Repeated compositions: pick-sets used in >= 2 games of the filtered dataset. */
  repeatedCompositions(): { championIds: string[]; occurrences: number; gameIds: string[] }[] {
    const map = new Map<string, { championIds: string[]; occurrences: number; gameIds: string[] }>();
    for (const g of this.draftGames.filter((g) => g.coverage.draft)) {
      const set = g.draft.picks
        .filter((p) => p.teamId === this.teamId)
        .map((p) => p.championId)
        .sort()
        .join(",");
      const entry = map.get(set) ?? { championIds: set.split(",").filter(Boolean), occurrences: 0, gameIds: [] };
      entry.occurrences++;
      entry.gameIds.push(g.id);
      map.set(set, entry);
    }
    return [...map.values()].filter((e) => e.occurrences >= 2).sort((a, b) => b.occurrences - a.occurrences);
  }

  /** Pick-priority drift by game number (Fearless adaptation signal). */
  crossGameShift(): { gameNumber: number; games: number; topChampions: { championId: string; picks: number }[] }[] {
    const byGame = new Map<number, Map<string, number>>();
    for (const g of this.draftGames.filter((g) => g.coverage.draft)) {
      const inner = byGame.get(g.gameNumber) ?? new Map<string, number>();
      for (const p of g.draft.picks.filter((p) => p.teamId === this.teamId)) {
        inner.set(p.championId, (inner.get(p.championId) ?? 0) + 1);
      }
      byGame.set(g.gameNumber, inner);
    }
    return [...byGame.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([gameNumber, champs]) => ({
        gameNumber,
        games: this.draftGames.filter((g) => g.coverage.draft && g.gameNumber === gameNumber).length,
        topChampions: [...champs.entries()]
          .map(([championId, picks]) => ({ championId, picks }))
          .sort((a, b) => b.picks - a.picks)
          .slice(0, 4),
      }));
  }

  /** Player pools from attributed pick records. */
  playerPools(): {
    playerId: string;
    handle: string;
    role: Role;
    flexRoles: Role[];
    games: number;
    champions: { championId: string; displayName: string; picks: number }[];
  }[] {
    const map = new Map<string, Map<string, number>>();
    const roles = new Map<string, Role[]>();
    for (const g of this.eligibleGames) {
      if (!g.coverage.players) continue;
      for (const p of g.draft.picks.filter((p) => p.teamId === this.teamId && p.playerId)) {
        const pool = map.get(p.playerId!) ?? new Map<string, number>();
        pool.set(p.championId, (pool.get(p.championId) ?? 0) + 1);
        map.set(p.playerId!, pool);
        const r = roles.get(p.playerId!) ?? [];
        if (!r.includes(p.role)) r.push(p.role);
        roles.set(p.playerId!, r);
      }
    }
    return [...map.entries()].map(([playerId, pool]) => {
      const usedRoles = roles.get(playerId) ?? [];
      return {
        playerId,
        handle: playerId.split("-").slice(1).join("-"),
        role: usedRoles[0] ?? "TOP",
        flexRoles: usedRoles.slice(1),
        games: [...pool.values()].reduce((s, v) => s + v, 0),
        champions: [...pool.entries()]
          .map(([championId, picks]) => ({ championId, displayName: getChampion(championId)?.displayName ?? championId, picks }))
          .sort((a, b) => b.picks - a.picks),
      };
    });
  }

  // ----- macro wrappers -----
  macro() {
    const games = this.eligibleGames;
    const withDuration = this.draftGames.filter((g): g is DraftGame & { durationSec: number } => g.durationSec !== null && g.durationSec > 0);
    return {
      firstDragon: firstDragonRate(games, this.teamId),
      herald: heraldControlRate(games, this.teamId),
      baron: baronControlRate(games, this.teamId),
      firstTurret: firstTurretRate(games, this.teamId),
      earlyKills: earlyKillPattern(games, this.teamId),
      duration: {
        stat: rateStat({ definition: "average_game_duration (seconds)", numerator: withDuration.reduce((sum, g) => sum + g.durationSec, 0), denominator: withDuration.length, unit: "seconds" }),
        gameIds: withDuration.map((g) => g.id),
      },
      intervals: intervalBreakdown(games, this.teamId),
      objectiveCoverage: games.filter((g) => g.coverage.objectives).length,
      excludedGames: this.draftGames.length - games.filter((g) => g.coverage.objectives).length,
    };
  }

  gameTimeline(gameId: string): { game: Game; events: (GameEventShim)[] } | null {
    const g = this.games.find((g) => g.id === gameId);
    if (!g) return null;
    return { game: g, events: g.events };
  }
}

type GameEventShim = Game["events"][number];

/**
 * Build scouting insights for a team. Deterministic ordering; each insight carries
 * an evidence id produced from the exact observation set behind the number.
 */
export function buildInsights(ctx: ScoutingContext): Insight[] {
  const insights: Insight[] = [];
  const wsId = ctx.workspaceId;
  const provenance = ctx.dataset.provider;
  const patches = [...new Set(ctx.draftGames.map((g) => g.patch))].sort().join(", ");
  const patchContext = patches || "n/a";
  let seq = 0;
  const mkInsight = (
    partial: Omit<Insight, "id" | "workspaceId" | "createdAt" | "analysisVersion" | "evidenceId" | "dataProvenance" | "opponentTeamId">,
    evidenceGameIds: string[],
  ): Insight => {
    seq++;
    const evidence = ctx.ledger.addStat({
      insightId: null,
      provider: provenance,
      sourceId: `${provenance}:${ctx.workspaceId}:${ctx.dataset.datasetId}:${ctx.teamId}`,
      extraLimitations: [ctx.dataset.label, ...ctx.dataset.warnings],
      gameIds: evidenceGameIds,
      tournamentId: ctx.filters.tournamentId ?? null,
      patch: ctx.filters.patch ?? null,
      stat: {
        definition: partial.metric.definition,
        numerator: partial.metric.numerator,
        denominator: partial.metric.denominator,
        value: partial.metric.value,
        confidence: partial.metric.confidence,
        sampleSize: partial.metric.sampleSize,
      },
    });
    if (provenance === "grid") {
      evidence.datasetId = ctx.dataset.datasetId;
      evidence.ingestedAt = ctx.dataset.historicalSeries.map((s) => s.fetchedAt).sort().at(-1)!;
      evidence.limitations = [ctx.dataset.label, ...ctx.dataset.warnings];
    }
    return {
      ...partial,
      id: `INS-${ctx.teamId}-${String(seq).padStart(2, "0")}`,
      workspaceId: wsId,
      opponentTeamId: ctx.teamId,
      createdAt: ctx.nowISO,
      analysisVersion: ANALYSIS_VERSION,
      evidenceId: evidence.id,
      dataProvenance: provenance,
    };
  };

  // 1. Pick priority: champions picked in >= 25% of eligible games (min 3 picks).
  const ranked = ctx.usageList(1).filter((u) => u.picks >= 3);
  for (const u of ranked.slice(0, 4)) {
    if ((u.pickRate.value ?? 0) < 0.12 && u.picks < 6) continue;
    insights.push(
      mkInsight(
        {
          insightType: "pick-priority",
          title: `${u.displayName} is a recurring pick (${u.picks}/${u.eligibleGames} games)`,
          summary: `${u.displayName} was selected in ${u.picks} of ${u.eligibleGames} draft-eligible games (${Math.round((u.pickRate.value ?? 0) * 100)}%).`,
          observation: `Observed: ${u.picks} picks across ${u.eligibleGames} games. Mean pick order ${u.avgPickOrder?.toFixed(1) ?? "n/a"}; first-rotation picks ${u.firstRotationPicks}.`,
          interpretation:
            u.firstRotationPicks >= Math.ceil(u.picks / 2)
              ? "Frequently taken inside the first rotation, so denying it early costs the opponent real tempo."
              : "Usually secured in later rotations, suggesting a comfort fallback rather than a must-have.",
          metric: u.pickRate,
          side: "both",
          patchContext,
        },
        u.gameIds,
      ),
    );
  }

  // 2. Ban priority.
  const topBan = ctx.usageList(1).filter((u) => u.bans >= 3).sort((a, b) => b.bans - a.bans)[0];
  if (topBan) {
    insights.push(
      mkInsight(
        {
          insightType: "ban-priority",
          title: `${topBan.displayName} draws repeated bans (${topBan.bans} bans)`,
          summary: `${ctx.teamId} spent ${topBan.bans} of ${topBan.eligibleGames} draft slots banning ${topBan.displayName}.`,
          observation: `Observed: ${topBan.bans} bans in ${topBan.eligibleGames} eligible drafts. Pick rate when left open: ${Math.round((topBan.pickRate.value ?? 0) * 100)}%.`,
          interpretation:
            (topBan.pickRate.value ?? 0) > 0.4
              ? "When left available the champion is regularly picked, so the ban is likely a self-scouted removal rather than a no-op."
              : "The champion is banned but rarely picked afterwards — the ban may target a specific player pool or matchup fear.",
          metric: topBan.banRate,
          side: "both",
          patchContext,
        },
        topBan.gameIds,
      ),
    );
  }

  // 3. Side dependence.
  const rankedForSide = ctx.usageList(1).filter((u) => u.picks >= 3);
  for (const u of rankedForSide) {
    const dep = ctx.sideDependence(u.championId);
    if (!dep || !dep.intervalsDisjoint) continue;
    const stronger: Side = dep.delta > 0 ? "BLUE" : "RED";
    insights.push(
      mkInsight(
        {
          insightType: "side-dependence",
          title: `${u.displayName} skews to the ${stronger === "BLUE" ? "blue" : "red"} side`,
          summary: `Blue-side pick rate ${Math.round((dep.blue.value ?? 0) * 100)}% vs red-side ${Math.round((dep.red.value ?? 0) * 100)}%; Wilson 95% intervals do not overlap.`,
          observation: `Blue: ${dep.blue.numerator}/${dep.blue.denominator} games. Red: ${dep.red.numerator}/${dep.red.denominator} games.`,
          interpretation: `Draft priorities appear to change by side for this champion — check whether it is an early-pick comfort or a reactive counter slot.`,
          metric: dep.delta > 0 ? dep.blue : dep.red,
          side: stronger,
          patchContext,
        },
        u.gameIds,
      ),
    );
    break; // one strongest side-dependence insight is enough for the briefing
  }

  // 4. Repeated composition.
  const repeated = ctx.repeatedCompositions()[0];
  if (repeated) {
    const names = repeated.championIds.map((id) => getChampion(id)?.displayName ?? id);
    insights.push(
      mkInsight(
        {
          insightType: "composition-repeat",
          title: `Composition repeated ${repeated.occurrences} times`,
          summary: `The exact five-pick set (${names.join(", ")}) appeared in ${repeated.occurrences} games.`,
          observation: `Identical pick sets in games: ${repeated.gameIds.join(", ")}.`,
          interpretation: "A repeated complete composition is a practicable comfort strategy worth preparing counters for.",
          metric: rateStat({
            definition: "composition_repeat_count (games)",
            numerator: repeated.occurrences,
            denominator: ctx.draftGames.filter((g) => g.coverage.draft).length,
          }),
          side: "both",
          patchContext,
        },
        repeated.gameIds,
      ),
    );
  }

  // 5. First-dragon objective pattern.
  const m = ctx.macro();
  if (m.firstDragon.stat.denominator >= 3) {
    insights.push(
      mkInsight(
        {
          insightType: "objective-pattern",
          title: `First dragon secured in ${m.firstDragon.stat.numerator} of ${m.firstDragon.stat.denominator} analyzed games`,
          summary: `First-dragon rate ${Math.round((m.firstDragon.stat.value ?? 0) * 100)}% across objective-covered games.`,
          observation: `Eligible games: ${m.firstDragon.stat.denominator}. Games missing objective coverage: ${ctx.eligibleGames.length - m.objectiveCoverage} (excluded, not estimated).`,
          interpretation:
            (m.firstDragon.stat.value ?? 0) >= 0.6
              ? "Consistent early dragon priority — plan for contested dragon setups around the 6–14 minute window."
              : "Dragon is not a consistent early priority; the opponent likely concedes early dragons for map plays.",
          metric: m.firstDragon.stat,
          side: "both",
          patchContext,
        },
        m.firstDragon.gameIds,
      ),
    );
  }

  return insights;
}

export interface TeamUsageSnapshot {
  teamId: string;
  games: number;
  usage: ChampionUsage[];
}

export function confidenceFromUsage(u: ChampionUsage): ConfidenceInterval | null {
  return wilsonInterval(u.wins, u.picks, Z_95);
}

export function strengthFromUsage(u: ChampionUsage) {
  return evidenceStrength(u.picks, confidenceFromUsage(u));
}
