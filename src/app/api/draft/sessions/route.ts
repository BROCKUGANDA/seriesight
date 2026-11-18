import { NextRequest } from "next/server";
import { ok, handler, parseBody } from "@/lib/api/respond";
import { z } from "zod";
import { createSession, listSessions } from "@/services/draft";

export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  const sessions = await listSessions(15);
  return ok(sessions, req);
});

const createSchema = z.object({
  opponentTeamId: z.string().min(2).max(8),
  ourTeamId: z.string().min(2).max(8).optional(),
  format: z.enum(["BO1", "BO3", "BO5"]),
  rulesetId: z.string().min(3).max(40),
  modeOverride: z.enum(["none", "hard", "soft"]).optional(),
  scopeOverride: z.enum(["both", "own"]).optional(),
  ourSide: z.enum(["BLUE", "RED"]).optional(),
  tournamentId: z.string().optional().nullable(),
  patch: z.string().optional(),
});

export const POST = handler(async (req: NextRequest) => {
  const body = await parseBody(req, createSchema);
  const session = await createSession(body);
  return ok(session, req, { created: true });
});
