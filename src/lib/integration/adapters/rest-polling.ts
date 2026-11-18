/**
 * REST polling adapter — outbound seam that pulls from external REST/GraphQL
 * providers on demand. Today it fronts the GRID Central Data endpoint
 * (probe + import); the same seam accepts additional providers by extending
 * the probe registry. Health probes are published on the bus so monitoring
 * sinks and the Hub see provider state changes.
 */
import { probeGrid } from "@/lib/providers/grid/grid-client";
import { emitProviderHealth } from "../controllers/ingestion-controller";
import type { IntegrationEvent, DispatchOutcome } from "../types";

export interface PollResult {
  provider: string;
  status: string;
  detail: string;
  eventEmitted: boolean;
}

/** Probe the GRID provider; publish a `data.provider.health` event when configured. */
export async function pollProviderHealth(): Promise<PollResult> {
  const probe = await probeGrid();
  let eventEmitted = false;
  // When no API key is configured the probe is a no-op — do not spam the bus
  // with `not_configured` noise; the Data Sources page already surfaces it.
  if (probe.status !== "not_configured") {
    const { event }: { event: IntegrationEvent; outcome?: DispatchOutcome } = await emitProviderHealth({
      provider: "grid",
      status: probe.status,
      detail: probe.detail,
    });
    eventEmitted = Boolean(event.id);
  }
  return { provider: "grid", status: probe.status, detail: probe.detail, eventEmitted };
}
