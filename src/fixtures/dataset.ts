/**
 * Deterministic demo dataset generator.
 *
 * Every value derives from a fixed seed (FIXTURE_SEED) so analytics are
 * reproducible byte-for-byte across processes. The output is labelled fixture
 * data end-to-end: FIXTURE_DATASET_ID + FIXTURE_LABEL travel with every record.
 *
 * ILLUSTRATIVE FIXTURE DATA. Not actual Cloud9 performance, not an official GRID dataset.
 */
import type {
  DraftBanRecord,
  DraftPickRecord,
  FearlessMode,
  Game,
  GameEvent,
  HistoricalDraft,
  Role,
  Series,
  Side,
  Tournament,
} from "@/domain/types";
import { ALL_ROLES } from "@/domain/types";
import { CHAMPIONS, getChampion } from "./champions";
import {
  FIXTURE_DATASET_ID,
  FIXTURE_GENERATED_AT,
  FIXTURE_LABEL,
  FIXTURE_SEED,
  META_BAN_PRESSURE,
  TEAM_AFFINITY,
  TOURNAMENT_INDEX,
  affinityFor,
} from "./teams";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface PlannedSeries {
  id: string;
  tournamentId: string;
  teams: [string, string];
  /** Winner side per game, in order. */
  winners: string[];
  date: string;
  format: "BO3" | "BO5";
}

const PLAN: PlannedSeries[] = [
  { id: "s-reg-01", tournamentId: "t-reg-autumn", teams: ["SGT", "NVX"], winners: ["NVX", "SGT", "NVX"], date: "2026-09-14", format: "BO3" },
  { id: "s-reg-02", tournamentId: "t-reg-autumn", teams: ["SGT", "EST"], winners: ["EST", "EST"], date: "2026-09-17", format: "BO3" },
  { id: "s-reg-03", tournamentId: "t-reg-autumn", teams: ["NVX", "HLX"], winners: ["NVX", "HLX", "NVX"], date: "2026-09-21", format: "BO3" },
  { id: "s-reg-04", tournamentId: "t-reg-autumn", teams: ["EST", "HLX"], winners: ["EST", "EST"], date: "2026-09-25", format: "BO3" },
  { id: "s-reg-05", tournamentId: "t-reg-autumn", teams: ["SGT", "HLX"], winners: ["SGT", "HLX", "SGT"], date: "2026-09-28", format: "BO3" },
  { id: "s-reg-06", tournamentId: "t-reg-autumn", teams: ["NVX", "EST"], winners: ["NVX", "NVX"], date: "2026-10-02", format: "BO3" },
  { id: "s-reg-07", tournamentId: "t-reg-autumn", teams: ["SGT", "NVX"], winners: ["NVX", "NVX"], date: "2026-10-06", format: "BO3" },
  { id: "s-reg-08", tournamentId: "t-reg-autumn", teams: ["HLX", "EST"], winners: ["EST", "HLX", "EST"], date: "2026-10-11", format: "BO3" },
  { id: "s-cc-01", tournamentId: "t-cc-2026", teams: ["SGT", "NVX"], winners: ["NVX", "SGT", "NVX"], date: "2026-10-27", format: "BO3" },
  { id: "s-cc-02", tournamentId: "t-cc-2026", teams: ["EST", "HLX"], winners: ["HLX", "EST", "HLX"], date: "2026-10-30", format: "BO3" },
  { id: "s-cc-03", tournamentId: "t-cc-2026", teams: ["SGT", "HLX"], winners: ["HLX", "HLX"], date: "2026-11-04", format: "BO3" },
  { id: "s-cc-04", tournamentId: "t-cc-2026", teams: ["NVX", "EST"], winners: ["NVX", "EST", "NVX"], date: "2026-11-09", format: "BO3" },
  { id: "s-mi-01", tournamentId: "t-mi-2026", teams: ["SGT", "NVX"], winners: ["SGT", "NVX", "NVX", "SGT", "NVX"], date: "2026-11-22", format: "BO5" },
  { id: "s-mi-02", tournamentId: "t-mi-2026", teams: ["EST", "HLX"], winners: ["EST", "HLX", "EST", "EST"], date: "2026-11-23", format: "BO5" },
  { id: "s-mi-03", tournamentId: "t-mi-2026", teams: ["SGT", "EST"], winners: ["EST", "SGT", "EST", "EST"], date: "2026-11-25", format: "BO5" },
  { id: "s-mi-04", tournamentId: "t-mi-2026", teams: ["NVX", "HLX"], winners: ["NVX", "NVX", "NVX"], date: "2026-11-27", format: "BO5" },
];

const UPCOMING: PlannedSeries[] = [
  { id: "s-mi-05", tournamentId: "t-mi-2026", teams: ["SGT", "NVX"], winners: [], date: "2026-12-05", format: "BO5" },
];

function patchFor(date: string): string {
  if (date < "2026-10-01") return "16.8";
  if (date < "2026-11-01") return "16.9";
  return "16.10";
}

function tournamentOf(id: string): Tournament {
  const t = TOURNAMENT_INDEX.get(id);
  if (!t) throw new Error(`Unknown tournament ${id}`);
  return t;
}

/** Weighted sample without replacement source pool. */
function weightedPick(pool: { id: string; w: number }[], rng: () => number): string {
  const total = pool.reduce((s, c) => s + Math.max(c.w, 0.0001), 0);
  let roll = rng() * total;
  for (const c of pool) {
    roll -= Math.max(c.w, 0.0001);
    if (roll <= 0) return c.id;
  }
  return pool[pool.length - 1].id;
}

interface SimTeamState {
  teamId: string;
  side: Side;
  picks: (string | null)[]; // per role slot
  bans: string[];
}

/**
 * Simulate one game draft through the standard 18-slot sequence:
 * BAN1: B R B R B R · PICK1: B R R B · BAN2: R B R B · PICK2: B R R B B R
 */
function simulateDraft(
  seriesId: string,
  gameNumber: number,
  blueId: string,
  redId: string,
  fearless: FearlessMode,
  scope: "both" | "own",
  priorPicksByTeam: Record<string, Set<string>>,
  rng: () => number,
): { draft: HistoricalDraft; pickedByTeam: Record<string, Set<string>> } {
  const SEQ: { type: "ban" | "pick"; side: Side; phase: "BAN_PHASE_1" | "PICK_PHASE_1" | "BAN_PHASE_2" | "PICK_PHASE_2" }[] = [
    { type: "ban", side: "BLUE", phase: "BAN_PHASE_1" }, { type: "ban", side: "RED", phase: "BAN_PHASE_1" },
    { type: "ban", side: "BLUE", phase: "BAN_PHASE_1" }, { type: "ban", side: "RED", phase: "BAN_PHASE_1" },
    { type: "ban", side: "BLUE", phase: "BAN_PHASE_1" }, { type: "ban", side: "RED", phase: "BAN_PHASE_1" },
    { type: "pick", side: "BLUE", phase: "PICK_PHASE_1" }, { type: "pick", side: "RED", phase: "PICK_PHASE_1" },
    { type: "pick", side: "RED", phase: "PICK_PHASE_1" }, { type: "pick", side: "BLUE", phase: "PICK_PHASE_1" },
    { type: "ban", side: "RED", phase: "BAN_PHASE_2" }, { type: "ban", side: "BLUE", phase: "BAN_PHASE_2" },
    { type: "ban", side: "RED", phase: "BAN_PHASE_2" }, { type: "ban", side: "BLUE", phase: "BAN_PHASE_2" },
    { type: "pick", side: "BLUE", phase: "PICK_PHASE_2" }, { type: "pick", side: "RED", phase: "PICK_PHASE_2" },
    { type: "pick", side: "RED", phase: "PICK_PHASE_2" }, { type: "pick", side: "BLUE", phase: "PICK_PHASE_2" },
    { type: "pick", side: "BLUE", phase: "PICK_PHASE_2" }, { type: "pick", side: "RED", phase: "PICK_PHASE_2" },
  ];

  const blue: SimTeamState = { teamId: blueId, side: "BLUE", picks: [null, null, null, null, null], bans: [] };
  const red: SimTeamState = { teamId: redId, side: "RED", picks: [null, null, null, null, null], bans: [] };
  const states: Record<Side, SimTeamState> = { BLUE: blue, RED: red };
  const taken = new Set<string>();
  const pickedByTeam: Record<string, Set<string>> = { [blueId]: new Set(), [redId]: new Set() };

  const restrictedFor = (teamId: string, side: Side): Set<string> => {
    if (fearless === "none") return new Set();
    const out = new Set<string>();
    for (const [tid, picks] of Object.entries(priorPicksByTeam)) {
      if (fearless === "hard" || (fearless === "soft" && tid === teamId) || (scope === "both" && fearless === "soft")) {
        picks.forEach((p) => out.add(p));
      }
    }
    return out;
  };

  const picks: DraftPickRecord[] = [];
  const bans: DraftBanRecord[] = [];
  let pickOrder = 0;
  let banOrder = 0;
  let firstRotation = true;

  for (let i = 0; i < SEQ.length; i++) {
    const step = SEQ[i];
    const st = states[step.side];
    const opponentId = st.teamId === blueId ? redId : blueId;
    const restricted = restrictedFor(st.teamId, step.side);

    if (step.type === "ban") {
      banOrder++;
      // Ban pool: opponent signatures carry heavy deny value, meta pressure adds noise.
      const pool = CHAMPIONS.filter(
        (c) => !taken.has(c.id) && !restricted.has(c.id),
      ).map((c) => ({
        id: c.id,
        w:
          (TEAM_AFFINITY[opponentId]?.[c.id] ?? 1) * 10 +
          (META_BAN_PRESSURE[c.id] ?? 0) * 3 +
          rng() * 14 +
          (firstRotation ? 6 : 0),
      }));
      const banId = weightedPick(pool, rng);
      taken.add(banId);
      st.bans.push(banId);
      bans.push({ championId: banId, teamId: st.teamId, order: banOrder, side: step.side });
    } else {
      pickOrder++;
      const openRoles = ALL_ROLES.filter((_, idx) => st.picks[idx] === null);
      if (openRoles.length === 0) continue;
      const candidates = CHAMPIONS.filter((c) => {
        if (taken.has(c.id) || restricted.has(c.id)) return false;
        const slots = [c.primaryRole, ...c.flexRoles];
        return slots.some((r) => openRoles.includes(r));
      });
      if (candidates.length === 0) {
        // Degenerate-pool fallback: 80-champion catalogue makes this unreachable in
        // practice; if it ever fires we preserve dataset integrity (5 picks/team)
        // over Fearless purity and record it for the fixture validator.
        const rescue = CHAMPIONS.filter((c) => !taken.has(c.id) && openRoles.includes(c.primaryRole));
        if (rescue.length === 0) continue;
        const champId = rescue[Math.floor(rng() * rescue.length)].id;
        const champ = getChampion(champId)!;
        const slotIdx = ALL_ROLES.indexOf(champ.primaryRole);
        taken.add(champId);
        st.picks[slotIdx] = champId;
        pickedByTeam[st.teamId].add(champId);
        picks.push({ championId: champId, teamId: st.teamId, playerId: null, role: champ.primaryRole, order: pickOrder, side: step.side });
        if (pickOrder >= 4) firstRotation = false;
        continue;
      }
      // Sharpen early picks toward signature champions; late picks prioritise role fill.
      const urgency = openRoles.length <= 2 ? 2.4 : 1;
      const pool = candidates.map((c) => ({
        id: c.id,
        w: Math.pow(affinityFor(st.teamId, c), 1.35) * urgency * (0.35 + rng() * 2.9) * (0.8 + rng() * 0.5),
      }));
      const champId = weightedPick(pool, rng);
      const champ = getChampion(champId);
      if (!champ) continue;
      const slotIdx =
        champ.primaryRole && st.picks[ALL_ROLES.indexOf(champ.primaryRole)] === null
          ? ALL_ROLES.indexOf(champ.primaryRole)
          : ALL_ROLES.findIndex((r) => champ.flexRoles.includes(r) && st.picks[ALL_ROLES.indexOf(r)] === null);
      if (slotIdx < 0) continue;
      const role = ALL_ROLES[slotIdx];
      taken.add(champId);
      st.picks[slotIdx] = champId;
      pickedByTeam[st.teamId].add(champId);
      picks.push({
        championId: champId,
        teamId: st.teamId,
        playerId: null, // resolved to a roster player below
        role,
        order: pickOrder,
        side: step.side,
      });
      if (pickOrder >= 4) firstRotation = false;
    }
  }

  return { draft: { firstPickSide: "BLUE", picks, bans }, pickedByTeam };
}

function resolvePlayers(draft: HistoricalDraft, blueId: string, redId: string, rosters: Record<string, Record<Role, string>>): HistoricalDraft {
  const teamOf = (side: Side) => (side === "BLUE" ? blueId : redId);
  const picks = draft.picks.map((p) => {
    const roster = rosters[teamOf(p.side)];
    const direct = roster[p.role];
    const flex = Object.entries(roster).find(([role]) => p.role === role);
    return { ...p, playerId: direct ?? flex?.[1] ?? null };
  });
  return { ...draft, picks };
}

function rosterMap(teamId: string): Record<Role, string> {
  const handles: Record<string, Record<Role, string>> = {
    SGT: { TOP: "SGT-driftt", JUNGLE: "SGT-rowe", MID: "SGT-cassius", BOT: "SGT-blight", SUPPORT: "SGT-mercy" },
    NVX: { TOP: "NVX-torvald", JUNGLE: "NVX-kestrel", MID: "NVX-vantablack", BOT: "NVX-sable", SUPPORT: "NVX-chime" },
    EST: { TOP: "EST-hanbul", JUNGLE: "EST-mireu", MID: "EST-seolhan", BOT: "EST-pado", SUPPORT: "EST-dara" },
    HLX: { TOP: "HLX-wexler", JUNGLE: "HLX-ferro", MID: "HLX-ivo", BOT: "HLX-dane", SUPPORT: "HLX-petra" },
  };
  const team = handles[teamId];
  if (!team) throw new Error(`No roster defined for team ${teamId}`);
  return team;
}

function buildEvents(
  gameId: string,
  durationSec: number,
  blueId: string,
  redId: string,
  winnerId: string | null,
  objectivesCoverage: boolean,
  rng: () => number,
): GameEvent[] {
  const events: GameEvent[] = [
    { id: `${gameId}-e-start`, gameId, type: "game_start", timestampSec: 0, teamId: null },
  ];
  if (objectivesCoverage && winnerId) {
    const loserId = winnerId === blueId ? redId : blueId;
    const secures = (teamId: string) => (teamId === winnerId ? 0.66 + rng() * 0.12 : 0.34 - rng() * 0.1);
    const side = (teamId: string) => (rng() < secures(teamId) ? teamId : teamId === winnerId ? loserId : winnerId);

    // Dragons: 2-5 per game, first at 6-14 min.
    const dragonCount = 2 + Math.floor(rng() * 4);
    let t = 360 + rng() * 480;
    for (let i = 0; i < dragonCount; i++) {
      events.push({ id: `${gameId}-e-d${i}`, gameId, type: "dragon", timestampSec: Math.round(t), teamId: side(rng() < 0.5 ? blueId : redId) });
      t += 240 + rng() * 420;
    }
    // Herald: 0-1, 14-20 min.
    if (rng() < 0.72) {
      events.push({ id: `${gameId}-e-h0`, gameId, type: "herald", timestampSec: Math.round(840 + rng() * 360), teamId: side(rng() < 0.5 ? blueId : redId) });
    }
    // Baron: 0-2, 24-35 min.
    const barons = Math.floor(rng() * 2.35);
    for (let i = 0; i < barons; i++) {
      events.push({ id: `${gameId}-e-b${i}`, gameId, type: "baron", timestampSec: Math.round(1440 + i * 420 + rng() * 380), teamId: side(rng() < 0.5 ? blueId : redId) });
    }
    // Turrets: 5-9, progressive tiers 1..3.
    const turrets = 5 + Math.floor(rng() * 5);
    for (let i = 0; i < turrets; i++) {
      events.push({
        id: `${gameId}-e-t${i}`,
        gameId,
        type: "turret",
        timestampSec: Math.round(480 + (i / turrets) * (durationSec - 600) + rng() * 120),
        teamId: side(rng() < 0.5 ? blueId : redId),
        value: 1 + Math.floor(rng() * Math.min(3, (i / turrets) * 3 + 1)),
      });
    }
    // Kills: 8-16 skirmishes of 1-3, spread 4 min to end, ~60% before 15 min.
    const skims = 8 + Math.floor(rng() * 9);
    for (let i = 0; i < skims; i++) {
      const early = i < skims * 0.6;
      const ts = early ? 240 + rng() * 660 : 900 + rng() * (durationSec - 960);
      const n = 1 + Math.floor(rng() * 3);
      const teamId = side(rng() < 0.5 ? blueId : redId);
      for (let k = 0; k < n; k++) {
        events.push({ id: `${gameId}-e-k${i}-${k}`, gameId, type: "kill", timestampSec: Math.round(ts + k * 4), teamId, value: 1 });
      }
    }
  }
  events.push({ id: `${gameId}-e-end`, gameId, type: "game_end", timestampSec: durationSec, teamId: null });
  return events.sort((a, b) => a.timestampSec - b.timestampSec);
}

function buildDataset() {
  const games: Game[] = [];
  const series: Series[] = [];

  // Games deliberately lacking a dimension, to exercise unavailable/partial states.
  const noObjectiveGames = new Set(["s-reg-02-g1", "s-cc-03-g2"]);
  const noPlayerGames = new Set(["s-reg-01-g1", "s-reg-05-g2"]);

  for (const planned of [...PLAN, ...UPCOMING]) {
    const t = tournamentOf(planned.tournamentId);
    const rng = mulberry32(hashStr(planned.id) ^ FIXTURE_SEED);
    const patch = patchFor(planned.date);
    const completed = planned.winners.length > 0;
    const gameCount = planned.winners.length;

    const [teamA, teamB] = planned.teams;
    const priorPicksByTeam: Record<string, Set<string>> = { [teamA]: new Set(), [teamB]: new Set() };
    const gameIds: string[] = [];

    for (let g = 1; g <= Math.max(gameCount, 1); g++) {
      const gameId = `${planned.id}-g${g}`;
      gameIds.push(gameId);
      const winnerId = completed ? planned.winners[g - 1] : null;
      // Alternate sides deterministically per series.
      const blueId = g % 2 === 1 ? teamA : teamB;
      const redId = blueId === teamA ? teamB : teamA;

      const { draft, pickedByTeam } = simulateDraft(
        planned.id,
        g,
        blueId,
        redId,
        t.draftPolicy.fearless,
        t.draftPolicy.scope,
        { ...priorPicksByTeam },
        rng,
      );
      if (completed) {
        for (const [tid, picks] of Object.entries(pickedByTeam)) {
          picks.forEach((p) => priorPicksByTeam[tid].add(p));
        }
      }

      const durationSec = Math.round(1500 + rng() * 900);
      const objectivesCoverage = !noObjectiveGames.has(gameId);
      const playersCoverage = !noPlayerGames.has(gameId);
      const draftWithPlayers = playersCoverage
        ? resolvePlayers(draft, blueId, redId, { [blueId]: rosterMap(blueId), [redId]: rosterMap(redId) })
        : draft;

      games.push({
        id: gameId,
        seriesId: planned.id,
        gameNumber: g,
        patch,
        startedAt: new Date(`${planned.date}T${14 + g}:30:00Z`).toISOString(),
        durationSec,
        blueTeamId: blueId,
        redTeamId: redId,
        winnerTeamId: winnerId,
        blueWin: winnerId === blueId,
        draft: draftWithPlayers,
        events: buildEvents(gameId, durationSec, blueId, redId, winnerId, objectivesCoverage, rng),
        coverage: { objectives: objectivesCoverage, draft: true, players: playersCoverage, macroIntervals: false },
        sourceProvider: "fixture",
        sourceDatasetId: FIXTURE_DATASET_ID,
      });
    }

    const winsA = planned.winners.filter((w) => w === teamA).length;
    const winnerTeamId = completed ? (winsA > planned.winners.length / 2 ? teamA : teamB) : null;

    series.push({
      id: planned.id,
      tournamentId: planned.tournamentId,
      patch,
      startedAt: new Date(`${planned.date}T14:00:00Z`).toISOString(),
      format: planned.format,
      status: completed ? "completed" : "upcoming",
      teamAId: teamA,
      teamBId: teamB,
      winnerTeamId,
      gameIds,
      fearless: t.draftPolicy.fearless,
      fearlessScope: t.draftPolicy.scope,
    });
  }

  return { games, series };
}

const generated = buildDataset();

export const FIXTURE_SERIES: Series[] = generated.series;
export const FIXTURE_GAMES: Game[] = generated.games;

export const FIXTURE_GAMES_INDEX = new Map(FIXTURE_GAMES.map((g) => [g.id, g]));
export const FIXTURE_SERIES_INDEX = new Map(FIXTURE_SERIES.map((s) => [s.id, s]));

export function gamesForTeam(teamId: string): Game[] {
  return FIXTURE_GAMES.filter((g) => g.blueTeamId === teamId || g.redTeamId === teamId);
}

export function seriesForTeam(teamId: string): Series[] {
  return FIXTURE_SERIES.filter((s) => s.teamAId === teamId || s.teamBId === teamId);
}

export function teamSideIn(game: Game, teamId: string): Side {
  return game.blueTeamId === teamId ? "BLUE" : "RED";
}

export const FIXTURE_INFO = {
  datasetId: FIXTURE_DATASET_ID,
  label: FIXTURE_LABEL,
  generatedAt: FIXTURE_GENERATED_AT,
  seed: FIXTURE_SEED,
  seriesCount: FIXTURE_SERIES.filter((s) => s.status === "completed").length,
  gameCount: FIXTURE_GAMES.length,
};
