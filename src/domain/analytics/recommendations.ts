/**
 * Draft recommendation engine (PRD I5/I6).
 * Transparent 0–100 score with per-component breakdown. The score is a draft
 * suitability heuristic — never presented as a win probability. Every component
 * is computed from observed dataset statistics or explicitly marked coach input.
 */
import type {
  Champion,
  CompositionProfile,
  FearlessMode,
  Recommendation,
  ScoreBreakdown,
  Side,
} from "@/domain/types";
import { getChampion } from "@/fixtures/champions";
import { compositionProfile, compositionScore, fitScore } from "./composition";
import { pct100, wilsonInterval } from "./stats";
import type { ScoutingContext } from "./scouting-context";

/** Configurable, documented component weights. */
export const PICK_WEIGHTS = {
  compFit: 0.3,
  usage: 0.2,
  matchupSupport: 0.15,
  evidenceQuality: 0.15,
  sideContext: 0.1,
  flexibility: 0.1,
} as const;

export const BAN_WEIGHTS = {
  opponentPriority: 0.45,
  crossGameTrend: 0.15,
  sideThreat: 0.15,
  evidenceQuality: 0.15,
  availability: 0.1,
} as const;

export interface DraftAnalyticsInput {
  opponentCtx: ScoutingContext;
  ourCtx: ScoutingContext;
  ourSide: Side;
  gameNumber: number;
  fearlessMode: FearlessMode;
  /** Champions unavailable in this game (banned, picked, fearless-restricted). */
  unavailableChampionIds: Set<string>;
  /** Champions the opponent already holds in this game (avoid recommending duplicates). */
  opponentPicks: string[];
  ourPicks: string[];
  ourBans: string[];
  opponentBans: string[];
  /** Available champions eligible for recommendations. */
  pool: Champion[];
}

interface CandidateBase {
  champion: Champion;
  score: number;
  breakdown: ScoreBreakdown[];
  evidenceGameIds: string[];
  sampleSize: number;
  positive: string[];
  risks: string[];
}

function evidenceQualityScore(sampleSize: number): { raw: number; note: string } {
  if (sampleSize >= 20) return { raw: 100, note: "Strong sample (>=20 observations)" };
  if (sampleSize >= 10) return { raw: 75, note: "Moderate sample (10–19 observations)" };
  if (sampleSize >= 5) return { raw: 50, note: "Small sample (5–9 observations) — interpret with care" };
  return { raw: 20, note: "Minimal sample (<5) — weak evidence" };
}

function pickCandidates(input: DraftAnalyticsInput): CandidateBase[] {
  const { opponentCtx, ourCtx, ourPicks, pool } = input;
  const out: CandidateBase[] = [];
  for (const champ of pool) {
    const oppUsage = opponentCtx.usageFor(champ.id);
    const ourUsage = ourCtx.usageFor(champ.id);
    const breakdown: ScoreBreakdown[] = [];
    const positive: string[] = [];
    const risks: string[] = [];
    let evidenceGameIds = ourUsage?.gameIds ?? oppUsage?.gameIds ?? [];

    // 1. Composition fit against the comp we are building.
    const fit = fitScore(ourPicks, champ.id);
    breakdown.push({
      component: "Composition fit",
      weight: PICK_WEIGHTS.compFit,
      raw: fit,
      weighted: fit === null ? null : fit * PICK_WEIGHTS.compFit,
      note:
        fit === null
          ? "No known trait data — excluded from fit"
          : ourPicks.length === 0
            ? "First pick: fit measured against a neutral baseline"
            : "Lift on the weakest dimensions of the current comp",
    });

    // 2. Our historical usage.
    const usageRaw = ourUsage && ourUsage.eligibleGames > 0 ? (ourUsage.picks / ourUsage.eligibleGames) * 250 : null;
    breakdown.push({
      component: "Historical usage (our team)",
      weight: PICK_WEIGHTS.usage,
      raw: usageRaw,
      weighted: usageRaw === null ? null : Math.min(100, usageRaw) * PICK_WEIGHTS.usage,
      note: ourUsage ? `${ourUsage.picks} picks / ${ourUsage.eligibleGames} eligible games` : "No recorded usage — champion unfamiliar to dataset",
    });
    if (ourUsage && ourUsage.picks >= 3) positive.push(`Played ${ourUsage.picks} times by our roster`);

    // 3. Matchup support: observed uses vs this exact opponent.
    const vsOppGames = ourUsage?.gameIds.filter((id) => {
      const g = opponentCtx.games.find((gg) => gg.id === id);
      return g && (g.blueTeamId === input.opponentCtx.teamId || g.redTeamId === input.opponentCtx.teamId);
    }).length ?? 0;
    const matchupRaw = vsOppGames > 0 ? Math.min(100, 45 + vsOppGames * 18) : null;
    breakdown.push({
      component: "Matchup support vs opponent",
      weight: PICK_WEIGHTS.matchupSupport,
      raw: matchupRaw,
      weighted: matchupRaw === null ? null : matchupRaw * PICK_WEIGHTS.matchupSupport,
      note: vsOppGames > 0 ? `${vsOppGames} dataset uses vs ${input.opponentCtx.teamId}` : "No direct dataset uses vs this opponent",
    });

    // 4. Evidence quality from the underlying samples.
    const sampleSize = (ourUsage?.picks ?? 0) + (oppUsage?.bans ?? 0);
    const eq = evidenceQualityScore(sampleSize);
    breakdown.push({
      component: "Evidence quality",
      weight: PICK_WEIGHTS.evidenceQuality,
      raw: eq.raw,
      weighted: eq.raw * PICK_WEIGHTS.evidenceQuality,
      note: eq.note,
    });
    if (sampleSize < 5) risks.push("Small sample size behind this score");

    // 5. Side context: our pick rate on the current side.
    const sideStats = ourUsage ? ourUsage.bySide[input.ourSide] : null;
    const sideRaw = sideStats && sideStats.games > 0 ? (sideStats.picks / sideStats.games) * 200 : null;
    breakdown.push({
      component: "Side context",
      weight: PICK_WEIGHTS.sideContext,
      raw: sideRaw,
      weighted: sideRaw === null ? null : Math.min(100, sideRaw) * PICK_WEIGHTS.sideContext,
      note: sideStats ? `${sideStats.picks} picks on ${input.ourSide} in ${sideStats.games} games` : "No side-specific observations",
    });

    // 6. Flexibility (observed flex roles).
    const flexRaw = 40 + champ.flexRoles.length * 30;
    breakdown.push({
      component: "Flexibility",
      weight: PICK_WEIGHTS.flexibility,
      raw: flexRaw,
      weighted: flexRaw * PICK_WEIGHTS.flexibility,
      note: champ.flexRoles.length > 0 ? `Observed flex: ${[champ.primaryRole, ...champ.flexRoles].join("/")}` : `Single-role champion (${champ.primaryRole})`,
    });
    if (champ.flexRoles.length > 0) positive.push("Flex pick pressure across multiple roles");

    const weighted = breakdown.filter((b) => b.weighted !== null);
    const totalWeight = weighted.reduce((s, b) => s + b.weight, 0);
    const score = totalWeight > 0 ? pct100(weighted.reduce((s, b) => s + (b.weighted as number), 0) / totalWeight) : 0;
    if (oppUsage && oppUsage.bans >= 3) risks.push(`${input.opponentCtx.teamId} bans this champion often (${oppUsage.bans}) — ban pressure may follow`);
    out.push({ champion: champ, score, breakdown, evidenceGameIds, sampleSize, positive, risks });
  }
  return out;
}

function banCandidates(input: DraftAnalyticsInput): CandidateBase[] {
  const { opponentCtx, pool } = input;
  const out: CandidateBase[] = [];
  for (const champ of pool) {
    const oppUsage = opponentCtx.usageFor(champ.id);
    if (!oppUsage || (oppUsage.picks + oppUsage.bans === 0)) {
      // No opponent history at all: skip rather than fabricate a ban threat.
      continue;
    }
    const breakdown: ScoreBreakdown[] = [];
    const positive: string[] = [];
    const risks: string[] = [];

    // 1. Opponent priority (pick rate when available).
    const priorityRaw = oppUsage.eligibleGames > 0 ? (oppUsage.picks / oppUsage.eligibleGames) * 220 : null;
    breakdown.push({
      component: "Opponent priority",
      weight: BAN_WEIGHTS.opponentPriority,
      raw: priorityRaw,
      weighted: priorityRaw === null ? null : Math.min(100, priorityRaw) * BAN_WEIGHTS.opponentPriority,
      note: `${oppUsage.picks} picks / ${oppUsage.eligibleGames} eligible games (${Math.round((oppUsage.pickRate.value ?? 0) * 100)}%)`,
    });
    if ((oppUsage.pickRate.value ?? 0) >= 0.4) positive.push("Picked in 40%+ of the opponent's eligible games");
    if (oppUsage.firstRotationPicks >= Math.ceil(oppUsage.picks / 2)) positive.push("Usually secured inside the first rotation");

    // 2. Cross-game trend: does the champion appear more in later games of the opponent's series?
    const shift = opponentCtx.crossGameShift().filter((s) => s.gameNumber > 1);
    const laterPicks = shift.reduce((s, g) => s + (g.topChampions.find((c) => c.championId === champ.id)?.picks ?? 0), 0);
    const trendRaw = shift.length > 0 ? Math.min(100, laterPicks * 25) : null;
    breakdown.push({
      component: "Cross-game trend",
      weight: BAN_WEIGHTS.crossGameTrend,
      raw: trendRaw,
      weighted: trendRaw === null ? null : trendRaw * BAN_WEIGHTS.crossGameTrend,
      note: shift.length > 0 ? `${laterPicks} picks across games 2+` : "No multi-game series in filter",
    });

    // 3. Side threat: opponent win rate with the champion.
    const threatRaw = oppUsage.winRate ? (oppUsage.winRate.value ?? 0) * 100 : null;
    breakdown.push({
      component: "Side threat (win rate when played)",
      weight: BAN_WEIGHTS.sideThreat,
      raw: threatRaw,
      weighted: threatRaw === null ? null : threatRaw * BAN_WEIGHTS.sideThreat,
      note: oppUsage.winRate ? `${oppUsage.wins}/${oppUsage.picks} wins when played` : "Fewer than 3 plays — win rate withheld",
    });
    if (threatRaw !== null && threatRaw >= 60) positive.push("Opponent wins 60%+ of games with it");

    // 4. Evidence quality.
    const eq = evidenceQualityScore(oppUsage.picks + oppUsage.bans);
    breakdown.push({
      component: "Evidence quality",
      weight: BAN_WEIGHTS.evidenceQuality,
      raw: eq.raw,
      weighted: eq.raw * BAN_WEIGHTS.evidenceQuality,
      note: eq.note,
    });
    if (oppUsage.picks + oppUsage.bans < 5) risks.push("Limited observations of this champion against the opponent");

    // 5. Availability: still open in this draft (not banned/picked yet by us).
    const availRaw = input.unavailableChampionIds.has(champ.id) ? 0 : 100;
    breakdown.push({
      component: "Availability",
      weight: BAN_WEIGHTS.availability,
      raw: availRaw,
      weighted: availRaw * BAN_WEIGHTS.availability,
      note: availRaw === 100 ? "Still available in this game" : "Already unavailable in this game",
    });

    const weighted = breakdown.filter((b) => b.weighted !== null);
    const totalWeight = weighted.reduce((s, b) => s + b.weight, 0);
    const score = totalWeight > 0 ? pct100(weighted.reduce((s, b) => s + (b.weighted as number), 0) / totalWeight) : 0;
    risks.push("A ban costs our side a slot — weigh against securing our own priority");
    out.push({
      champion: champ,
      score,
      breakdown,
      evidenceGameIds: oppUsage.gameIds,
      sampleSize: oppUsage.picks + oppUsage.bans,
      positive,
      risks,
    });
  }
  return out;
}

/** Two alternative full compositions built greedily from the available pool. */
export function alternativeCompositions(input: DraftAnalyticsInput): CompositionProfile[] {
  const { ourCtx, pool } = input;
  const usageScore = (id: string) => {
    const u = ourCtx.usageFor(id);
    const base = u ? (u.picks / Math.max(1, u.eligibleGames)) * 200 : 0;
    return Math.min(100, base);
  };
  const out: CompositionProfile[] = [];
  const used = new Set<string>([...input.ourPicks, ...input.opponentPicks, ...input.ourBans, ...input.opponentBans]);
  const available = pool.filter((c) => !used.has(c.id));

  for (let variant = 0; variant < 2; variant++) {
    const comp: string[] = [];
    const localUsed = new Set(used);
    for (const role of ["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"] as const) {
      const candidates = available.filter((c) => !localUsed.has(c.id) && [c.primaryRole, ...c.flexRoles].includes(role));
      if (candidates.length === 0) continue;
      // Variant 0 maximises raw comp score; variant 1 prefers engage/objectiveControl profiles.
      const scored = candidates.map((c) => {
        const profilePart = variant === 0 ? compositionScore(compositionProfile([c.id])) ?? 0 : (c.traits.engage ?? 0) * 0.6 + (c.traits.objectiveControl ?? 0) * 0.4;
        return { c, v: usageScore(c.id) * 0.5 + profilePart * 0.5 };
      });
      scored.sort((a, b) => b.v - a.v);
      comp.push(scored[0].c.id);
      localUsed.add(scored[0].c.id);
    }
    if (comp.length === 5) {
      const profile = compositionProfile(comp);
      profile.score = compositionScore(profile);
      out.push(profile);
    }
  }
  return out;
}

export interface DraftAnalyticsOutput {
  picks: Recommendation[];
  bans: Recommendation[];
  alternatives: CompositionProfile[];
}

function evidenceFor(
  ctx: ScoutingContext,
  championId: string,
  definition: string,
  numerator: number,
  denominator: number,
  gameIds: string[],
): ReturnType<ScoutingContext["ledger"]["addStat"]> {
  return ctx.ledger.addStat({
    provider: "fixture",
    sourceId: `fixture:${ctx.teamId}`,
    gameIds,
    tournamentId: ctx.filters.tournamentId ?? null,
    patch: ctx.filters.patch ?? null,
    stat: { definition, numerator, denominator, value: denominator > 0 ? numerator / denominator : null, confidence: denominator > 0 ? wilsonInterval(numerator, denominator) : null, sampleSize: denominator },
  });
}

export function recommend(input: DraftAnalyticsInput): DraftAnalyticsOutput {
  const pickPool = input.pool.filter((c) => !input.unavailableChampionIds.has(c.id) && !input.opponentPicks.includes(c.id) && !input.ourPicks.includes(c.id));
  const banPool = input.pool.filter((c) => !input.unavailableChampionIds.has(c.id));

  const picks = pickCandidates({ ...input, pool: pickPool })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((cand): Recommendation => {
      const champ = cand.champion;
      const ourUsage = input.ourCtx.usageFor(champ.id);
      const evidence = ourUsage
        ? [
            evidenceFor(
              input.ourCtx,
              champ.id,
              `pick_rate (${champ.displayName}, our team)`,
              ourUsage.picks,
              ourUsage.eligibleGames,
              ourUsage.gameIds,
            ),
          ]
        : [];
      const ci = ourUsage && ourUsage.picks >= 3 ? wilsonInterval(ourUsage.wins, ourUsage.picks) : null;
      const topComponents = [...cand.breakdown]
        .filter((b) => b.weighted !== null)
        .sort((a, b) => (b.weighted as number) - (a.weighted as number))
        .slice(0, 2)
        .map((b) => `${b.component} (${b.note})`);
      return {
        championId: champ.id,
        candidateName: champ.displayName,
        recommendationType: "pick",
        score: cand.score,
        scoreBreakdown: cand.breakdown,
        explanation: `Suggested as a ${champ.primaryRole} option for ${input.gameNumber === 1 ? "Game 1" : `Game ${input.gameNumber}`}. Strongest drivers: ${topComponents.join("; ") || "no weighted components — insufficient data"}. This is a draft-suitability score, not a win probability.`,
        supportingEvidence: evidence,
        sampleSize: cand.sampleSize,
        confidenceInterval: ci,
        patchContext: input.ourCtx.filters.patch ?? ([...new Set(input.ourCtx.eligibleGames.map((g) => g.patch))].join(", ") || "all patches"),
        positiveFactors: cand.positive,
        riskFactors: cand.risks,
        alternatives: pickPool
          .filter((c) => c.primaryRole === champ.primaryRole && c.id !== champ.id)
          .slice(0, 2)
          .map((c) => c.displayName),
        dataProvenance: "fixture",
      };
    });

  const bans = banCandidates({ ...input, pool: banPool })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((cand): Recommendation => {
      const champ = cand.champion;
      const oppUsage = input.opponentCtx.usageFor(champ.id)!;
      const evidence = [
        evidenceFor(
          input.opponentCtx,
          champ.id,
          `pick_rate (${champ.displayName}, ${input.opponentCtx.teamId})`,
          oppUsage.picks,
          oppUsage.eligibleGames,
          oppUsage.gameIds,
        ),
      ];
      const ci = oppUsage.pickRate.confidence ?? null;
      const topComponents = [...cand.breakdown]
        .filter((b) => b.weighted !== null)
        .sort((a, b) => (b.weighted as number) - (a.weighted as number))
        .slice(0, 2)
        .map((b) => `${b.component} (${b.note})`);
      return {
        championId: champ.id,
        candidateName: champ.displayName,
        recommendationType: "ban",
        score: cand.score,
        scoreBreakdown: cand.breakdown,
        explanation: `Ban candidate against ${input.opponentCtx.teamId}: ${topComponents.join("; ") || "insufficient data"}. Deny value derives from observed opponent usage only.`,
        supportingEvidence: evidence,
        sampleSize: cand.sampleSize,
        confidenceInterval: ci,
        patchContext: input.opponentCtx.filters.patch ?? ([...new Set(input.opponentCtx.eligibleGames.map((g) => g.patch))].join(", ") || "all patches"),
        positiveFactors: cand.positive,
        riskFactors: cand.risks,
        alternatives: banPool
          .filter((c) => c.id !== champ.id)
          .slice(0, 2)
          .map((c) => getChampion(c.id)?.displayName ?? c.id),
        dataProvenance: "fixture",
      };
    });

  return { picks, bans, alternatives: alternativeCompositions(input) };
}
