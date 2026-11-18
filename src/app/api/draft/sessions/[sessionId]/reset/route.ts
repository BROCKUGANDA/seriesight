import { NextRequest } from "next/server";
import { ok, handler, parseOptionalBody } from "@/lib/api/respond";
import { z } from "zod";
import { resetGame } from "@/services/draft";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ expectedStateVersion: z.number().int().min(1).optional() });

/** Reset the current game to an empty board (undo history is discarded). */
export const POST = handler(async (req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) => {
  const { sessionId } = await params;
  const body = await parseOptionalBody(req, bodySchema);
  const result = await resetGame(sessionId, body?.expectedStateVersion);
  return ok(result, req, { stateVersion: result.session.stateVersion });
});
