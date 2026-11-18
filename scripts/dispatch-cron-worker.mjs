#!/usr/bin/env node
/**
 * Seriesight dispatch cron worker — background-style delivery over the HTTP seam.
 *
 * POSTs {SERIESIGHT_URL}/api/integration/dispatch on a fixed interval so due
 * outbox events (pending retries, fan-out follow-ups) are drained by an
 * external scheduler instead of the in-process instrumentation loop. Designed
 * for crontab, systemd timers, Kubernetes CronJob or CI:
 *
 *   # crontab — every minute
 *   * * * * * /usr/bin/node /opt/seriesight/scripts/dispatch-cron-worker.mjs --once \
 *       >> /var/log/seriesight-dispatch.log 2>&1
 *
 *   # Kubernetes CronJob container command
 *   node /app/scripts/dispatch-cron-worker.mjs --once
 *
 *   # long-running mode (built-in interval, default 60 s)
 *   node scripts/dispatch-cron-worker.mjs
 *
 * Env:
 *   SERIESIGHT_URL                    (default http://127.0.0.1:3000)
 *   SERIESIGHT_DISPATCH_INTERVAL_MS   (default 60000; ignored with --once)
 *   SERIESIGHT_DISPATCH_LIMIT         (default 50)
 */
import { setTimeout as sleep } from "node:timers/promises";

const BASE_URL = (process.env.SERIESIGHT_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const INTERVAL_MS = Number(process.env.SERIESIGHT_DISPATCH_INTERVAL_MS ?? "60000");
const LIMIT = Number(process.env.SERIESIGHT_DISPATCH_LIMIT ?? "50");
const ONCE = process.argv.includes("--once");

function stamp() {
  return new Date().toISOString();
}

async function tick(attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${BASE_URL}/api/integration/dispatch`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "Seriesight-DispatchCron/1.0" },
      body: JSON.stringify({ limit: LIMIT }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const json = await res.json().catch(() => null);
    if (res.status === 429) {
      console.log(`${stamp()} dispatch tick: rate-limited by the platform, backing off (attempt ${attempt})`);
      return { ok: false, retryable: true, rateLimited: true };
    }
    if (!res.ok || json?.success !== true) {
      console.error(`${stamp()} dispatch tick failed: HTTP ${res.status} ${json?.error?.code ?? ""} ${json?.error?.message ?? ""}`.trimEnd());
      return { ok: false, retryable: res.status >= 500 || res.status === 0 };
    }
    const t = json.data;
    console.log(`${stamp()} dispatch tick: scanned=${t.scanned} delivered=${t.delivered} rescheduled=${t.rescheduled} dead=${t.dead} (${t.ranAt})`);
    return { ok: true, retryable: false };
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${stamp()} dispatch tick error (attempt ${attempt}): ${message}`);
    return { ok: false, retryable: true };
  }
}

const MAX_ATTEMPTS = 3;

async function runOnce() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await tick(attempt);
    if (result.ok || !result.retryable) return result.ok ? 0 : 1;
    const backoff = Math.min(30_000, 2 ** attempt * 1_000);
    if (attempt < MAX_ATTEMPTS) await sleep(backoff);
  }
  return 1;
}

async function runLoop() {
  console.log(`${stamp()} dispatch cron worker started → ${BASE_URL} every ${INTERVAL_MS} ms (limit ${LIMIT}/tick)`);
  let consecutiveFailures = 0;
  for (;;) {
    const started = Date.now();
    const result = await tick();
    consecutiveFailures = result.ok ? 0 : consecutiveFailures + 1;
    // Circuit-breaker style pacing: when the platform is unreachable, slow down
    // instead of hammering it every second of a long outage.
    const pace = result.ok || INTERVAL_MS >= 60_000 ? INTERVAL_MS : Math.min(INTERVAL_MS * (1 + consecutiveFailures), 300_000);
    const elapsed = Date.now() - started;
    await sleep(Math.max(500, pace - elapsed));
  }
}

if (ONCE) {
  runOnce().then((code) => process.exit(code)).catch((err) => {
    console.error(`${stamp()} fatal:`, err);
    process.exit(1);
  });
} else {
  runLoop().catch((err) => {
    console.error(`${stamp()} fatal:`, err);
    process.exit(1);
  });
}
