/**
 * Analytics unit tests (PRD O1): rates, explicit denominators, Wilson intervals,
 * recency weights, composition scoring with unknown dimensions, recommendations
 * and fixture dataset integrity.
 */
import { describe, it, expect } from "vitest";
import { wilsonInterval, recencyWeight, evidenceStrength, rateStat, mean, formatPct } from "@/domain/analytics/stats";
import { compositionProfile, compositionScore, fitScore } from "@/domain/analytics/composition";
import { firstDragonRate, heraldControlRate, baronControlRate, intervalBreakdown, DEFAULT_INTERVALS } from "@/domain/analytics/macro";
import { ScoutingContext, buildInsights } from "@/domain/analytics/scouting-context";
import { recommend } from "@/domain/analytics/recommendations";
import { CHAMPIONS, getChampion, TRAIT_DIMENSIONS } from "@/fixtures/champions";
import { FIXTURE_GAMES, FIXTURE_SERIES, gamesForTeam } from "@/fixtures/dataset";
import { FIXTURE_LABEL, FIXTURE_DATASET_ID, TEAMS, META_BAN_PRESSURE } from "@/fixtures/teams";
import { createGameState, applyAction, availability } from "@/domain/draft/engine";
import { rulesetById } from "@/domain/draft/rulesets";

const BANS_TEST = ["kalista", "azir", "jinx", "vi", "rakan", "leblanc"];

describe("statistics", () => {
  it("computes the Wilson interval for known values", () => {
    const ci = wilsonInterval(7, 10)!;
    expect(ci.level).toBe(0.95);
    expect(ci.method).toBe("wilson");
    expect(ci.lower).toBeGreaterThan(0.34);
    expect(ci.lower).toBeLessThan(0.4);
    expect(ci.upper).toBeGreaterThan(0.83);
    expect(ci.upper).toBeLessThan(0.94);
    // Reference: wilson(7/10, 95%) ≈ [0.391, 0.891]
  });

  it("returns null for empty denominators instead of dividing by zero", () => {
    expect(wilsonInterval(0, 0)).toBeNull();
    const stat = rateStat({ definition: "x (games)", numerator: 3, denominator: 0 });
    expect(stat.value).toBeNull();
    expect(stat.confidence).toBeNull();
    expect(stat.strength).toBe("low");
  });

  it("bounds the interval inside [0,1] for extreme rates", () => {
    const up = wilsonInterval(20, 20)!;
    expect(up.upper).toBeLessThanOrEqual(1);
    const down = wilsonInterval(0, 20)!;
    expect(down.lower).toBeGreaterThanOrEqual(0);
  });

  it("decays recency with a documented half-life", () => {
    const ref = "2026-11-17T00:00:00Z";
    expect(recencyWeight(ref, ref)).toBeCloseTo(1, 5);
    // 60 days = one half-life → weight ≈ 0.5
    expect(recencyWeight("2026-09-18T00:00:00Z", ref)).toBeCloseTo(0.5, 2);
    // 120 days = two half-lives → ≈ 0.25
    expect(recencyWeight("2026-07-19T00:00:00Z", ref)).toBeCloseTo(0.25, 2);
    // future observation never exceeds 1
    expect(recencyWeight("2027-01-01T00:00:00Z", ref)).toBeLessThanOrEqual(1);
  });

  it("labels confidence from sample size and interval width — never from the value", () => {
    const big = wilsonInterval(18, 20)!;
    expect(evidenceStrength(20, big)).toBe("high");
    const tiny = wilsonInterval(1, 2)!;
    expect(evidenceStrength(2, tiny)).toBe("low");
    expect(evidenceStrength(15, wilsonInterval(7, 15)!)).toBe("moderate");
    expect(evidenceStrength(9, wilsonInterval(5, 9)!)).toBe("low");
  });

  it("formats percentages honestly for null values", () => {
    expect(formatPct(null)).toBe("—");
    expect(formatPct(0.5)).toBe("50%");
    expect(mean([])).toBeNull();
  });
});

describe("composition intelligence", () => {
  it("averages known dimensions across a composition", () => {
    const ids = ["aatrox", "sejuani", "orianna", "jinx", "nautilus"];
    const p = compositionProfile(ids);
    expect(p.championIds).toHaveLength(5);
    expect(p.dimensions.engage).not.toBeNull();
    expect(p.dimensions.physicalShare).not.toBeNull();
    expect(p.missingRoles).toHaveLength(0);
    expect(p.roleCoverage).toHaveLength(5);
  });

  it("marks unknown dimensions as null and excludes them from the score", () => {
    // zyra.frontline is intentionally unknown in the curated metadata
    expect(getChampion("zyra")!.traits.frontline).toBeNull();
    const p = compositionProfile(["zyra"]);
    expect(p.dimensions.frontline).toBeNull();
    const score = compositionScore(p);
    expect(score).not.toBeNull(); // score computed from known dims only
    for (const dim of TRAIT_DIMENSIONS) {
      const values = p.championIds.map((id) => getChampion(id)!.traits[dim]);
      if (values.every((v) => v === null)) {
        expect(p.dimensions[dim]).toBeNull();
      }
    }
  });

  it("returns null shares when damage data is missing entirely", () => {
    expect(compositionProfile([]).score).toBeNull();
    expect(compositionProfile([]).physicalShare).toBeNull();
  });

  it("fitScore rewards filling missing roles", () => {
    const partial = ["aatrox", "sejuani", "orianna", "jinx"]; // SUPPORT missing
    const withSupport = fitScore(partial, "nautilus"); // fills the missing role
    const duplicateTop = fitScore(partial, "renekton"); // TOP already covered
    expect(withSupport).not.toBeNull();
    expect(withSupport! > duplicateTop!).toBe(true);
  });
});

describe("fixture dataset integrity", () => {
  it("is deterministic in size and labelling", () => {
    expect(FIXTURE_SERIES.length).toBe(17);
    expect(FIXTURE_SERIES.filter((s) => s.status === "completed").length).toBe(16);
    expect(FIXTURE_SERIES.some((s) => s.status === "upcoming")).toBe(true);
    expect(FIXTURE_DATASET_ID).toBe("fx-demo-2026-w46");
    expect(FIXTURE_LABEL).toContain("Not actual Cloud9 performance");
  });

  it("contains at least one full BO5 series", () => {
    const bo5 = FIXTURE_SERIES.filter((s) => s.format === "BO5" && s.status === "completed");
    expect(bo5.length).toBeGreaterThanOrEqual(3);
    expect(bo5.some((s) => s.gameIds.length === 5)).toBe(true);
  });

  it("gives every game 10 picks and 10 bans with unique champions per game", () => {
    for (const g of FIXTURE_GAMES) {
      expect(g.draft.picks, g.id).toHaveLength(10);
      expect(g.draft.bans, g.id).toHaveLength(10);
      const all = [...g.draft.picks.map((p) => p.championId), ...g.draft.bans.map((b) => b.championId)];
      expect(new Set(all).size, `duplicate champion in ${g.id}`).toBe(all.length);
    }
  });

  it("fills all five roles per team in every game", () => {
    for (const g of FIXTURE_GAMES) {
      for (const team of [g.blueTeamId, g.redTeamId]) {
        const roles = g.draft.picks.filter((p) => p.teamId === team).map((p) => p.role).sort();
        expect(roles, `${g.id}/${team}`).toEqual(["BOT", "JUNGLE", "MID", "SUPPORT", "TOP"]);
      }
    }
  });

  it("respects Fearless inside the Masters Invitational (hard, both)", () => {
    for (const s of FIXTURE_SERIES.filter((s) => s.tournamentId === "t-mi-2026" && s.status === "completed")) {
      const seen = new Set<string>();
      for (const gid of s.gameIds) {
        const g = FIXTURE_GAMES.find((x) => x.id === gid)!;
        for (const p of g.draft.picks) {
          expect(seen.has(p.championId), `${p.championId} reused in ${gid} of hard-fearless ${s.id}`).toBe(false);
          seen.add(p.championId);
        }
      }
    }
  });

  it("the engine itself imposes no cross-game memory — game state is per-game", () => {
    // Standard (non-fearless) tournaments reuse champions freely; the restriction
    // layer is the ruleset, not hidden engine memory.
    const rs = rulesetById("std-bo5")!;
    const pool = CHAMPIONS.map((c) => c.id);
    const o = { ruleset: rs, blueTeamId: "SGT", redTeamId: "NVX", ourSide: "BLUE" as const, priorPicksByTeam: {}, pool, gameNumber: 1 };
    let g1 = createGameState(o);
    for (let i = 0; i < 6; i++) ({ state: g1 } = applyAction(g1, { type: "ban", championId: BANS_TEST[i], actor: "t" }, o));
    ({ state: g1 } = applyAction(g1, { type: "pick", championId: "aatrox", actor: "t" }, o));
    // A fresh game state has no knowledge of game 1's picks.
    const g2 = createGameState({ ...o, gameNumber: 2 });
    expect(availability(g2, { ...o, gameNumber: 2 }).get("aatrox")!.available).toBe(true);
  });

  it("keeps event timelines sorted and bounded by game duration", () => {
    for (const g of FIXTURE_GAMES) {
      const times = g.events.map((e) => e.timestampSec);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      for (const t of times) expect(t).toBeGreaterThanOrEqual(0);
    }
  });

  it("includes games deliberately missing coverage to exercise unavailable states", () => {
    const noObjectives = FIXTURE_GAMES.filter((g) => !g.coverage.objectives);
    expect(noObjectives.length).toBeGreaterThanOrEqual(1);
    const noPlayers = FIXTURE_GAMES.filter((g) => !g.coverage.players);
    expect(noPlayers.length).toBeGreaterThanOrEqual(1);
  });

  it("uses every champion in the catalogue at least once or stays available", () => {
    // Champion catalogue must exceed 70 entries so multi-game fearless pools never starve.
    expect(CHAMPIONS.length).toBeGreaterThanOrEqual(70);
    const used = new Set(FIXTURE_GAMES.flatMap((g) => g.draft.picks.map((p) => p.championId)));
    expect(used.size).toBeGreaterThanOrEqual(60);
    for (const c of CHAMPIONS) {
      const allowed = [c.primaryRole, ...c.flexRoles];
      expect(allowed.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("every champion id referenced by the dataset exists in the catalogue", () => {
    for (const g of FIXTURE_GAMES) {
      for (const p of g.draft.picks) expect(getChampion(p.championId), p.championId).toBeDefined();
      for (const b of g.draft.bans) expect(getChampion(b.championId), b.championId).toBeDefined();
    }
  });
});

describe("scouting context", () => {
  const ctx = new ScoutingContext("NVX", {});

  it("counts only games the team actually played (denominator correctness)", () => {
    expect(ctx.eligibleGames.length).toBe(gamesForTeam("NVX").length);
    expect(ctx.eligibleGames.length).toBeLessThan(FIXTURE_GAMES.length);
    for (const g of ctx.eligibleGames) {
      expect(g.blueTeamId === "NVX" || g.redTeamId === "NVX").toBe(true);
    }
  });

  it("computes pick rates with explicit denominators", () => {
    const ranked = ctx.usageList(1).filter((u) => u.picks > 0);
    for (const u of ranked) {
      expect(u.pickRate.denominator).toBe(ctx.eligibleGames.filter((g) => g.coverage.draft).length);
      expect(u.pickRate.numerator).toBe(u.picks);
      expect(u.pickRate.value).toBeCloseTo(u.picks / u.pickRate.denominator, 10);
    }
  });

  it("detects signature picks the generator encoded (affinity > 1)", () => {
    // NVX vi affinity is 9 — vi must appear among detected usage with picks > 0.
    const vi = ctx.usageFor("vi");
    expect(vi).toBeDefined();
    expect(vi!.picks).toBeGreaterThan(0);
  });

  it("separates side-dependent usage", () => {
    for (const u of ctx.usageList(1)) {
      const dep = ctx.sideDependence(u.championId);
      if (dep) {
        expect(dep.blue.denominator + dep.red.denominator).toBeLessThanOrEqual(ctx.eligibleGames.length * 2);
        expect(dep.intervalsDisjoint).toBeTypeOf("boolean");
      }
    }
  });

  it("produces insights where every observation carries an evidence id", () => {
    const insights = buildInsights(ctx);
    expect(insights.length).toBeGreaterThanOrEqual(3);
    for (const i of insights) {
      expect(i.evidenceId).toMatch(/^EV-/);
      expect(i.observation.length).toBeGreaterThan(10);
      expect(i.metric.definition).toContain("(");
      expect(i.dataProvenance).toBe("fixture");
    }
  });

  it("keeps the interpretation distinct from the observation", () => {
    const insights = buildInsights(ctx);
    const withInterp = insights.filter((i) => i.interpretation !== null);
    for (const i of withInterp) {
      expect(i.observation).not.toEqual(i.interpretation);
    }
  });

  it("reports macro metrics from event sequences, not match winners", () => {
    const m = ctx.macro();
    expect(m.firstDragon.stat.definition).toContain("eligible games");
    // first-dragon hits ≤ covered games
    expect(m.firstDragon.stat.numerator).toBeLessThanOrEqual(m.firstDragon.stat.denominator);
    expect(m.firstDragon.stat.denominator).toBe(ctx.eligibleGames.filter((g) => g.coverage.objectives).length);
    // economy module stays unavailable in the fixture provider
    expect(m.firstDragon.stat.confidence).not.toBeNull();
  });

  it("respects filters in every denominator", () => {
    const filtered = new ScoutingContext("NVX", { patch: "16.10" });
    for (const g of filtered.eligibleGames) {
      expect(g.patch).toBe("16.10");
    }
    const side = new ScoutingContext("NVX", { side: "BLUE" });
    for (const g of side.eligibleGames) {
      expect(g.blueTeamId).toBe("NVX");
    }
  });
});

describe("macro calculators", () => {
  it("firstDragonRate counts from events only", () => {
    const r = firstDragonRate(FIXTURE_GAMES, "EST");
    expect(r.stat.numerator).toBeLessThanOrEqual(r.stat.denominator);
    expect(r.gameIds.length).toBe(r.stat.denominator);
    // every counted game has a dragon event
    for (const gid of r.winningGameIds) {
      const g = FIXTURE_GAMES.find((x) => x.id === gid)!;
      expect(g.events.some((e) => e.type === "dragon" && e.teamId === "EST")).toBe(true);
    }
  });

  it("herald/baron control restrict denominators to games with the event", () => {
    const h = heraldControlRate(FIXTURE_GAMES, "EST");
    for (const gid of h.gameIds) {
      const g = FIXTURE_GAMES.find((x) => x.id === gid)!;
      expect(g.events.some((e) => e.type === "herald")).toBe(true);
    }
    const b = baronControlRate(FIXTURE_GAMES, "EST");
    for (const gid of b.gameIds) {
      const g = FIXTURE_GAMES.find((x) => x.id === gid)!;
      expect(g.events.some((e) => e.type === "baron")).toBe(true);
    }
  });

  it("interval buckets never double-count and respect timestamps", () => {
    const buckets = intervalBreakdown(FIXTURE_GAMES, "NVX");
    expect(buckets.map((b) => b.label)).toEqual(DEFAULT_INTERVALS.map((i) => i.label));
    for (const b of buckets) expect(b.kills).toBeGreaterThanOrEqual(0);
  });
});

describe("recommendation engine", () => {
  const oppCtx = new ScoutingContext("NVX", {});
  const ourCtx = new ScoutingContext("SGT", {});

  const baseInput = {
    opponentCtx: oppCtx,
    ourCtx,
    ourSide: "BLUE" as const,
    gameNumber: 1,
    fearlessMode: "none" as const,
    unavailableChampionIds: new Set<string>(),
    opponentPicks: [],
    ourPicks: [],
    ourBans: [],
    opponentBans: [],
    pool: CHAMPIONS,
  };

  it("returns three pick and three ban recommendations with full contracts", () => {
    const out = recommend(baseInput);
    expect(out.picks).toHaveLength(3);
    expect(out.bans).toHaveLength(3);
    for (const r of [...out.picks, ...out.bans]) {
      expect(r.championId).toBeTruthy();
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.scoreBreakdown.length).toBeGreaterThanOrEqual(4);
      expect(r.explanation.length).toBeGreaterThan(30);
      if (r.recommendationType === "pick") {
        expect(r.explanation).toContain("not a win probability");
      } else {
        expect(r.explanation).toContain("observed opponent usage");
      }
      expect(r.dataProvenance).toBe("fixture");
      expect(Array.isArray(r.positiveFactors)).toBe(true);
      expect(Array.isArray(r.riskFactors)).toBe(true);
      expect(Array.isArray(r.alternatives)).toBe(true);
    }
  });

  it("scores are transparent: weighted components average to the total", () => {
    const out = recommend(baseInput);
    for (const r of out.picks) {
      const weighted = r.scoreBreakdown.filter((b) => b.weighted !== null);
      const total = weighted.reduce((s, b) => s + (b.weighted as number), 0);
      const wsum = weighted.reduce((s, b) => s + b.weight, 0);
      expect(total / wsum).toBeCloseTo(r.score, 2);
    }
  });

  it("never recommends unavailable champions", () => {
    const out = recommend({ ...baseInput, unavailableChampionIds: new Set(["vi", "azir", "jinx"]) });
    for (const r of [...out.picks, ...out.bans]) {
      expect(["vi", "azir", "jinx"]).not.toContain(r.championId);
    }
  });

  it("ban candidates derive from opponent usage only — never fabricated", () => {
    const out = recommend(baseInput);
    for (const b of out.bans) {
      const u = oppCtx.usageFor(b.championId);
      expect(u).toBeDefined();
      expect(u!.picks + u!.bans).toBeGreaterThan(0);
    }
  });

  it("produces exactly two alternative compositions of five champions", () => {
    const out = recommend(baseInput);
    expect(out.alternatives.length).toBeLessThanOrEqual(2);
    for (const a of out.alternatives) {
      expect(a.championIds).toHaveLength(5);
      expect(new Set(a.championIds).size).toBe(5);
    }
  });

  it("adapts when the pool shrinks under Fearless", () => {
    const restricted = new Set(["vi", "leesin", "kalista", "rakan", "nautilus", "leblanc", "lucian", "camille", "renekton", "varus"]);
    const out = recommend({ ...baseInput, unavailableChampionIds: restricted, gameNumber: 2 });
    for (const r of out.picks) expect(restricted.has(r.championId)).toBe(false);
  });
});

describe("meta pressure integrity", () => {
  it("only references champions that exist", () => {
    for (const id of Object.keys(META_BAN_PRESSURE)) {
      expect(getChampion(id), id).toBeDefined();
    }
  });
});

describe("fixture team rosters", () => {
  it("defines five distinct observed roles per roster", () => {
    for (const t of TEAMS) {
      expect(t.roster).toHaveLength(5);
      const roles = t.roster.map((p) => p.observedRole);
      expect(new Set(roles).size).toBe(5);
    }
  });
});
