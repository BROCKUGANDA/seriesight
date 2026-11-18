/**
 * Background dispatch scheduler — the in-process cron for the integration bus.
 *
 * Next.js instrumentation (see /instrumentation.ts) calls startDispatchScheduler()
 * once per server process. The loop drains due outbox events by calling
 * dispatchPending() directly — never via HTTP self-call, which would re-enter
 * a single-threaded runtime and deadlock (see bus.ts fan-out notes).
 *
 * External schedulers (crontab, Kubernetes CronJob, CI) that prefer the HTTP
 * seam should use scripts/dispatch-cron-worker.mjs → POST /api/integration/dispatch.
 * Both paths share the same outbox, backoff and dead-letter semantics.
 *
 * Config:
 *   SERIESIGHT_DISPATCH_INTERVAL_MS  tick interval (default 15000; 0 disables)
 *   SERIESIGHT_DISPATCH_LIMIT        max events per tick (default 50)
 */
import { dispatchPending } from "./bus";
import { ensureBusBootstrapped } from "./bootstrap";

export interface SchedulerStatus {
  started: boolean;
  disabled: boolean;
  intervalMs: number;
  limit: number;
  startedAt: string | null;
  lastTickAt: string | null;
  ticks: number;
  lastTally: { scanned: number; delivered: number; rescheduled: number; dead: number } | null;
  lastError: string | null;
}

interface SchedulerState extends SchedulerStatus {
  timer: NodeJS.Timeout | null;
  running: boolean;
}

const global_ = globalThis as unknown as { __seriesightDispatchScheduler?: SchedulerState };

function state(): SchedulerState {
  global_.__seriesightDispatchScheduler ??= {
    started: false,
    disabled: false,
    intervalMs: 15_000,
    limit: 50,
    startedAt: null,
    lastTickAt: null,
    ticks: 0,
    lastTally: null,
    lastError: null,
    timer: null,
    running: false,
  };
  return global_.__seriesightDispatchScheduler;
}

export function schedulerStatus(): SchedulerStatus {
  const s = state();
  return {
    started: s.started,
    disabled: s.disabled,
    intervalMs: s.intervalMs,
    limit: s.limit,
    startedAt: s.startedAt,
    lastTickAt: s.lastTickAt,
    ticks: s.ticks,
    lastTally: s.lastTally,
    lastError: s.lastError,
  };
}

async function tick(): Promise<void> {
  const s = state();
  if (s.running) return; // overlap guard — a slow cycle never stacks ticks
  s.running = true;
  try {
    ensureBusBootstrapped();
    const tally = await dispatchPending(s.limit);
    s.lastTally = tally;
    s.lastError = null;
    s.ticks += 1;
    s.lastTickAt = new Date().toISOString();
    if (tally.scanned > 0) {
      console.log(`[seriesight:scheduler] tick #${s.ticks} — ${tally.delivered} delivered, ${tally.rescheduled} rescheduled, ${tally.dead} dead of ${tally.scanned} due`);
    }
  } catch (err) {
    s.lastError = err instanceof Error ? err.message : String(err);
    console.error("[seriesight:scheduler] tick failed:", s.lastError);
  } finally {
    s.running = false;
  }
}

/** Idempotent: safe to call from multiple module loads in one process. */
export function startDispatchScheduler(): void {
  const s = state();
  if (s.started || s.disabled) return;
  const intervalMs = Number(process.env.SERIESIGHT_DISPATCH_INTERVAL_MS ?? "15000");
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    s.disabled = true;
    s.intervalMs = intervalMs || 0;
    console.log("[seriesight:scheduler] disabled via SERIESIGHT_DISPATCH_INTERVAL_MS<=0 — rely on the external cron worker or the Hub button.");
    return;
  }
  s.intervalMs = intervalMs;
  s.limit = Number(process.env.SERIESIGHT_DISPATCH_LIMIT ?? "50");
  s.started = true;
  s.startedAt = new Date().toISOString();
  console.log(`[seriesight:scheduler] background dispatch started — every ${intervalMs} ms, limit ${s.limit}/tick`);
  // First tick shortly after boot so a restart resumes any interrupted retries.
  s.timer = setTimeout(() => {
    void tick();
    s.timer = setInterval(() => void tick(), s.intervalMs);
    s.timer.unref?.();
  }, 2_000);
  s.timer.unref?.();
}
