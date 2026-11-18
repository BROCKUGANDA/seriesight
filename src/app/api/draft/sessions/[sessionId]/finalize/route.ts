import { NextRequest } from "next/server";
import { ok, handler, parseOptionalBody } from "@/lib/api/respond";
import { z } from "zod";
import { finalizeCurrentGame } from "@/services/draft";
import { emitDraftFinalized } from "@/lib/integration/controllers/draft-controller";
import { ensureBusBootstrapped } from "@/lib/integration/bootstrap";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ expectedStateVersion: z.number().int().min(1).optional() });

/**
 * Finalize the current game; triggers Fearless propagation to subsequent games.
 * On completion the Draft Controller publishes `draft.session.finalized` on the
 * integration bus so VOD pipelines, scrim partners and dashboards can react.
 */
export const POST = handler(async (req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) => {
  const { sessionId } = await params;
  const body = await parseOptionalBody(req, bodySchema);
  const result = await finalizeCurrentGame(sessionId, body?.expectedStateVersion);

  ensureBusBootstrapped();
  const { event } = await emitDraftFinalized({
    sessionId,
    ourTeamId: result.session.ourTeamId,
    opponentTeamId: result.session.opponentTeamId,
    format: result.session.format,
    gamesCompleted: result.session.games.filter((g) => g.status === "finalized").length,
    tournamentId: result.session.tournamentId ?? null,
  });

  return ok(result, req, {
    stateVersion: result.session.stateVersion,
    integration: { eventId: event.id, topic: event.topic, status: event.status },
  });
});
