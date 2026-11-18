import { NextRequest } from "next/server";
import { ok, handler, parseQuery } from "@/lib/api/respond";
import { z } from "zod";
import { getOpponentTrends } from "@/services/scouting";

export const dynamic = "force-dynamic";

const filtersSchema = z.object({
  tournamentId: z.string().optional(),
  patch: z.string().optional(),
  side: z.enum(["BLUE", "RED", "both"]).optional().transform((v) => v as "BLUE" | "RED" | "both" | undefined),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  gameNumber: z.coerce.number().int().min(1).max(5).optional(),
});

export const GET = handler(async (req: NextRequest, { params }: { params: Promise<{ teamId: string }> }) => {
  const { teamId } = await params;
  const q = parseQuery(req, filtersSchema);
  const trends = await getOpponentTrends(teamId, q);
  return ok(trends, req);
});
