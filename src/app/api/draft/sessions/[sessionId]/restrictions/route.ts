import { NextRequest } from "next/server";
import { ok, handler } from "@/lib/api/respond";
import { getSession, seriesRestrictions } from "@/services/draft";

export const dynamic = "force-dynamic";

/** Per-game Fearless restriction ledger for Series Lab (PRD D6). */
export const GET = handler(async (req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) => {
  const { sessionId } = await params;
  const session = await getSession(sessionId);
  return ok(
    {
      sessionId,
      mode: session.mode,
      scope: session.restrictionsScope,
      restrictions: seriesRestrictions(session),
    },
    req,
  );
});
