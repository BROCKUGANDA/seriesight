/**
 * Scouting service — opponent profiles, tendencies and evidence, per PRD D3.
 */
import type { Insight, Team } from "@/domain/types";
import { TEAMS, TEAM_INDEX, OUR_TEAM_ID } from "@/fixtures/teams";
import { ScoutingContext, buildInsights, type ScoutingFilters, type OpponentSummary } from "@/domain/analytics/scouting-context";
import { ERRORS } from "@/domain/errors";
import { registerLedgerRecords } from "./evidence";

export function listTeams(): (Team & { isOurTeam: boolean })[] {
  return TEAMS.map((t) => ({ ...t, isOurTeam: t.id === OUR_TEAM_ID }));
}

export interface OpponentProfile {
  team: Team;
  isOurTeam: boolean;
  summary: OpponentSummary;
  usage: ReturnType<ScoutingContext["usageList"]>;
  insights: Insight[];
  players: ReturnType<ScoutingContext["playerPools"]>;
  sideSplit: { BLUE: number; RED: number };
  evidenceCount: number;
}

export async function getOpponentProfile(teamId: string, filters: ScoutingFilters): Promise<OpponentProfile> {
  const team = TEAM_INDEX.get(teamId);
  if (!team) throw ERRORS.unknownTeam(teamId);
  const ctx = new ScoutingContext(teamId, filters);
  const insights = buildInsights(ctx);
  // Bind insights to their evidence ids and register the records globally.
  for (const insight of insights) {
    const rec = ctx.ledger.get(insight.evidenceId);
    if (rec) rec.insightId = insight.id;
  }
  registerLedgerRecords(ctx.ledger);
  return {
    team,
    isOurTeam: teamId === OUR_TEAM_ID,
    summary: ctx.summary,
    usage: ctx.usageList(2),
    insights,
    players: ctx.playerPools(),
    sideSplit: ctx.summary.sideDistribution,
    evidenceCount: ctx.ledger.size(),
  };
}

export async function getOpponentTrends(teamId: string, filters: ScoutingFilters): Promise<{
  teamId: string;
  insights: Insight[];
  crossGame: ReturnType<ScoutingContext["crossGameShift"]>;
  repeatedCompositions: ReturnType<ScoutingContext["repeatedCompositions"]>;
  macro: ReturnType<ScoutingContext["macro"]>;
}> {
  if (!TEAM_INDEX.has(teamId)) throw ERRORS.unknownTeam(teamId);
  const ctx = new ScoutingContext(teamId, filters);
  const insights = buildInsights(ctx);
  for (const insight of insights) {
    const rec = ctx.ledger.get(insight.evidenceId);
    if (rec) rec.insightId = insight.id;
  }
  registerLedgerRecords(ctx.ledger);
  return {
    teamId,
    insights,
    crossGame: ctx.crossGameShift(),
    repeatedCompositions: ctx.repeatedCompositions(),
    macro: ctx.macro(),
  };
}

export { type ScoutingFilters };
