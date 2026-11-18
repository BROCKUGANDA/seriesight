import { NextRequest } from "next/server";
import { ok, handler, parseQuery } from "@/lib/api/respond";
import { z } from "zod";
import { FIXTURE_SERIES } from "@/fixtures/dataset";
import { TEAM_INDEX, TOURNAMENT_INDEX } from "@/fixtures/teams";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  teamId: z.string().optional(),
  tournamentId: z.string().optional(),
  status: z.enum(["completed", "upcoming", "all"]).optional().default("all"),
});

export const GET = handler(async (req: NextRequest) => {
  const q = parseQuery(req, querySchema);
  let data = FIXTURE_SERIES;
  if (q.teamId) data = data.filter((s) => s.teamAId === q.teamId || s.teamBId === q.teamId);
  if (q.tournamentId) data = data.filter((s) => s.tournamentId === q.tournamentId);
  if (q.status !== "all") data = data.filter((s) => s.status === q.status);
  return ok(
    data.map((s) => ({
      ...s,
      teamA: TEAM_INDEX.get(s.teamAId)?.shortName ?? s.teamAId,
      teamB: TEAM_INDEX.get(s.teamBId)?.shortName ?? s.teamBId,
      tournament: TOURNAMENT_INDEX.get(s.tournamentId)?.title ?? s.tournamentId,
    })),
    req,
  );
});
