import { NextRequest } from "next/server";
import { ok, handler, parseBody } from "@/lib/api/respond";
import { z } from "zod";
import { recommendationsForSession } from "@/services/draft";
import { registerLedgerRecords } from "@/services/evidence";
import { getSession } from "@/services/draft";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sessionId: z.string().uuid().optional(),
  sessionSnapshot: z
    .object({
      opponentTeamId: z.string(),
      ourTeamId: z.string(),
      patch: z.string(),
      gameNumber: z.number().int().min(1),
      ourPicks: z.array(z.string()),
      opponentPicks: z.array(z.string()),
      ourBans: z.array(z.string()),
      opponentBans: z.array(z.string()),
      unavailableChampionIds: z.array(z.string()),
      ourSide: z.enum(["BLUE", "RED"]),
    })
    .optional(),
});

/**
 * Recommendation candidates. Two supported modes:
 *  - sessionId: live recommendations for a persisted session's current game.
 *  - sessionSnapshot: ad-hoc evaluation of a hypothetical board (used by the UI's
 *    "what-if" hover states without touching persisted state).
 */
export const POST = handler(async (req: NextRequest) => {
  const body = await parseBody(req, bodySchema);
  if (body.sessionSnapshot) {
    const snap = body.sessionSnapshot;
    const { recommend } = await import("@/domain/analytics/recommendations");
    const { CHAMPIONS } = await import("@/fixtures/champions");
    const { ScoutingContext } = await import("@/domain/analytics/scouting-context");
    const opponentCtx = new ScoutingContext(snap.opponentTeamId, { patch: snap.patch });
    const ourCtx = new ScoutingContext(snap.ourTeamId, {});
    const unavailable = new Set(snap.unavailableChampionIds);
    const result = recommend({
      opponentCtx,
      ourCtx,
      ourSide: snap.ourSide,
      gameNumber: snap.gameNumber,
      fearlessMode: "none",
      unavailableChampionIds: unavailable,
      opponentPicks: snap.opponentPicks,
      ourPicks: snap.ourPicks,
      ourBans: snap.ourBans,
      opponentBans: snap.opponentBans,
      pool: CHAMPIONS.filter((c) => !unavailable.has(c.id)),
    });
    registerLedgerRecords(opponentCtx.ledger);
    registerLedgerRecords(ourCtx.ledger);
    return ok(result, req);
  }
  if (!body.sessionId) {
    return ok({ picks: [], bans: [], alternatives: [] }, req);
  }
  const session = await getSession(body.sessionId);
  const result = recommendationsForSession(session);
  return ok(result, req);
});
