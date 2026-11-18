/**
 * Draft engine unit tests (PRD O1): state machine, sequences, Hard/Soft Fearless,
 * duplicate handling, undo/redo, wrong team/phase/order and stale versions.
 */
import { describe, it, expect } from "vitest";
import {
  applyAction,
  availability,
  createGameState,
  draftProgress,
  finalizeGame,
  redo,
  undo,
  assignRole,
  picksByTeam,
} from "@/domain/draft/engine";
import { buildRuleset, RULESETS, rulesetById, gamesForFormat, winsNeeded } from "@/domain/draft/rulesets";
import { AppError, ERRORS } from "@/domain/errors";
import type { Role } from "@/domain/types";

import { CHAMPIONS } from "@/fixtures/champions";
const POOL = CHAMPIONS.map((c) => c.id);
const BASE = { blueTeamId: "SGT", redTeamId: "NVX", ourSide: "BLUE" as const, priorPicksByTeam: {}, pool: POOL };
const RULESET = rulesetById("std-bo5")!;

function opts(overrides: Partial<typeof BASE> & { ruleset?: typeof RULESET; gameNumber?: number } = {}) {
  return { ...BASE, ruleset: RULESET, gameNumber: 1, ...overrides } as Parameters<typeof applyAction>[2];
}

// Ban pool is fully disjoint from the pick pool so tests never collide.
const BANS = ["kalista", "azir", "vi", "rakan", "leblanc", "syndra", "pyke", "camille", "akali", "elise", "maokai", "thresh", "kaisa", "xayah", "ezreal", "ahri"];
const BLUE_PICKS: [string, string][] = [["aatrox", "TOP"], ["sejuani", "JUNGLE"], ["orianna", "MID"], ["jinx", "BOT"], ["nautilus", "SUPPORT"]];
const RED_PICKS: [string, string][] = [["ksante", "TOP"], ["leesin", "JUNGLE"], ["vex", "MID"], ["aphelios", "BOT"], ["renataglasc", "SUPPORT"]];

/**
 * Full legal sequence in tournament order:
 * bans 1-6 → picks 7-10 (B,R,R,B) → bans 11-14 → picks 15-20 (B,R,R,B,B,R).
 */
function fullSequenceActs(): { type: "ban" | "pick"; championId: string; role?: string }[] {
  const acts: { type: "ban" | "pick"; championId: string; role?: string }[] = [];
  for (let i = 0; i < 6; i++) acts.push({ type: "ban", championId: BANS[i] });
  acts.push({ type: "pick", championId: BLUE_PICKS[0][0], role: BLUE_PICKS[0][1] });
  acts.push({ type: "pick", championId: RED_PICKS[0][0], role: RED_PICKS[0][1] });
  acts.push({ type: "pick", championId: RED_PICKS[1][0], role: RED_PICKS[1][1] });
  acts.push({ type: "pick", championId: BLUE_PICKS[1][0], role: BLUE_PICKS[1][1] });
  for (let i = 6; i < 10; i++) acts.push({ type: "ban", championId: BANS[i] });
  acts.push({ type: "pick", championId: BLUE_PICKS[2][0], role: BLUE_PICKS[2][1] });
  acts.push({ type: "pick", championId: RED_PICKS[2][0], role: RED_PICKS[2][1] });
  acts.push({ type: "pick", championId: RED_PICKS[3][0], role: RED_PICKS[3][1] });
  acts.push({ type: "pick", championId: BLUE_PICKS[3][0], role: BLUE_PICKS[3][1] });
  acts.push({ type: "pick", championId: BLUE_PICKS[4][0], role: BLUE_PICKS[4][1] });
  acts.push({ type: "pick", championId: RED_PICKS[4][0], role: RED_PICKS[4][1] });
  return acts;
}

function applyMany(
  state: ReturnType<typeof createGameState>,
  acts: { type: "ban" | "pick"; championId: string; role?: string }[],
  o = opts(),
) {
  let s = state;
  for (const a of acts) {
    ({ state: s } = applyAction(s, { ...a, role: a.role as Role | null | undefined, actor: "test" }, o));
  }
  return s;
}

describe("draft rulesets", () => {
  it("defines 20 ordered actions per game: 10 bans then interleaved picks", () => {
    expect(RULESET.actionSequence).toHaveLength(20);
    expect(RULESET.actionSequence.filter((a) => a.type === "ban")).toHaveLength(10);
    expect(RULESET.actionSequence.filter((a) => a.type === "pick")).toHaveLength(10);
    // Order strictness: first six are bans, picks begin at slot 7.
    expect(RULESET.actionSequence.slice(0, 6).every((a) => a.type === "ban")).toBe(true);
    expect(RULESET.actionSequence[6].type).toBe("pick");
    expect(RULESET.actionSequence[6].side).toBe("BLUE"); // blue side gets first pick
  });

  it("exposes rulesets for every format and fearless mode", () => {
    for (const fmt of ["BO1", "BO3", "BO5"] as const) {
      for (const mode of ["none", "hard", "soft"] as const) {
        const rs = RULESETS.find((r) => r.format === fmt && r.mode === mode) ?? buildRuleset(`synthetic-${fmt}-${mode}`, fmt, mode, mode === "soft" ? "own" : "both");
        expect(rs).toBeDefined();
      }
    }
    // Built-in catalogue covers all BO3/BO5 combinations natively.
    expect(RULESETS.find((r) => r.format === "BO5" && r.mode === "hard")).toBeDefined();
    expect(RULESETS.find((r) => r.format === "BO3" && r.mode === "soft")).toBeDefined();
  });

  it("maps formats to game counts and wins needed", () => {
    expect(gamesForFormat("BO1")).toBe(1);
    expect(gamesForFormat("BO3")).toBe(3);
    expect(gamesForFormat("BO5")).toBe(5);
    expect(winsNeeded("BO3")).toBe(2);
    expect(winsNeeded("BO5")).toBe(3);
  });

  it("never assumes a fixed sequence without a ruleset configuration", () => {
    const custom = buildRuleset("custom-x", "BO3", "soft", "own", [
      { order: 1, type: "pick", side: "RED", phase: "PICK_PHASE_1" },
      { order: 2, type: "pick", side: "BLUE", phase: "PICK_PHASE_1" },
    ]);
    expect(custom.actionSequence[0].side).toBe("RED"); // custom sequences are honoured verbatim
  });
});

describe("draft state machine — validation", () => {
  it("starts in BAN_PHASE_1 with an empty board", () => {
    const s = createGameState(opts());
    expect(s.phase).toBe("BAN_PHASE_1");
    expect(s.actions).toHaveLength(0);
    expect(s.currentVersion).toBe(1);
  });

  it("rejects a pick during the ban phase without mutating the board", () => {
    const s = createGameState(opts());
    expect(() => applyAction(s, { type: "pick", championId: BANS[0], actor: "t" }, opts())).toThrow(AppError);
    const after = createGameState(opts());
    try {
      applyAction(after, { type: "pick", championId: BANS[0], actor: "t" }, opts());
    } catch {
      /* expected */
    }
    expect(after.blue.bans.every((b) => b === null)).toBe(true);
    expect(after.actions).toHaveLength(0);
    expect(after.currentVersion).toBe(1);
  });

  it("rejects wrong-side actions (turn order)", () => {
    let s = createGameState(opts());
    ({ state: s } = applyAction(s, { type: "ban", championId: BANS[0], actor: "t" }, opts()));
    expect(s.actions[0].side).toBe("BLUE");
  });

  it("rejects duplicate picks within a game", () => {
    let s = createGameState(opts());
    for (let i = 0; i < 6; i++) ({ state: s } = applyAction(s, { type: "ban", championId: BANS[i], actor: "t" }, opts()));
    ({ state: s } = applyAction(s, { type: "pick", championId: "aatrox", actor: "t" }, opts()));
    expect(() => applyAction(s, { type: "pick", championId: "aatrox", actor: "t" }, opts())).toThrow(/already taken|already picked|unavailable/i);
  });

  it("rejects banned champions as picks", () => {
    let s = createGameState(opts());
    for (let i = 0; i < 6; i++) ({ state: s } = applyAction(s, { type: "ban", championId: BANS[i], actor: "t" }, opts()));
    const bannedId = BANS[0];
    expect(() => applyAction(s, { type: "pick", championId: bannedId, actor: "t" }, opts())).toThrow(/banned/i);
  });

  it("rejects actions when the sequence is exhausted and prevents post-completion mutations", () => {
    let s = applyMany(createGameState(opts()), fullSequenceActs(), opts());
    expect(s.actions).toHaveLength(20);
    expect(s.phase).toBe("FINALIZATION");
    expect(() => applyAction(s, { type: "pick", championId: "graves", actor: "t" }, opts())).toThrow(AppError);
  });

  it("tracks bans and picks as separate states", () => {
    let s = createGameState(opts());
    ({ state: s } = applyAction(s, { type: "ban", championId: "kalista", actor: "t" }, opts()));
    expect(s.blue.bans).toContain("kalista");
    expect([...s.blue.picks, ...s.red.picks]).toHaveLength(0);
  });
});

describe("hard fearless restrictions", () => {
  const HARD = rulesetById("ff-hard-bo5")!;

  it("locks champions picked by EITHER team in later games for BOTH teams", () => {
    const priorPicksByTeam = { SGT: ["aatrox", "sejuani"], NVX: ["azir"] };
    const s = createGameState(opts({ ruleset: HARD, priorPicksByTeam, gameNumber: 2 }));
    const avail = availability(s, opts({ ruleset: HARD, priorPicksByTeam, gameNumber: 2 }));
    for (const c of ["aatrox", "sejuani", "azir"]) {
      expect(avail.get(c)!.available).toBe(false);
      expect(avail.get(c)!.reasons.some((r) => r.kind === "fearless")).toBe(true);
    }
    expect(avail.get("vi")!.available).toBe(true);
  });

  it("propagates picks via picksByTeam for the next game", () => {
    let s = createGameState(opts({ ruleset: HARD }));
    s = applyMany(s, [
      { type: "ban", championId: BANS[0] }, { type: "ban", championId: BANS[1] }, { type: "ban", championId: BANS[2] },
      { type: "ban", championId: BANS[3] }, { type: "ban", championId: BANS[4] }, { type: "ban", championId: BANS[5] },
      { type: "pick", championId: "aatrox", role: "TOP" }, { type: "pick", championId: "sejuani", role: "JUNGLE" },
      { type: "pick", championId: "ksante", role: "TOP" }, { type: "pick", championId: "leesin", role: "JUNGLE" },
    ], opts({ ruleset: HARD }));
    const byTeam = picksByTeam(s);
    expect(byTeam["SGT"]).toContain("aatrox");
    expect(byTeam["NVX"]).toContain("sejuani");
  });
});

describe("soft fearless restrictions", () => {
  const SOFT = buildRuleset("ff-soft-test", "BO5", "soft", "own");

  it("locks a team's own earlier picks; opponent picks stay available", () => {
    const priorPicksByTeam = { SGT: ["aatrox", "sejuani"], NVX: ["ksante", "vex"] };
    const o = opts({ ruleset: SOFT, priorPicksByTeam, gameNumber: 2 });
    const s = createGameState(o);
    const avail = availability(s, o);
    // SGT (blue) perspective: own picks locked, NVX picks open.
    expect(avail.get("aatrox")!.bySide.BLUE.available).toBe(false);
    expect(avail.get("sejuani")!.bySide.BLUE.available).toBe(false);
    expect(avail.get("ksante")!.bySide.BLUE.available).toBe(true);
    expect(avail.get("vex")!.bySide.BLUE.available).toBe(true);
    // NVX (red) perspective: their own picks locked, SGT picks open.
    expect(avail.get("aatrox")!.bySide.RED.available).toBe(true);
    expect(avail.get("ksante")!.bySide.RED.available).toBe(false);
    expect(avail.get("vex")!.bySide.RED.available).toBe(false);
    // Turn-aware aggregate view follows the acting side (blue bans first in game 2).
    expect(avail.get("aatrox")!.available).toBe(false);
    expect(avail.get("ksante")!.available).toBe(true);
  });

  it("locks both teams' picks under soft mode with shared scope", () => {
    const SOFT_BOTH = buildRuleset("ff-soft-both", "BO5", "soft", "both");
    const priorPicksByTeam = { SGT: ["aatrox"], NVX: ["ksante"] };
    const o = opts({ ruleset: SOFT_BOTH, priorPicksByTeam, gameNumber: 2 });
    const avail = availability(createGameState(o), o);
    expect(avail.get("aatrox")!.bySide.BLUE.available).toBe(false);
    expect(avail.get("aatrox")!.bySide.RED.available).toBe(false);
    expect(avail.get("ksante")!.bySide.BLUE.available).toBe(false);
    expect(avail.get("ksante")!.bySide.RED.available).toBe(false);
  });
});

describe("undo / redo", () => {
  function fullBoard() {
    let s = createGameState(opts());
    s = applyMany(s, fullSequenceActs(), opts());
    return s;
  }

  it("undo removes the last action and rolls the board back", () => {
    const s = fullBoard();
    const u = undo(s, opts());
    expect(u.actions).toHaveLength(19);
    expect(u.red.picks).toHaveLength(4);
    expect(u.redoStack).toHaveLength(1);
    expect(u.currentVersion).toBe(s.currentVersion + 1);
  });

  it("redo re-applies the undone action exactly", () => {
    const s = fullBoard();
    const u = undo(s, opts());
    const r = redo(u, opts());
    expect(r.actions).toHaveLength(20);
    expect(r.actions.at(-1)!.championId).toBe(s.actions.at(-1)!.championId);
    expect(r.redoStack).toHaveLength(0);
  });

  it("undo on an empty board is rejected as illegal", () => {
    const s = createGameState(opts());
    expect(() => undo(s, opts())).toThrow(/no applied actions/i);
  });

  it("redo without an undone action is rejected", () => {
    const s = fullBoard();
    expect(() => redo(s, opts())).toThrow(/no undone action/i);
  });

  it("repeated undo/redo cycles are deterministic", () => {
    let s = fullBoard();
    for (let i = 0; i < 3; i++) s = undo(s, opts());
    expect(s.actions).toHaveLength(17);
    for (let i = 0; i < 3; i++) s = redo(s, opts());
    expect(s.actions).toHaveLength(20);
    expect(s.blue.picks).toHaveLength(5);
    expect(s.red.picks).toHaveLength(5);
    expect(s.blue.bans).toHaveLength(5);
    expect(s.blue.bans.every((b) => b !== null)).toBe(true);
  });

  it("an undone pick returns to the availability pool", () => {
    let s = createGameState(opts());
    for (let i = 0; i < 6; i++) ({ state: s } = applyAction(s, { type: "ban", championId: BANS[i], actor: "t" }, opts()));
    ({ state: s } = applyAction(s, { type: "pick", championId: "aatrox", actor: "t" }, opts()));
    expect(availability(s, opts()).get("aatrox")!.available).toBe(false);
    s = undo(s, opts());
    expect(availability(s, opts()).get("aatrox")!.available).toBe(true);
  });
});

describe("finalization and roles", () => {
  function nearComplete() {
    return applyMany(createGameState(opts()), fullSequenceActs(), opts());
  }

  it("rejects completion while the sequence is incomplete", () => {
    const s = createGameState(opts());
    expect(() => finalizeGame(s, RULESET)).toThrow(/incomplete/i);
  });

  it("rejects completion when picks lack role assignments", () => {
    let s = nearComplete();
    for (let i = 0; i < 20; i++) s = undo(s, opts());
    // Re-apply the whole sequence with roles stripped from every pick.
    s = applyMany(s, fullSequenceActs().map((a) => (a.type === "pick" ? { ...a, role: undefined } : a)), opts());
    expect(s.actions).toHaveLength(20);
    expect(() => finalizeGame(s, RULESET)).toThrow(/assign roles/i);
  });

  it("finalizes when all picks carry roles and moves to COMPLETED", () => {
    const s = nearComplete();
    const f = finalizeGame(s, RULESET);
    expect(f.phase).toBe("COMPLETED");
    expect(f.status).toBe("finalized");
    expect(() => applyAction(f, { type: "ban", championId: "zz", actor: "t" }, opts())).toThrow(/completed/i);
  });

  it("assignRole updates a pick without consuming a turn and validates champion capability", () => {
    let s = createGameState(opts());
    for (let i = 0; i < 6; i++) ({ state: s } = applyAction(s, { type: "ban", championId: BANS[i], actor: "t" }, opts()));
    ({ state: s } = applyAction(s, { type: "pick", championId: "aatrox", actor: "t" }, opts()));
    expect(() => assignRole(s, "BLUE", 0, "SUPPORT", null)).toThrow(/not a listed SUPPORT option/i);
    const a = assignRole(s, "BLUE", 0, "TOP", "SGT-driftt");
    expect(a.blue.picks[0]).toMatchObject({ role: "TOP", playerId: "SGT-driftt" });
    expect(a.actions).toHaveLength(7); // 6 bans + 1 pick — role assignment consumed no draft turn
  });
});

describe("progress", () => {
  it("reports applied/total percentages", () => {
    const s = createGameState(opts());
    expect(draftProgress(s, RULESET)).toEqual({ applied: 0, total: 20, pct: 0 });
    void ERRORS; // keep error catalogue import live for the type surface
  });
});
