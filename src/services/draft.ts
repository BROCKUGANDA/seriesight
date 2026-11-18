/**
 * Draft session service — the only component that mutates persisted draft state.
 * Flow per PRD G3: Coach input → state machine → rule validation → action event →
 * series restrictions → composition analysis → recommendation refresh → board.
 */
import { db } from "@/lib/db";
import type {
  DraftGameState,
  DraftRuleset,
  DraftSession,
  FearlessMode,
  RestrictionScope,
  Role,
  SeriesFormat,
  Side,
} from "@/domain/types";
import { ERRORS } from "@/domain/errors";
import { CHAMPIONS } from "@/fixtures/champions";
import { FIXTURE_GAMES_INDEX } from "@/fixtures/dataset";
import { CURRENT_PATCH, OUR_TEAM_ID, TEAM_INDEX } from "@/fixtures/teams";
import {
  applyAction,
  assignRole,
  availability,
  createGameState,
  draftProgress,
  finalizeGame,
  picksByTeam,
  redo,
  undo,
  type EngineOptions,
} from "@/domain/draft/engine";
import { gamesForFormat, rulesetById, winsNeeded } from "@/domain/draft/rulesets";
import { ScoutingContext } from "@/domain/analytics/scouting-context";
import { recommend, type DraftAnalyticsOutput } from "@/domain/analytics/recommendations";

export const WORKSPACE_ID = "ws-demo";
export const DEFAULT_POOL = CHAMPIONS.map((c) => c.id);

interface SessionRecordLike {
  id: string;
  workspaceId: string;
  ourTeamId: string;
  opponentTeamId: string;
  format: string;
  rulesetId: string;
  mode: string;
  restrictionsScope: string;
  tournamentId: string | null;
  patch: string;
  ourSide: string;
  poolJson: string;
  currentGame: number;
  status: string;
  stateVersion: number;
  gamesJson: string;
  createdAt: Date;
  updatedAt: Date;
}

function toSession(rec: SessionRecordLike): DraftSession {
  const pool = (() => {
    try {
      const parsed = JSON.parse(rec.poolJson) as string[];
      return Array.isArray(parsed) && parsed.length >= 20 ? parsed : DEFAULT_POOL;
    } catch {
      return DEFAULT_POOL;
    }
  })();
  return {
    id: rec.id,
    workspaceId: rec.workspaceId,
    ourTeamId: rec.ourTeamId,
    opponentTeamId: rec.opponentTeamId,
    format: rec.format as SeriesFormat,
    rulesetId: rec.rulesetId,
    mode: rec.mode as FearlessMode,
    restrictionsScope: rec.restrictionsScope as RestrictionScope,
    tournamentId: rec.tournamentId,
    patch: rec.patch,
    currentGame: rec.currentGame,
    status: rec.status as DraftSession["status"],
    stateVersion: rec.stateVersion,
    games: JSON.parse(rec.gamesJson) as DraftGameState[],
    pool,
    createdAt: rec.createdAt.toISOString(),
    updatedAt: rec.updatedAt.toISOString(),
  };
}

function engineOptionsFor(session: DraftSession, game: DraftGameState, ruleset: DraftRuleset): EngineOptions {
  // Prior picks come from finalized games earlier in the session.
  const priorPicksByTeam: Record<string, string[]> = {};
  for (const g of session.games) {
    if (g.status !== "finalized") continue;
    for (const [teamId, picks] of Object.entries(picksByTeam(g))) {
      priorPicksByTeam[teamId] = [...(priorPicksByTeam[teamId] ?? []), ...picks];
    }
  }
  return {
    ruleset,
    blueTeamId: game.blueTeamId,
    redTeamId: game.redTeamId,
    ourSide: game.ourSide as Side,
    priorPicksByTeam,
    pool: session.pool,
    gameNumber: game.gameNumber,
  };
}

function rulesetFor(session: DraftSession): DraftRuleset {
  const base = rulesetById(session.rulesetId);
  if (!base) throw ERRORS.validation(`Unknown ruleset ${session.rulesetId}.`, { rulesetId: session.rulesetId });
  // Mode/scope stored on the session are authoritative (coach override at creation).
  if (base.mode === session.mode && base.restrictionsScope === session.restrictionsScope) return base;
  return { ...base, mode: session.mode, restrictionsScope: session.restrictionsScope };
}

export interface CreateSessionInput {
  opponentTeamId: string;
  ourTeamId?: string;
  format: SeriesFormat;
  rulesetId: string;
  modeOverride?: FearlessMode;
  scopeOverride?: RestrictionScope;
  ourSide?: Side;
  tournamentId?: string | null;
  patch?: string;
  pool?: string[];
}

export async function createSession(input: CreateSessionInput): Promise<DraftSession> {
  const ruleset = rulesetById(input.rulesetId);
  if (!ruleset) throw ERRORS.validation(`Unknown ruleset "${input.rulesetId}".`, { rulesetId: input.rulesetId });
  if (!TEAM_INDEX.has(input.opponentTeamId)) throw ERRORS.unknownTeam(input.opponentTeamId);
  const mode = input.modeOverride ?? ruleset.mode;
  const scope = input.scopeOverride ?? ruleset.restrictionsScope;
  const ourSide: Side = input.ourSide ?? "BLUE";
  const blueTeamId = ourSide === "BLUE" ? (input.ourTeamId ?? OUR_TEAM_ID) : input.opponentTeamId;
  const redTeamId = ourSide === "BLUE" ? input.opponentTeamId : (input.ourTeamId ?? OUR_TEAM_ID);
  const pool = input.pool && input.pool.length >= 20 ? input.pool : DEFAULT_POOL;

  const sessionDraft: DraftSession = {
    id: "",
    workspaceId: WORKSPACE_ID,
    ourTeamId: input.ourTeamId ?? OUR_TEAM_ID,
    opponentTeamId: input.opponentTeamId,
    format: input.format,
    rulesetId: ruleset.id,
    mode,
    restrictionsScope: scope,
    currentGame: 1,
    status: "active",
    stateVersion: 1,
    games: [],
    tournamentId: input.tournamentId ?? null,
    patch: input.patch ?? CURRENT_PATCH,
    pool,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  sessionDraft.games = [
    createGameState({
      ruleset: { ...ruleset, mode, restrictionsScope: scope },
      blueTeamId,
      redTeamId,
      ourSide,
      priorPicksByTeam: {},
      pool,
      gameNumber: 1,
    }),
  ];

  const rec = await db.draftSessionRecord.create({
    data: {
      workspaceId: sessionDraft.workspaceId,
      ourTeamId: sessionDraft.ourTeamId,
      opponentTeamId: sessionDraft.opponentTeamId,
      format: sessionDraft.format,
      rulesetId: sessionDraft.rulesetId,
      mode,
      restrictionsScope: scope,
      tournamentId: sessionDraft.tournamentId,
      patch: sessionDraft.patch,
      ourSide,
      poolJson: JSON.stringify(pool),
      currentGame: 1,
      status: "active",
      stateVersion: 1,
      gamesJson: JSON.stringify(sessionDraft.games),
    },
  });
  return toSession(rec);
}

async function loadSession(sessionId: string): Promise<{ rec: SessionRecordLike; session: DraftSession }> {
  const rec = await db.draftSessionRecord.findUnique({ where: { id: sessionId } });
  if (!rec) throw ERRORS.notFound(`Draft session ${sessionId}`);
  return { rec, session: toSession(rec) };
}

async function persist(session: DraftSession): Promise<DraftSession> {
  const rec = await db.draftSessionRecord.update({
    where: { id: session.id },
    data: {
      currentGame: session.currentGame,
      status: session.status,
      stateVersion: session.stateVersion,
      gamesJson: JSON.stringify(session.games),
      updatedAt: new Date(),
    },
  });
  return toSession(rec);
}

async function auditAction(sessionId: string, gameNumber: number, action: { id: string; order: number; type: string; side: string; championId: string; playerId: string | null; role: string | null; phase: string; actor: string; priorStateVersion: number }): Promise<void> {
  await db.draftActionRecord.create({
    data: {
      id: action.id,
      sessionId,
      gameNumber,
      order: action.order,
      type: action.type,
      side: action.side,
      championId: action.championId,
      playerId: action.playerId,
      role: action.role,
      phase: action.phase,
      actor: action.actor,
      priorStateVersion: action.priorStateVersion,
    },
  });
}

function guardVersion(session: DraftSession, expectedVersion: number | undefined): void {
  if (expectedVersion === undefined) return;
  if (expectedVersion !== session.stateVersion) {
    throw ERRORS.staleVersion(session.stateVersion, expectedVersion);
  }
}

function currentGame(session: DraftSession): DraftGameState {
  const game = session.games.find((g) => g.gameNumber === session.currentGame);
  if (!game) throw ERRORS.notFound(`Game ${session.currentGame} in session ${session.id}`);
  return game;
}

/** Availability map for a session's current game (champion grid state). */
export function availabilityForSession(session: DraftSession, gameNumber?: number): Record<string, { available: boolean; reasons: { kind: string; detail: string }[] }> {
  const game = gameNumber ? session.games.find((g) => g.gameNumber === gameNumber) ?? currentGame(session) : currentGame(session);
  const ruleset = rulesetFor(session);
  const opts = engineOptionsFor(session, game, ruleset);
  const avail = availability(game, opts);
  const out: Record<string, { available: boolean; reasons: { kind: string; detail: string }[] }> = {};
  for (const champId of opts.pool) {
    const a = avail.get(champId)!;
    out[champId] = {
      available: a.available,
      reasons: a.reasons.map((r) => ({
        kind: r.kind,
        detail:
          r.kind === "ban"
            ? `banned this game (${r.side})`
            : r.kind === "pick"
              ? `picked this game (${r.side})`
              : r.kind === "fearless"
                ? `${r.mode === "hard" ? "Hard" : "Soft"} Fearless — locked via ${r.via}`
                : "outside configured pool",
      })),
    };
  }
  return out;
}

export interface ApplyActionResult {
  session: DraftSession;
  availability: ReturnType<typeof availabilityForSession>;
  progress: { applied: number; total: number; pct: number };
}

export async function applyDraftAction(
  sessionId: string,
  input: { type: "ban" | "pick"; championId: string; playerId?: string | null; role?: Role | null; actor?: string; expectedStateVersion?: number },
): Promise<ApplyActionResult> {
  const { session } = await loadSession(sessionId);
  guardVersion(session, input.expectedStateVersion);
  if (session.status !== "active") throw ERRORS.sessionCompleted();
  const ruleset = rulesetFor(session);
  const game = currentGame(session);
  const opts = engineOptionsFor(session, game, ruleset);

  const { state: nextGame, action } = applyAction(
    game,
    { ...input, actor: input.actor ?? "coach" },
    opts,
  );
  const games = session.games.map((g) => (g.gameNumber === nextGame.gameNumber ? nextGame : g));
  const updated: DraftSession = { ...session, games, stateVersion: session.stateVersion + 1, updatedAt: new Date().toISOString() };
  await auditAction(session.id, nextGame.gameNumber, action);
  const saved = await persist(updated);
  return { session: saved, availability: availabilityForSession(saved), progress: draftProgress(nextGame, ruleset) };
}

export async function undoLast(sessionId: string, expectedStateVersion?: number): Promise<ApplyActionResult> {
  const { session } = await loadSession(sessionId);
  guardVersion(session, expectedStateVersion);
  const ruleset = rulesetFor(session);
  const game = currentGame(session);
  const opts = engineOptionsFor(session, game, ruleset);
  const nextGame = undo(game, opts);
  const games = session.games.map((g) => (g.gameNumber === nextGame.gameNumber ? nextGame : g));
  const saved = await persist({ ...session, games, stateVersion: session.stateVersion + 1, updatedAt: new Date().toISOString() });
  return { session: saved, availability: availabilityForSession(saved), progress: draftProgress(nextGame, ruleset) };
}

export async function redoLast(sessionId: string, expectedStateVersion?: number): Promise<ApplyActionResult> {
  const { session } = await loadSession(sessionId);
  guardVersion(session, expectedStateVersion);
  const ruleset = rulesetFor(session);
  const game = currentGame(session);
  const opts = engineOptionsFor(session, game, ruleset);
  const nextGame = redo(game, opts);
  const games = session.games.map((g) => (g.gameNumber === nextGame.gameNumber ? nextGame : g));
  const saved = await persist({ ...session, games, stateVersion: session.stateVersion + 1, updatedAt: new Date().toISOString() });
  return { session: saved, availability: availabilityForSession(saved), progress: draftProgress(nextGame, ruleset) };
}

export async function assignPickRole(
  sessionId: string,
  input: { side: Side; pickIndex: number; role: Role; playerId?: string | null; expectedStateVersion?: number },
): Promise<ApplyActionResult> {
  const { session } = await loadSession(sessionId);
  guardVersion(session, input.expectedStateVersion);
  const ruleset = rulesetFor(session);
  const game = currentGame(session);
  const opts = engineOptionsFor(session, game, ruleset);
  const nextGame = assignRole(game, input.side, input.pickIndex, input.role, input.playerId ?? null);
  const games = session.games.map((g) => (g.gameNumber === nextGame.gameNumber ? nextGame : g));
  const saved = await persist({ ...session, games, stateVersion: session.stateVersion + 1, updatedAt: new Date().toISOString() });
  return { session: saved, availability: availabilityForSession(saved), progress: draftProgress(nextGame, ruleset) };
}

export async function finalizeCurrentGame(sessionId: string, expectedStateVersion?: number): Promise<{ session: DraftSession; seriesComplete: boolean }> {
  const { session } = await loadSession(sessionId);
  guardVersion(session, expectedStateVersion);
  const ruleset = rulesetFor(session);
  const game = currentGame(session);
  const nextGame = finalizeGame(game, ruleset);
  const games = session.games.map((g) => (g.gameNumber === nextGame.gameNumber ? nextGame : g));
  let updated: DraftSession = { ...session, games, stateVersion: session.stateVersion + 1, updatedAt: new Date().toISOString() };
  const maxGames = gamesForFormat(updated.format);
  // The demo session tracks draft completion; series completes when all games are drafted.
  if (updated.games.length >= maxGames && updated.games.every((g) => g.status === "finalized")) {
    updated = { ...updated, status: "completed" };
  }
  const saved = await persist(updated);
  return { session: saved, seriesComplete: saved.status === "completed" };
}

export async function startNextGame(sessionId: string, expectedStateVersion?: number): Promise<ApplyActionResult> {
  const { session } = await loadSession(sessionId);
  guardVersion(session, expectedStateVersion);
  const ruleset = rulesetFor(session);
  const maxGames = gamesForFormat(session.format);
  if (session.games.some((g) => g.gameNumber === session.currentGame && g.status !== "finalized")) {
    throw ERRORS.validation("Finish the current game before starting the next one.");
  }
  if (session.currentGame >= maxGames) throw ERRORS.validation(`A ${session.format} series has at most ${maxGames} games.`);
  const lastGame = session.games[session.games.length - 1];
  const nextNumber = lastGame.gameNumber + 1;
  // Alternate sides between games (standard tournament behaviour).
  const ourSide: Side = lastGame.ourSide === "BLUE" ? "RED" : "BLUE";
  const ourTeam = session.ourTeamId;
  const oppTeam = session.opponentTeamId;
  const blueTeamId = ourSide === "BLUE" ? ourTeam : oppTeam;
  const redTeamId = ourSide === "BLUE" ? oppTeam : ourTeam;
  const opts: EngineOptions = {
    ruleset,
    blueTeamId,
    redTeamId,
    ourSide,
    priorPicksByTeam: {},
    pool: session.pool,
    gameNumber: nextNumber,
  };
  // Fearless sources: picks from all finalized games.
  for (const g of session.games) {
    if (g.status !== "finalized") continue;
    for (const [teamId, picks] of Object.entries(picksByTeam(g))) {
      opts.priorPicksByTeam[teamId] = [...(opts.priorPicksByTeam[teamId] ?? []), ...picks];
    }
  }
  const nextGame = createGameState(opts);
  const games = [...session.games, nextGame];
  const saved = await persist({
    ...session,
    games,
    currentGame: nextNumber,
    stateVersion: session.stateVersion + 1,
    updatedAt: new Date().toISOString(),
  });
  return { session: saved, availability: availabilityForSession(saved), progress: draftProgress(nextGame, ruleset) };
}

export async function resetGame(sessionId: string, expectedStateVersion?: number): Promise<ApplyActionResult> {
  const { session } = await loadSession(sessionId);
  guardVersion(session, expectedStateVersion);
  const ruleset = rulesetFor(session);
  const game = currentGame(session);
  const fresh = createGameState(engineOptionsFor(session, game, ruleset));
  const games = session.games.map((g) => (g.gameNumber === game.gameNumber ? fresh : g));
  const saved = await persist({ ...session, games, stateVersion: session.stateVersion + 1, updatedAt: new Date().toISOString() });
  return { session: saved, availability: availabilityForSession(saved), progress: draftProgress(fresh, ruleset) };
}

export async function getSession(sessionId: string): Promise<DraftSession> {
  const { session } = await loadSession(sessionId);
  return session;
}

export async function listSessions(limit = 12): Promise<DraftSession[]> {
  const recs = await db.draftSessionRecord.findMany({
    where: { workspaceId: WORKSPACE_ID },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return recs.map(toSession);
}

/** Recommendations for the current draft moment (PRD D5 draft analysis). */
export function recommendationsForSession(session: DraftSession): DraftAnalyticsOutput {
  const game = currentGame(session);
  const ruleset = rulesetFor(session);
  const opts = engineOptionsFor(session, game, ruleset);
  const avail = availability(game, opts);
  const unavailable = new Set([...avail.entries()].filter(([, a]) => !a.available).map(([id]) => id));
  const ourTeam = session.ourTeamId;
  const ourSide: Side = game.blueTeamId === ourTeam ? "BLUE" : "RED";
  const oppSide: Side = ourSide === "BLUE" ? "RED" : "BLUE";
  const ourPicks = (game.blueTeamId === ourTeam ? game.blue.picks : game.red.picks).map((p) => p.championId);
  const oppPicks = (game.blueTeamId === ourTeam ? game.red.picks : game.blue.picks).map((p) => p.championId);
  const ourBans = (game.blueTeamId === ourTeam ? game.blue.bans : game.red.bans).filter((b): b is string => b !== null);
  const oppBans = (game.blueTeamId === ourTeam ? game.red.bans : game.blue.bans).filter((b): b is string => b !== null);

  const opponentCtx = new ScoutingContext(session.opponentTeamId, { patch: session.patch });
  const ourCtx = new ScoutingContext(ourTeam, {});
  const pool = opts.pool.map((id) => avail.get(id)).filter(Boolean) as { available: boolean }[];
  void pool;
  const poolChampions = CHAMPIONS.filter((c) => opts.pool.includes(c.id));
  return recommend({
    opponentCtx,
    ourCtx,
    ourSide,
    gameNumber: session.currentGame,
    fearlessMode: ruleset.mode,
    unavailableChampionIds: unavailable,
    opponentPicks: oppPicks,
    ourPicks,
    ourBans,
    opponentBans: oppBans,
    pool: poolChampions,
  });
}

/** Fearless restriction ledger for Series Lab: which champions each game locked. */
export function seriesRestrictions(session: DraftSession): {
  gameNumber: number;
  introducedByTeam: Record<string, string[]>;
  poolRemaining: number;
  restrictedNext: string[];
}[] {
  const ruleset = rulesetFor(session);
  const pool = DEFAULT_POOL.length;
  const out: { gameNumber: number; introducedByTeam: Record<string, string[]>; poolRemaining: number; restrictedNext: string[] }[] = [];
  // Restriction sets per team, accumulated from finalized games.
  const perTeamRestricted = new Map<string, Set<string>>();
  for (const g of session.games) {
    // Row semantics: the restriction set that applies to THIS game, i.e. picks
    // locked from games finalized BEFORE it. Current-game picks accumulate after.
    let restrictedNext: string[] = [];
    if (ruleset.mode !== "none") {
      if (ruleset.mode === "hard" || ruleset.restrictionsScope === "both") {
        restrictedNext = [...new Set([...perTeamRestricted.values()].flatMap((set) => [...set]))];
      } else {
        restrictedNext = [...(perTeamRestricted.get(session.ourTeamId) ?? [])];
      }
    }
    const picks = picksByTeam(g);
    out.push({
      gameNumber: g.gameNumber,
      introducedByTeam: Object.fromEntries(Object.entries(picks).map(([t, cs]) => [t, cs])),
      poolRemaining: pool - restrictedNext.length,
      restrictedNext,
    });
    if (g.status === "finalized") {
      for (const [teamId, champIds] of Object.entries(picks)) {
        const set = perTeamRestricted.get(teamId) ?? new Set<string>();
        champIds.forEach((c) => set.add(c));
        perTeamRestricted.set(teamId, set);
      }
    }
  }
  return out;
}

/**
 * Counterfactual: clone a completed game with one champion swapped, then compare
 * the resulting Fearless availability for the next game side by side.
 */
export function counterfactual(
  session: DraftSession,
  input: { baseGameNumber: number; removeChampionId: string; addChampionId: string; role?: Role },
): {
  base: { gameNumber: number; picks: string[]; restrictedForNext: string[]; poolRemaining: number };
  variant: { gameNumber: number; picks: string[]; restrictedForNext: string[]; poolRemaining: number };
  delta: { newlyAvailable: string[]; newlyRestricted: string[] };
} {
  const ruleset = rulesetFor(session);
  const baseGame = session.games.find((g) => g.gameNumber === input.baseGameNumber);
  if (!baseGame) throw ERRORS.notFound(`Game ${input.baseGameNumber}`);
  const pickList = picksByTeam(baseGame);
  const basePicks = [...Object.values(pickList).flat()];
  if (!basePicks.includes(input.removeChampionId)) {
    throw ERRORS.validation(`${input.removeChampionId} was not picked in game ${input.baseGameNumber}.`);
  }
  const variantPicks = basePicks.filter((c) => c !== input.removeChampionId).concat([input.addChampionId]);
  const restrict = (picks: string[]) => (ruleset.mode === "none" ? [] : [...new Set(picks)]);
  const baseRestricted = restrict(basePicks);
  const variantRestricted = restrict(variantPicks);
  return {
    base: { gameNumber: baseGame.gameNumber, picks: basePicks, restrictedForNext: baseRestricted, poolRemaining: DEFAULT_POOL.length - baseRestricted.length },
    variant: { gameNumber: baseGame.gameNumber, picks: variantPicks, restrictedForNext: variantRestricted, poolRemaining: DEFAULT_POOL.length - variantRestricted.length },
    delta: {
      newlyAvailable: baseRestricted.filter((c) => !variantRestricted.includes(c)),
      newlyRestricted: variantRestricted.filter((c) => !baseRestricted.includes(c)),
    },
  };
}

export function winsNeededFor(format: SeriesFormat): number {
  return winsNeeded(format);
}
