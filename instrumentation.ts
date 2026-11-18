/**
 * Next.js instrumentation hook — runs once per server process at boot.
 *
 * Registers the background dispatch scheduler so the integration bus drains
 * due outbox events without waiting for an external cron: retries resume after
 * a restart and dead-lettered work flows without human prodding.
 *
 * The scheduler calls dispatchPending() in-process (never an HTTP self-call —
 * see src/lib/integration/scheduler.ts). External schedulers that want the
 * HTTP seam use scripts/dispatch-cron-worker.mjs → POST /api/integration/dispatch.
 *
 * Disable the in-process loop with SERIESIGHT_DISPATCH_INTERVAL_MS=0 when a
 * real cron (crontab / Kubernetes CronJob) owns the cadence instead.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startDispatchScheduler } = await import("./src/lib/integration/scheduler");
  startDispatchScheduler();
}
