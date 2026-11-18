/**
 * Draft state machine (PRD D5). Pure, deterministic and independently testable.
 *
 * Guarantees:
 *  - No invalid action ever partially mutates the board (validate-then-apply).
 *  - Bans, picks and Fearless-restricted champions are tracked as separate states.
 *  - Every mutation emits an event with id, order, actor, phase and prior version.
 *  - Undo/redo are event-sourced: undo pops the last applied action into the redo
 *    stack; redo re-applies it. `turn` therefore always equals actions.length.
 */
import type {
  DraftActionType,
  DraftGameAction,
  DraftGameState,
  DraftPhase,
  DraftRuleset,
  Role,
  Side,
} from "@/domain/types";
import { AppError, ERRORS } from "@/domain/errors";
import { getChampion } from "@/fixtures/champions";

export interface EngineOptions {
  ruleset: DraftRuleset;
  blueTeamId: string;
  redTeamId: string;
  ourSide: Side;
  /** Picks from earlier games of the series, keyed by team id. */
  priorPicksByTeam: Record<string, string[]>;
  /** Configured champion pool for the workspace (ids). */
  pool: string[];
  /** Game number within the session (1-based). */
  gameNumber: number;
}

export interface DraftTurn {
  index: number;
  type: DraftActionType;
  side: Side;
  phase: DraftPhase;
  teamId: string;
}

export type UnavailabilityReason =
  | { kind: "ban"; side: Side }
  | { kind: "pick"; side: Side }
  | { kind: "fearless"; mode: "hard" | "soft"; via: string }
  | { kind: "off-pool" };

export type AvailabilityMap = Map<string, { available: boolean; reasons: UnavailabilityReason[] }>;

let idCounter = 0;
export function nextActionId(): string {
  idCounter += 1;
  return `act-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function createGameState(opts: EngineOptions): DraftGameState {
  const state: DraftGameState = {
    gameNumber: opts.gameNumber,
    status: "drafting",
    rulesetId: opts.ruleset.id,
    blueTeamId: opts.blueTeamId,
    redTeamId: opts.redTeamId,
    ourSide: opts.ourSide,
    phase: "BAN_PHASE_1",
    turn: 0,
    blue: { teamId: opts.blueTeamId, side: "BLUE", bans: [null, null, null, null, null], picks: [] },
    red: { teamId: opts.redTeamId, side: "RED", bans: [null, null, null, null, null], picks: [] },
    actions: [],
    redoStack: [],
    currentVersion: 1,
    invalidReason: null,
  };
  state.phase = opts.ruleset.actionSequence[0]?.phase ?? "COMPLETED";
  return state;
}

export function currentTurn(state: DraftGameState, ruleset: DraftRuleset): DraftTurn | null {
  if (state.status !== "drafting") return null;
  const index = state.actions.length;
  const slot = ruleset.actionSequence[index];
  if (!slot) return null;
  return {
    index,
    type: slot.type,
    side: slot.side,
    phase: slot.phase,
    teamId: slot.side === "BLUE" ? state.blue.teamId : state.red.teamId,
  };
}

/** Fearless restrictions for a side, given the session configuration. */
export function fearlessRestrictionsFor(
  side: Side,
  teamId: string,
  opts: Pick<EngineOptions, "priorPicksByTeam" | "ruleset">,
): Map<string, UnavailabilityReason> {
  const map = new Map<string, UnavailabilityReason>();
  const mode = opts.ruleset.mode;
  if (mode === "none") return map;
  const scope = opts.ruleset.restrictionsScope;
  const source = (tid: string) => opts.priorPicksByTeam[tid] ?? [];
  const include =
    mode === "hard"
      ? () => true
      : (tid: string) => (scope === "both" ? true : tid === teamId);
  for (const [tid, picks] of Object.entries(opts.priorPicksByTeam)) {
    if (!include(tid)) continue;
    for (const champId of source(tid)) {
      if (!map.has(champId)) {
        map.set(champId, { kind: "fearless", mode, via: tid === teamId ? "our earlier pick" : `${tid}'s earlier pick` });
      }
    }
  }
  return map;
}

export interface SideAvailability {
  available: boolean;
  reasons: UnavailabilityReason[];
}

export interface AvailabilityEntry {
  /** Availability from the perspective of the CURRENT acting side (or either side when no turn). */
  available: boolean;
  reasons: UnavailabilityReason[];
  /** Explicit per-side view — Soft Fearless restricts sides differently. */
  bySide: { BLUE: SideAvailability; RED: SideAvailability };
}

/**
 * Availability of every pool champion in the current game state.
 * Bans, picks and Fearless restrictions are reported as distinct reasons, and
 * Soft/own restrictions are resolved per side — a champion locked only for RED
 * stays available for BLUE, matching tournament semantics.
 */
export function availability(state: DraftGameState, opts: EngineOptions): Map<string, AvailabilityEntry> {
  const map: Map<string, AvailabilityEntry> = new Map();
  const banned = new Set([...state.blue.bans, ...state.red.bans].filter((b): b is string => b !== null));
  const picked = new Set([...state.blue.picks, ...state.red.picks].map((p) => p.championId));
  const blueFearless = fearlessRestrictionsFor("BLUE", state.blue.teamId, opts);
  const redFearless = fearlessRestrictionsFor("RED", state.red.teamId, opts);

  const reasonsFor = (side: Side, champId: string): UnavailabilityReason[] => {
    const reasons: UnavailabilityReason[] = [];
    if (!opts.pool.includes(champId)) reasons.push({ kind: "off-pool" });
    if (banned.has(champId)) {
      // The ban itself is global in a game; the recorded side notes who banned it.
      reasons.push({ kind: "ban", side: state.blue.bans.includes(champId) ? "BLUE" : "RED" });
    }
    if (picked.has(champId)) {
      reasons.push({ kind: "pick", side: state.blue.picks.some((p) => p.championId === champId) ? "BLUE" : "RED" });
    }
    const fearless = side === "BLUE" ? blueFearless : redFearless;
    if (fearless.has(champId) && !picked.has(champId)) reasons.push(fearless.get(champId)!);
    return reasons;
  };

  const turnSlot = rulesetSlotFor(state, opts);
  const actingSide: Side | null = turnSlot?.side ?? null;

  for (const champId of opts.pool) {
    const blue = reasonsFor("BLUE", champId);
    const red = reasonsFor("RED", champId);
    const bySide = { BLUE: { available: blue.length === 0, reasons: blue }, RED: { available: red.length === 0, reasons: red } };
    const view = actingSide ? bySide[actingSide] : bySide.BLUE.available && bySide.RED.available ? bySide.BLUE : { available: false, reasons: [...new Set([...bySide.BLUE.reasons, ...bySide.RED.reasons])] };
    map.set(champId, { available: view.available, reasons: view.reasons, bySide });
  }
  return map;
}

function rulesetSlotFor(state: DraftGameState, opts: EngineOptions): { type: DraftActionType; side: Side } | null {
  if (state.status !== "drafting") return null;
  return opts.ruleset.actionSequence[state.actions.length] ?? null;
}

export interface ApplyInput {
  type: DraftActionType;
  championId: string;
  playerId?: string | null;
  role?: Role | null;
  actor: string;
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

/**
 * Validate and apply one draft action. Throws typed AppErrors; the input state is
 * never mutated on failure.
 */
export function applyAction(state: DraftGameState, input: ApplyInput, opts: EngineOptions): { state: DraftGameState; action: DraftGameAction } {
  if (state.status !== "drafting") throw ERRORS.sessionCompleted();
  const ruleset = opts.ruleset;
  const turn = currentTurn(state, ruleset);
  if (!turn) throw ERRORS.invalidPhase(state.phase);

  if (input.type !== turn.type) throw ERRORS.wrongOrder(turn.type, input.type);

  const champ = getChampion(input.championId);
  if (!champ) throw ERRORS.validation(`Unknown champion "${input.championId}".`);

  const actingSide = turn.side;
  const actingTeam = turn.teamId;

  const availEntry = availability(state, opts).get(input.championId);
  if (!availEntry || !opts.pool.includes(input.championId)) {
    throw ERRORS.restrictedChampion(champ.displayName, "outside the configured champion pool");
  }
  if (!availEntry.available) {
    const r = availEntry.reasons[0];
    const reason =
      r.kind === "ban"
        ? `already banned in this game (${r.side} side)`
        : r.kind === "pick"
          ? `already picked in this game (${r.side} side)`
          : r.kind === "fearless"
            ? `${r.mode === "hard" ? "Hard Fearless" : "Soft Fearless"} restriction — locked via ${r.via} earlier in the series`
            : "outside the configured pool";
    throw ERRORS.restrictedChampion(champ.displayName, reason);
  }

  // Role sanity: a pick may carry an optional role; it must match champion capability.
  if (input.type === "pick" && input.role) {
    const allowed = [champ.primaryRole, ...champ.flexRoles];
    if (!allowed.includes(input.role)) {
      throw ERRORS.validation(`${champ.displayName} is not a listed ${input.role} option (listed: ${allowed.join("/")}).`);
    }
  }

  const next = clone(state);
  const action: DraftGameAction = {
    id: nextActionId(),
    sessionGameId: `${next.gameNumber}`,
    order: next.actions.length + 1,
    type: input.type,
    side: actingSide,
    championId: input.championId,
    playerId: input.playerId ?? null,
    role: input.role ?? null,
    phase: turn.phase,
    actor: input.actor,
    createdAt: new Date().toISOString(),
    priorStateVersion: state.currentVersion,
  };

  const bucket = actingSide === "BLUE" ? next.blue : next.red;
  if (input.type === "ban") {
    const slotIdx = bucket.bans.findIndex((b) => b === null);
    if (slotIdx === -1) throw ERRORS.invalidPhase(turn.phase);
    bucket.bans[slotIdx] = input.championId;
  } else {
    bucket.picks.push({ championId: input.championId, playerId: input.playerId ?? null, role: input.role ?? null });
  }

  next.actions.push(action);
  next.redoStack = [];
  next.turn = next.actions.length;
  const nextSlot = ruleset.actionSequence[next.turn];
  next.phase = nextSlot?.phase ?? "FINALIZATION";
  next.currentVersion = state.currentVersion + 1;

  // Auto-finalize when the sequence is exhausted.
  if (!nextSlot && next.actions.length >= ruleset.actionSequence.length) {
    next.phase = "FINALIZATION";
  }
  return { state: next, action };
}

/** Undo the most recent applied action. Illegal when the game is finalized or empty. */
export function undo(state: DraftGameState, opts: EngineOptions): DraftGameState {
  if (state.status !== "drafting") throw ERRORS.illegalUndo("the game is finalized");
  if (state.actions.length === 0) throw ERRORS.illegalUndo("there are no applied actions");
  const next = clone(state);
  const action = next.actions.pop()!;
  next.redoStack.push(action);
  next.turn = next.actions.length;
  const ruleset = opts.ruleset;
  const slot = ruleset.actionSequence[next.turn];
  next.phase = slot?.phase ?? "BAN_PHASE_1";
  next.currentVersion = state.currentVersion + 1;
  // Roll back board state from the full action log (source of truth).
  rebuildFromActions(next, ruleset);
  return next;
}

export function redo(state: DraftGameState, opts: EngineOptions): DraftGameState {
  if (state.status !== "drafting") throw ERRORS.illegalUndo("the game is finalized");
  if (state.redoStack.length === 0) throw ERRORS.illegalUndo("there is no undone action to redo");
  const next = clone(state);
  const action = next.redoStack.pop()!;
  const ruleset = opts.ruleset;
  const turnIdx = next.actions.length;
  const slot = ruleset.actionSequence[turnIdx];
  if (!slot || slot.type !== action.type || slot.side !== action.side) {
    throw ERRORS.illegalUndo("redo no longer matches the tournament sequence");
  }
  next.actions.push(action);
  next.turn = next.actions.length;
  const nextSlot = ruleset.actionSequence[next.turn];
  next.phase = nextSlot?.phase ?? "FINALIZATION";
  next.currentVersion = state.currentVersion + 1;
  rebuildFromActions(next, ruleset);
  return next;
}

/** Rebuild team buckets from the authoritative action log. */
function rebuildFromActions(state: DraftGameState, ruleset: DraftRuleset): void {
  state.blue = { teamId: state.blue.teamId, side: "BLUE", bans: [null, null, null, null, null], picks: [] };
  state.red = { teamId: state.red.teamId, side: "RED", bans: [null, null, null, null, null], picks: [] };
  for (const a of state.actions) {
    const bucket = a.side === "BLUE" ? state.blue : state.red;
    if (a.type === "ban") {
      const idx = bucket.bans.findIndex((b) => b === null);
      if (idx >= 0) bucket.bans[idx] = a.championId;
    } else {
      bucket.picks.push({ championId: a.championId, playerId: a.playerId, role: a.role });
    }
  }
  state.turn = state.actions.length;
  const slot = ruleset.actionSequence[state.turn];
  state.phase = slot?.phase ?? "FINALIZATION";
}

/** Assign a player/role to one of a side's picks without consuming a draft turn. */
export function assignRole(
  state: DraftGameState,
  side: Side,
  pickIndex: number,
  role: Role,
  playerId: string | null,
): DraftGameState {
  if (state.status !== "drafting") throw ERRORS.sessionCompleted();
  const bucket = side === "BLUE" ? state.blue : state.red;
  const pick = bucket.picks[pickIndex];
  if (!pick) throw ERRORS.validation("No pick exists at that slot.");
  const champ = getChampion(pick.championId);
  if (!champ) throw ERRORS.validation("Unknown champion on that slot.");
  const allowed = [champ.primaryRole, ...champ.flexRoles];
  if (!allowed.includes(role)) {
    throw ERRORS.validation(`${champ.displayName} is not a listed ${role} option (listed: ${allowed.join("/")}).`);
  }
  const next = clone(state);
  const b = side === "BLUE" ? next.blue : next.red;
  b.picks[pickIndex] = { ...pick, role, playerId };
  next.currentVersion = state.currentVersion + 1;
  return next;
}

/** Finalize the game: requires the full sequence and every pick to carry a role. */
export function finalizeGame(state: DraftGameState, ruleset: DraftRuleset): DraftGameState {
  if (state.status !== "drafting") throw ERRORS.sessionCompleted();
  const total = ruleset.actionSequence.length;
  if (state.actions.length < total) {
    // Completion without required selections is rejected.
    throw ERRORS.validation(`The draft sequence is incomplete; all ${total} actions must be locked first (${state.actions.length}/${total}).`);
  }
  const missing: string[] = [];
  for (const side of [state.blue, state.red]) {
    side.picks.forEach((p, i) => {
      if (!p.role) missing.push(`${side.side} pick ${i + 1} (${getChampion(p.championId)?.displayName ?? p.championId})`);
    });
  }
  if (missing.length > 0) {
    throw ERRORS.validation(`Assign roles before finalizing. Missing: ${missing.join("; ")}.`, { missing });
  }
  const next = clone(state);
  next.phase = "COMPLETED";
  next.status = "finalized";
  next.currentVersion = state.currentVersion + 1;
  return next;
}

export function draftProgress(state: DraftGameState, ruleset: DraftRuleset): { applied: number; total: number; pct: number } {
  const total = ruleset.actionSequence.length;
  const applied = state.actions.length;
  return { applied, total, pct: Math.round((applied / total) * 100) };
}

/** Champion ids picked by each team in this game (for Fearless propagation). */
export function picksByTeam(state: DraftGameState): Record<string, string[]> {
  return {
    [state.blue.teamId]: state.blue.picks.map((p) => p.championId),
    [state.red.teamId]: state.red.picks.map((p) => p.championId),
  };
}
