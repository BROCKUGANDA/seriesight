import { NextRequest } from "next/server";
import { ok, handler, parseQuery } from "@/lib/api/respond";
import { z } from "zod";
import { analyticsDataset, datasetTeams, datasetTournaments } from "@/domain/analytics/scouting-context";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  teamId: z.string().optional(),
  tournamentId: z.string().optional(),
  status: z.enum(["completed", "upcoming", "all"]).optional().default("all"),
});

export const GET = handler(async (req: NextRequest) => {
  const q = parseQuery(req, querySchema);
  const dataset = analyticsDataset();
  const teams = new Map(datasetTeams(dataset).map((t) => [t.id, t]));
  const tournaments = new Map(datasetTournaments(dataset).map((t) => [t.id, t]));
  let data = dataset.series;
  if (q.teamId) data = data.filter((s) => s.teamAId === q.teamId || s.teamBId === q.teamId);
  if (q.tournamentId) data = data.filter((s) => s.tournamentId === q.tournamentId);
  if (q.status !== "all") data = data.filter((s) => s.status === q.status);
  return ok(
    data.map((s) => ({
      ...s,
      provider: dataset.provider, label: dataset.label, warnings: dataset.warnings,
      teamA: teams.get(s.teamAId)?.shortName ?? s.teamAId,
      teamB: teams.get(s.teamBId)?.shortName ?? s.teamBId,
      tournament: tournaments.get(s.tournamentId)?.title ?? s.tournamentId,
    })),
    req,
  );
});
