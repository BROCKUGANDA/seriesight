import { NextRequest } from "next/server";
import { ok, handler, parseBody } from "@/lib/api/respond";
import { z } from "zod";
import { assignPickRole } from "@/services/draft";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  side: z.enum(["BLUE", "RED"]),
  pickIndex: z.number().int().min(0).max(4),
  role: z.enum(["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"]),
  playerId: z.string().nullable().optional(),
  expectedStateVersion: z.number().int().min(1).optional(),
});

/** Assign player/role to a pick without consuming a draft turn. */
export const POST = handler(async (req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) => {
  const { sessionId } = await params;
  const body = await parseBody(req, bodySchema);
  const result = await assignPickRole(sessionId, body);
  return ok(result, req, { stateVersion: result.session.stateVersion });
});
