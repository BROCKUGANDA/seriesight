/**
 * Draft production controller — emits `draft.session.finalized` when a draft
 * board completes, so downstream systems (VOD pipeline, scrim partners,
 * player dashboards) can react without coupling to the draft service.
 */
import { publishAndDispatch, newCorrelationId } from "../bus";
import type { IntegrationEvent, DispatchOutcome } from "../types";

export async function emitDraftFinalized(input: {
  sessionId: string;
  ourTeamId: string;
  opponentTeamId: string;
  format: string;
  gamesCompleted: number;
  tournamentId?: string | null;
}): Promise<{ event: IntegrationEvent; outcome: DispatchOutcome }> {
  return publishAndDispatch({
    topic: "draft.session.finalized",
    source: "controller:draft",
    correlationId: newCorrelationId(),
    payload: {
      sessionId: input.sessionId,
      ourTeamId: input.ourTeamId,
      opponentTeamId: input.opponentTeamId,
      format: input.format,
      gamesCompleted: input.gamesCompleted,
      tournamentId: input.tournamentId ?? null,
      finalizedAt: new Date().toISOString(),
    },
  });
}
