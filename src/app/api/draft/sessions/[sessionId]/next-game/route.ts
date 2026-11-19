import { NextRequest } from "next/server";
import { ok, handler, parseBody } from "@/lib/api/respond";
import { z } from "zod";
import { startNextGame } from "@/services/draft";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ expectedStateVersion: z.number().int().min(1) });

export const POST = handler(async (req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) => {
  const { sessionId } = await params;
  const body = await parseBody(req, bodySchema);
  const result = await startNextGame(sessionId, body.expectedStateVersion);
  return ok(result, req, { stateVersion: result.session.stateVersion });
});
