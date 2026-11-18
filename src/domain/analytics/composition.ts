/**
 * Composition intelligence (PRD I7).
 * Champion trait vectors are coach-curated metadata; unknown dimensions stay null
 * and are excluded from scores rather than invented.
 */
import type { Champion, CompositionProfile, Role } from "@/domain/types";
import { ALL_ROLES } from "@/domain/types";
import { getChampion, TRAIT_DIMENSIONS } from "@/fixtures/champions";
import { mean, pct100 } from "./stats";

export function compositionProfile(championIds: string[]): CompositionProfile {
  const champions = championIds.map((id) => getChampion(id)).filter((c): c is Champion => Boolean(c));
  const dimensions: Record<string, number | null> = {};
  for (const dim of TRAIT_DIMENSIONS) {
    const values = champions.map((c) => c.traits[dim]).filter((v): v is number => v !== null);
    dimensions[dim] = mean(values) === null ? null : pct100(mean(values)!);
  }

  const physKnown = champions.filter((c) => c.traits.physicalDamage !== null);
  const magicKnown = champions.filter((c) => c.traits.magicDamage !== null);
  const physMean = mean(physKnown.map((c) => c.traits.physicalDamage as number));
  const magicMean = mean(magicKnown.map((c) => c.traits.magicDamage as number));
  let physicalShare: number | null = null;
  let magicShare: number | null = null;
  if (physMean !== null && magicMean !== null && physMean + magicMean > 0) {
    const total = physMean + magicMean;
    physicalShare = physMean / total;
    magicShare = magicMean / total;
  }

  const roleCoverage: Role[] = [];
  for (const c of champions) {
    if (!roleCoverage.includes(c.primaryRole)) roleCoverage.push(c.primaryRole);
  }
  const missingRoles = ALL_ROLES.filter((r) => !roleCoverage.includes(r));

  return { championIds, dimensions, physicalShare, magicShare, roleCoverage, missingRoles, score: null };
}

/**
 * Teamfight-plan coverage score: how well the composition covers the ten
 * tactical dimensions. Unknown dimensions are excluded from both sum and count.
 */
export function compositionScore(profile: CompositionProfile): number | null {
  const values = Object.values(profile.dimensions).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return pct100(values.reduce((s, v) => s + v, 0) / values.length);
}

/**
 * Fit of a candidate addition to a partial composition: how much the champion
 * lifts the lowest-covered dimensions of the comp being built.
 */
export function fitScore(partialChampionIds: string[], candidateChampionId: string): number | null {
  const partial = compositionProfile(partialChampionIds);
  const candidate = getChampion(candidateChampionId);
  if (!candidate) return null;
  const withCandidate = compositionProfile([...partialChampionIds, candidateChampionId]);
  const gapsKnown = Object.entries(partial.dimensions).filter(([, v]) => v !== null);
  if (gapsKnown.length === 0) return null;
  // Weighted lift on the weakest dimensions of the current comp.
  const weakest = [...gapsKnown].sort((a, b) => (a[1] as number) - (b[1] as number)).slice(0, 3);
  let lift = 0;
  for (const [dim, v] of weakest) {
    const after = withCandidate.dimensions[dim];
    if (after !== null) lift += (after - (v as number)) * (dim === "frontline" || dim === "crowdControl" ? 1.2 : 1);
  }
  const roleBonus = partial.missingRoles.includes(candidate.primaryRole) ? 12 : 0;
  return pct100(Math.max(0, lift / weakest.length + 45 + roleBonus));
}
