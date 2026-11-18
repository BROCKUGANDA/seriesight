/**
 * Draft rulesets (PRD D5). Every ruleset declares its full action sequence —
 * the engine never assumes a fixed order without an explicit configuration.
 *
 * Standard tournament sequence used across formats:
 *   BAN1: B R B R B R (6) · PICK1: B R R B (4) · BAN2: R B R B (4) · PICK2: B R R B B R (6)
 * = 10 bans + 10 picks = 20 ordered slots per game.
 */
import type { DraftPhase, DraftRuleset, DraftRulesetAction, FearlessMode, RestrictionScope, SeriesFormat } from "@/domain/types";

type Slot = { type: "ban" | "pick"; side: "BLUE" | "RED"; phase: DraftPhase };

export const STANDARD_SLOTS: Slot[] = [
  { type: "ban", side: "BLUE", phase: "BAN_PHASE_1" },
  { type: "ban", side: "RED", phase: "BAN_PHASE_1" },
  { type: "ban", side: "BLUE", phase: "BAN_PHASE_1" },
  { type: "ban", side: "RED", phase: "BAN_PHASE_1" },
  { type: "ban", side: "BLUE", phase: "BAN_PHASE_1" },
  { type: "ban", side: "RED", phase: "BAN_PHASE_1" },
  { type: "pick", side: "BLUE", phase: "PICK_PHASE_1" },
  { type: "pick", side: "RED", phase: "PICK_PHASE_1" },
  { type: "pick", side: "RED", phase: "PICK_PHASE_1" },
  { type: "pick", side: "BLUE", phase: "PICK_PHASE_1" },
  { type: "ban", side: "RED", phase: "BAN_PHASE_2" },
  { type: "ban", side: "BLUE", phase: "BAN_PHASE_2" },
  { type: "ban", side: "RED", phase: "BAN_PHASE_2" },
  { type: "ban", side: "BLUE", phase: "BAN_PHASE_2" },
  { type: "pick", side: "BLUE", phase: "PICK_PHASE_2" },
  { type: "pick", side: "RED", phase: "PICK_PHASE_2" },
  { type: "pick", side: "RED", phase: "PICK_PHASE_2" },
  { type: "pick", side: "BLUE", phase: "PICK_PHASE_2" },
  { type: "pick", side: "BLUE", phase: "PICK_PHASE_2" },
  { type: "pick", side: "RED", phase: "PICK_PHASE_2" },
];

export const STANDARD_SEQUENCE: DraftRulesetAction[] = STANDARD_SLOTS.map((s, i) => ({ order: i + 1, ...s }));

const FEARLESS_LABEL: Record<FearlessMode, string> = {
  none: "Standard draft — champions re-available every game",
  hard: "Hard/Full Fearless — champions picked by either team are locked for both teams in later games",
  soft: "Soft Fearless — a team cannot re-pick its own earlier picks; opponent picks stay available",
};

export function buildRuleset(
  id: string,
  format: SeriesFormat,
  mode: FearlessMode,
  scope: RestrictionScope,
  sequence: DraftRulesetAction[] = STANDARD_SEQUENCE,
): DraftRuleset {
  return {
    id,
    name: `${mode === "none" ? "Standard" : mode === "hard" ? "Hard Fearless" : "Soft Fearless"} · ${format}`,
    description: `${FEARLESS_LABEL[mode]}${mode !== "none" ? ` (scope: ${scope === "both" ? "both teams" : "own picks only"})` : ""}. Tournament sequence: 10 bans / 10 picks.`,
    format,
    mode,
    restrictionsScope: scope,
    restrictPicks: true,
    restrictBans: false,
    actionSequence: sequence,
  };
}

export const RULESETS: DraftRuleset[] = [
  buildRuleset("std-bo1", "BO1", "none", "own"),
  buildRuleset("std-bo3", "BO3", "none", "own"),
  buildRuleset("std-bo5", "BO5", "none", "own"),
  buildRuleset("ff-soft-bo3", "BO3", "soft", "own"),
  buildRuleset("ff-soft-bo5", "BO5", "soft", "own"),
  buildRuleset("ff-hard-bo3", "BO3", "hard", "both"),
  buildRuleset("ff-hard-bo5", "BO5", "hard", "both"),
  buildRuleset("ff-hard-bo5-own", "BO5", "hard", "own"),
];

export const RULESET_INDEX = new Map(RULESETS.map((r) => [r.id, r]));

export function rulesetById(id: string): DraftRuleset | undefined {
  return RULESET_INDEX.get(id);
}

export function gamesForFormat(format: SeriesFormat): number {
  return format === "BO1" ? 1 : format === "BO3" ? 3 : 5;
}

/** Wins needed to close the series. */
export function winsNeeded(format: SeriesFormat): number {
  return format === "BO1" ? 1 : format === "BO3" ? 2 : 3;
}
