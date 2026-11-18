/**
 * Commercial production controller — emits `commercial.lead.captured` when a
 * trial/demo request lands, feeding CRM sinks and revenue-ops webhooks.
 */
import { publishAndDispatch, newCorrelationId } from "../bus";
import type { IntegrationEvent, DispatchOutcome } from "../types";

export async function emitLeadCaptured(input: {
  leadId: string;
  organization: string;
  plan: string;
  role: string;
  source: string;
}): Promise<{ event: IntegrationEvent; outcome: DispatchOutcome }> {
  return publishAndDispatch({
    topic: "commercial.lead.captured",
    source: "controller:commercial",
    correlationId: newCorrelationId(),
    payload: {
      leadId: input.leadId,
      organization: input.organization,
      plan: input.plan,
      role: input.role,
      source: input.source,
      capturedAt: new Date().toISOString(),
    },
  });
}
