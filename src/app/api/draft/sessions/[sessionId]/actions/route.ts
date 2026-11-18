import { NextRequest } from "next/server";
import { ok, handler, parseBody } from "@/lib/api/respond";
import { z } from "zod";
import { applyDraftAction } from "@/services/draft";

export const dynamic = "force-dynamic";

const actionSchema = z.object({
  type: z.enum(["ban", "pick"]),
  championId: z.string().min(2).max(40),
  playerId: z.string().nullable().optional(),
  role: z.enum(["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"]).nullable().optional(),
  actor: z.string().min(1).max(80).default("coach"),
  /** Optimistic concurrency: server rejects when it does not match the stored version. */
  expectedStateVersion: z.number().int().min(1).optional(),
});

export const POST = handler(async (req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) => {
  const { sessionId } = await params;
  const body = await parseBody(req, actionSchema);
  const result = await applyDraftAction(sessionId, body);
  return ok(result, req, { stateVersion: result.session.stateVersion });
});
