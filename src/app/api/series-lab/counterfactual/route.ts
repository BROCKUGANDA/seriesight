import { NextRequest } from "next/server";
import { ok, handler, parseBody } from "@/lib/api/respond";
import { z } from "zod";
import { counterfactual, getSession } from "@/services/draft";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sessionId: z.string().min(6),
  baseGameNumber: z.number().int().min(1).max(5),
  removeChampionId: z.string().min(2).max(40),
  addChampionId: z.string().min(2).max(40),
  role: z.enum(["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"]).optional(),
});

/** Counterfactual simulation: clone a completed game, swap one pick, diff Fearless fallout. */
export const POST = handler(async (req: NextRequest) => {
  const body = await parseBody(req, bodySchema);
  const session = await getSession(body.sessionId);
  const result = counterfactual(session, body);
  return ok({ ...result, mode: session.mode, scope: session.restrictionsScope }, req);
});
