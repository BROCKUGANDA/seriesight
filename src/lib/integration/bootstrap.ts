/**
 * Bus bootstrap — registers every consumer exactly once per process.
 * Call `ensureBusBootstrapped()` at the top of any route that publishes or
 * dispatches. Idempotent via the globalThis registry flag.
 */
import { registerConsumer, isBusBootstrapped, markBusBootstrapped, busMetrics } from "./bus";
import { auditConsumer, warehouseConsumer, notificationConsumer, evidenceRefreshConsumer, metricsConsumer } from "./consumers";
import type { ConsumerHandler, IntegrationEvent } from "./types";

const global_ = globalThis as unknown as { __seriesightMetrics?: { total: number; byTopic: Record<string, number>; lastEventAt: string | null } };

/** Metrics consumer implementation — increments process-local counters. */
function metricsHandler(): ConsumerHandler {
  return async (event: IntegrationEvent) => {
    const m = (global_.__seriesightMetrics ??= { total: 0, byTopic: {}, lastEventAt: null });
    m.total += 1;
    m.byTopic[event.topic] = (m.byTopic[event.topic] ?? 0) + 1;
    m.lastEventAt = event.createdAt;
    return { ok: true };
  };
}

export function ensureBusBootstrapped(): void {
  if (isBusBootstrapped()) return;
  registerConsumer("*", auditConsumer);
  registerConsumer(["data.series.imported", "data.provider.health", "data.file.imported"], warehouseConsumer);
  registerConsumer("*", metricsHandler());
  registerConsumer(
    [
      "data.series.imported",
      "draft.session.finalized",
      "scrim.result.recorded",
      "scrim.schedule.updated",
      "commercial.lead.captured",
      "data.provider.health",
    ],
    notificationConsumer,
  );
  registerConsumer(["data.series.imported", "data.file.imported"], evidenceRefreshConsumer);
  markBusBootstrapped();
}

export function integrationMetrics(): { total: number; byTopic: Record<string, number>; lastEventAt: string | null } {
  ensureBusBootstrapped();
  const m = (global_.__seriesightMetrics ??= { total: 0, byTopic: {}, lastEventAt: null });
  return { ...m, byTopic: { ...m.byTopic } };
}

// Keep the unused import surface honest: busMetrics is re-exported for tests.
export { busMetrics };
