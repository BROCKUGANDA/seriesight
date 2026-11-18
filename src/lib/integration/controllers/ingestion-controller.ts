/**
 * Production controllers — the authoritative producers on internal seams.
 *
 * A controller owns the business rule "when X happens in the domain, an event
 * must exist". Routes call controllers (never `publish` directly) so every
 * producer goes through one validated, documented, testable seam.
 */
import { publish, publishAndDispatch, newCorrelationId } from "../bus";
import type { IntegrationEvent, IntegrationTopic, DispatchOutcome } from "../types";

const SOURCE = "controller:ingestion";

/** Emitted after a series import completes on any provider seam. */
export async function emitSeriesImported(input: {
  provider: string;
  seriesCount: number;
  gameCount: number;
  jobId?: string | null;
  datasetId?: string | null;
  drain?: boolean;
}): Promise<{ event: IntegrationEvent; outcome?: DispatchOutcome }> {
  const correlationId = newCorrelationId();
  const payload = {
    provider: input.provider,
    seriesCount: input.seriesCount,
    gameCount: input.gameCount,
    jobId: input.jobId ?? null,
    datasetId: input.datasetId ?? null,
    completedAt: new Date().toISOString(),
  };
  if (input.drain === false) {
    return { event: await publish({ topic: "data.series.imported", source: SOURCE, payload, correlationId }) };
  }
  const { event, outcome } = await publishAndDispatch({ topic: "data.series.imported", source: SOURCE, payload, correlationId });
  return { event, outcome };
}

/** Emitted after a provider health probe from the REST polling adapter. */
export async function emitProviderHealth(input: { provider: string; status: string; detail: string }): Promise<{ event: IntegrationEvent; outcome?: DispatchOutcome }> {
  const payload = { provider: input.provider, status: input.status, detail: input.detail, probedAt: new Date().toISOString() };
  const { event, outcome } = await publishAndDispatch({ topic: "data.provider.health", source: "adapter:rest-polling", payload, correlationId: newCorrelationId() });
  return { event, outcome };
}

export function ingestionTopics(): IntegrationTopic[] {
  return ["data.series.imported", "data.provider.health"];
}
