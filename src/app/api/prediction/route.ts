import { handler, ok, parseBody, parseQuery } from "@/lib/api/respond";
import { requireCoach } from "@/lib/auth";
import { getHistoricalSeries } from "@/services/dataset";
import { getSession } from "@/services/draft";
import { trainWorkspaceModel, workspacePrediction } from "@/services/prediction";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const GET = handler(async (req) => {
  const { sessionId } = parseQuery(req, z.object({ sessionId: z.string().uuid() }));
  const session = await getSession(sessionId);
  const game = session.games.find((g) => g.gameNumber === session.currentGame)!;
  return ok(await workspacePrediction(await getHistoricalSeries(), {
    blueChampions: game.blue.picks.map((p) => p.championId), redChampions: game.red.picks.map((p) => p.championId),
    side: game.blueTeamId === session.ourTeamId ? "blue" : "red",
  }), req);
});
export const POST = handler(async (req) => {
  requireCoach();
  await parseBody(req, z.object({ action: z.literal("train") }).strict());
  return ok(await trainWorkspaceModel(await getHistoricalSeries()), req);
});
