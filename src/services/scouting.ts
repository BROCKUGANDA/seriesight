/**
 * Scouting service — opponent profiles, tendencies and evidence, per PRD D3.
 */
import type { Insight, Team } from "@/domain/types";
import { OUR_TEAM_ID } from "@/fixtures/teams";
import { ScoutingContext, buildInsights, datasetTeams, type ScoutingFilters, type OpponentSummary } from "@/domain/analytics/scouting-context";
import { ERRORS } from "@/domain/errors";
import { registerLedgerRecords } from "./evidence";

export function listTeams(): (Team & { isOurTeam: boolean })[] {
  return datasetTeams().map((t) => ({ ...t, isOurTeam: t.id === OUR_TEAM_ID }));
}

export interface OpponentProfile {
  provider: "fixture" | "grid";
  label: string;
  warnings: string[];
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
  const team = datasetTeams().find((t) => t.id === teamId);
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
    provider: ctx.dataset.provider,
    label: ctx.dataset.label,
    warnings: ctx.dataset.warnings,
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
  provider: "fixture" | "grid";
  label: string;
  warnings: string[];
  teamId: string;
  insights: Insight[];
  crossGame: ReturnType<ScoutingContext["crossGameShift"]>;
  repeatedCompositions: ReturnType<ScoutingContext["repeatedCompositions"]>;
  macro: ReturnType<ScoutingContext["macro"]>;
}> {
  if (!datasetTeams().some((t) => t.id === teamId)) throw ERRORS.unknownTeam(teamId);
  const ctx = new ScoutingContext(teamId, filters);
  const insights = buildInsights(ctx);
  for (const insight of insights) {
    const rec = ctx.ledger.get(insight.evidenceId);
    if (rec) rec.insightId = insight.id;
  }
  registerLedgerRecords(ctx.ledger);
  return {
    provider: ctx.dataset.provider,
    label: ctx.dataset.label,
    warnings: ctx.dataset.warnings,
    teamId,
    insights,
    crossGame: ctx.crossGameShift(),
    repeatedCompositions: ctx.repeatedCompositions(),
    macro: ctx.macro(),
  };
}

export { type ScoutingFilters };
