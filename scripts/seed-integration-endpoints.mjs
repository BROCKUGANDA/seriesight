#!/usr/bin/env node
/**
 * Pair the connector mini-services with the Seriesight Integration Hub.
 *
 * Registers each connector's receiver as an outbound subscriber endpoint
 * (Hub → connector fan-out) and stores the one-time signing secret in the
 * connector's data directory so its receiver can verify deliveries on the
 * wire. Idempotent: endpoints whose label already exists are skipped.
 *
 * Usage:  node scripts/seed-integration-endpoints.mjs
 * Env:    SERIESIGHT_URL  (default http://127.0.0.1:3000)
 *         SERIESIGHT_CRM_URL   (default http://127.0.0.1:4001)
 *         SERIESIGHT_SCRIM_URL (default http://127.0.0.1:4002)
 *         SERIESIGHT_DISCORD_URL (default http://127.0.0.1:4003)
 */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = (process.env.SERIESIGHT_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const CRM_URL = (process.env.SERIESIGHT_CRM_URL ?? "http://127.0.0.1:4001").replace(/\/+$/, "");
const SCRIM_URL = (process.env.SERIESIGHT_SCRIM_URL ?? "http://127.0.0.1:4002").replace(/\/+$/, "");
const DISCORD_URL = (process.env.SERIESIGHT_DISCORD_URL ?? "http://127.0.0.1:4003").replace(/\/+$/, "");

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success !== true) {
    throw new Error(`${init?.method ?? "GET"} ${path} → HTTP ${res.status}: ${json?.error?.message ?? res.statusText}`);
  }
  return json.data;
}

async function ensureEndpoint({ label, url, topics, secretFile }) {
  const { endpoints } = await api("/api/integration/endpoints");
  const existing = endpoints.find((e) => e.label === label);
  if (existing) {
    console.log(`= ${label} already registered (${existing.id}) — skipping`);
    return existing;
  }
  const secret = randomBytes(24).toString("base64url");
  const payload = await api("/api/integration/endpoints", {
    method: "POST",
    body: JSON.stringify({ label, url, topics, secret }),
  });
  const created = payload.endpoint ?? payload; // response envelope wraps the endpoint
  writeFileSync(secretFile, JSON.stringify({ endpointId: created.id, url, topics, secret, pairedAt: new Date().toISOString() }, null, 2));
  console.log(`+ ${label} registered (${created.id}) → ${url} · secret written to ${secretFile}`);
  return created;
}

const results = [];
try {
  results.push(
    await ensureEndpoint({
      label: "CRM Connector (mini-service)",
      url: `${CRM_URL}/receiver/crm`,
      topics: ["commercial.lead.captured", "draft.session.finalized"],
      secretFile: fileURLToPath(new URL("../mini-services/crm-connector/data/endpoint-secret.json", import.meta.url)),
    }),
  );
  results.push(
    await ensureEndpoint({
      label: "Scrim Scheduler (mini-service)",
      url: `${SCRIM_URL}/receiver/scrim-scheduler`,
      topics: ["scrim.schedule.updated", "scrim.result.recorded", "draft.session.finalized"],
      secretFile: fileURLToPath(new URL("../mini-services/scrim-scheduler/data/endpoint-secret.json", import.meta.url)),
    }),
  );
  results.push(
    await ensureEndpoint({
      label: "Discord Alerts (mini-service)",
      url: `${DISCORD_URL}/receiver/discord-alerts`,
      topics: ["scrim.schedule.updated", "scrim.result.recorded", "draft.session.finalized"],
      secretFile: fileURLToPath(new URL("../mini-services/discord-alerts/data/endpoint-secret.json", import.meta.url)),
    }),
  );
  console.log(`\nPaired ${results.filter(Boolean).length} connector endpoint(s) with the Hub at ${BASE}.`);
  process.exit(0);
} catch (err) {
  console.error(`Pairing failed: ${err instanceof Error ? err.message : String(err)}`);
  console.error("Is the Seriesight server running? Start it with `bun run dev`, then retry.");
  process.exit(1);
}
