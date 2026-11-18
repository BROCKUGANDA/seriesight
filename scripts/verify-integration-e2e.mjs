#!/usr/bin/env node
/**
 * E2E verification for the live integration seams:
 *   1. Rotated inbound secret — the documented demo default is REJECTED.
 *   2. Rotated inbound secret — the real .env secret is accepted + verified.
 *   3. CRM connector → Hub: lead creation publishes commercial.lead.captured.
 *   4. Scrim scheduler → Hub: booking + result publish scrim.* topics.
 *   5. Hub → connectors: signed fan-out lands in all three receivers' ledgers
 *      (CRM, scrim scheduler, Discord alerts) and the Discord bot formats a
 *      scrim alert into a Discord webhook payload.
 *   6. Cron: POST /api/integration/dispatch (external tick) + in-process
 *      scheduler tick status both report through the same outbox.
 *
 * Usage: node scripts/verify-integration-e2e.mjs
 * Env:   SERIESIGHT_URL (default http://127.0.0.1:3000)
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = (process.env.SERIESIGHT_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const DEMO_SECRET = "seriesight-demo-secret";

let pass = 0;
let fail = 0;
function check(name, cond, detail = "") {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function readEnvSecret() {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split("\n").find((l) => l.startsWith("SERIESIGHT_INBOUND_SECRET="));
  return line?.slice("SERIESIGHT_INBOUND_SECRET=".length).trim() ?? null;
}

function sign(secret, body) {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function waitFor(predicate, { timeoutMs = 12_000, everyMs = 500, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  console.log(`  (timeout waiting for ${label})`);
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`E2E integration verification → ${BASE}\n`);

/* ── 1. Old demo secret must be rejected ─────────────────────────────── */
console.log("[1] Inbound secret rotation");
{
  const body = JSON.stringify({ probe: "old-demo-secret", at: new Date().toISOString() });
  const { status, json } = await api("/api/integration/ingest/integration.ping", {
    method: "POST",
    headers: { "content-type": "application/json", "x-seriesight-signature": sign(DEMO_SECRET, body) },
    body,
  });
  check("documented demo secret rejected", json?.success === false, `HTTP ${status}, code ${json?.error?.code ?? "n/a"}`);
}

/* ── 2. Rotated secret accepted ──────────────────────────────────────── */
{
  const secret = readEnvSecret();
  check(".env carries a rotated SERIESIGHT_INBOUND_SECRET", Boolean(secret) && secret !== DEMO_SECRET && secret.length >= 32, `${secret?.length ?? 0} chars`);
  const body = JSON.stringify({ probe: "rotated-secret", at: new Date().toISOString() });
  const { status, json } = await api("/api/integration/ingest/integration.ping", {
    method: "POST",
    headers: { "content-type": "application/json", "x-seriesight-signature": sign(secret, body) },
    body,
  });
  check("rotated secret accepted + signature verified", json?.success === true && json?.data?.verified === true, `HTTP ${status}, event ${(json?.data?.eventId ?? "").slice(0, 8)}`);
}

/* ── 3. CRM connector → Hub ──────────────────────────────────────────── */
console.log("\n[2] CRM connector → Hub");
{
  const res = await fetch("http://127.0.0.1:4001/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Academy Scout — MENA", email: "scout@mena-academy.example", org: "MENA Academy", source: "website-form", notes: "Interested in team plan after 14-day trial." }),
  });
  const { lead, hub } = await res.json();
  check("CRM stores the lead locally", res.status === 201 && Boolean(lead?.id), `lead ${lead?.id ?? "?"}, HTTP ${res.status}`);
  check("CRM → Hub publish accepted with HMAC verified", hub?.ok === true && hub?.verified === true, `HTTP ${hub?.status}, event ${(hub?.eventId ?? "").slice(0, 8)}`);

  const { json } = await api("/api/integration/overview");
  const evt = json?.data?.events.find((e) => e.topic === "commercial.lead.captured" && e.payloadPreview.includes(lead.id));
  check("Hub event stream shows commercial.lead.captured", Boolean(evt), evt ? `status ${evt.status}, source ${evt.source}` : "not found");
  const notif = json?.data?.notifications.find((n) => n.topic === "commercial.lead.captured" && (n.title + n.body).includes(lead.name));
  check("Notification feed captured the lead", Boolean(notif), notif ? `"${notif.title}"` : "not found");
}

/* ── 4. Scrim scheduler → Hub ────────────────────────────────────────── */
console.log("\n[3] Scrim scheduler → Hub");
{
  const res = await fetch("http://127.0.0.1:4002/scrims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ opponentTeamId: "NVX", ourTeamId: "C9", scheduledFor: new Date(Date.now() + 86_400_000).toISOString(), bestOf: 3, notes: "Best-of-3 scrim block, focus on Fearless draft prep." }),
  });
  const { scrim, hub } = await res.json();
  check("Scheduler books the scrim locally", res.status === 201 && Boolean(scrim?.id), `scrim ${scrim?.id ?? "?"}, HTTP ${res.status}`);
  check("scrim.schedule.updated published + verified", hub?.ok === true && hub?.verified === true, `HTTP ${hub?.status}`);

  const res2 = await fetch(`http://127.0.0.1:4002/scrims/${scrim.id}/result`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ result: "win", gameNumber: 1, patch: "14.9", ourScore: 1, theirScore: 0 }),
  });
  const json2 = await res2.json();
  check("scrim.result.recorded published + verified", res2.status === 201 && json2?.hub?.ok === true && json2?.hub?.verified === true, `HTTP ${res2.status}`);

  const { json } = await api("/api/integration/overview");
  const schedEvt = json?.data?.events.find((e) => e.topic === "scrim.schedule.updated");
  const resultEvt = json?.data?.events.find((e) => e.topic === "scrim.result.recorded");
  check("Hub event stream shows both scrim topics", Boolean(schedEvt) && Boolean(resultEvt), [schedEvt?.status, resultEvt?.status].join(" / "));
}

/* ── 5. Hub → connector receivers (fan-out ledger) ───────────────────── */
console.log("\n[4] Hub fan-out → connector receivers");
{
  const crmOk = await waitFor(async () => {
    const d = await fetch("http://127.0.0.1:4001/receiver/crm/deliveries").then((r) => r.json());
    return d.deliveries.some((x) => x.topic === "commercial.lead.captured");
  }, { label: "CRM receiver delivery" });
  const crmLedger = await fetch("http://127.0.0.1:4001/receiver/crm/deliveries").then((r) => r.json());
  check("CRM receiver verified a signed Hub delivery", crmOk, `${crmLedger.deliveries.length} delivery(ies), ${crmLedger.rejected.length} rejected`);

  const scrimOk = await waitFor(async () => {
    const d = await fetch("http://127.0.0.1:4002/receiver/scrim-scheduler/deliveries").then((r) => r.json());
    return d.deliveries.length > 0;
  }, { label: "scrim receiver delivery" });
  const scrimLedger = await fetch("http://127.0.0.1:4002/receiver/scrim-scheduler/deliveries").then((r) => r.json());
  check("Scrim receiver verified a signed Hub delivery", scrimOk, `${scrimLedger.deliveries.length} delivery(ies), ${scrimLedger.rejected.length} rejected`);

  const discordOk = await waitFor(async () => {
    const d = await fetch("http://127.0.0.1:4003/receiver/discord-alerts/deliveries").then((r) => r.json());
    return d.deliveries.some((x) => x.topic === "scrim.schedule.updated");
  }, { label: "Discord receiver delivery" });
  const discordLedger = await fetch("http://127.0.0.1:4003/receiver/discord-alerts/deliveries").then((r) => r.json());
  check("Discord receiver verified a signed Hub delivery", discordOk, `${discordLedger.deliveries.length} delivery(ies), ${discordLedger.rejected.length} rejected`);

  const discordMsgs = await fetch("http://127.0.0.1:4003/messages").then((r) => r.json());
  const scrimAlert = discordMsgs.messages.find(
    (m) => m.topic === "scrim.schedule.updated" && (m.embedTitle ?? "").includes("Scrim booked vs"),
  );
  check("Discord bot formatted the scrim booking into an embed alert", Boolean(scrimAlert), scrimAlert ? `"${scrimAlert.embedTitle}" · ${scrimAlert.webhookStatus}` : "not found");
  const resultAlert = discordMsgs.messages.find(
    (m) => m.topic === "scrim.result.recorded" && (m.embedTitle ?? "").includes("Scrim result: WIN"),
  );
  check("Discord bot formatted the scrim result alert", Boolean(resultAlert), resultAlert ? `"${resultAlert.embedTitle}"` : "not found");

  const { json } = await api("/api/integration/overview");
  const connEndpoints = (json?.data?.endpoints ?? []).filter((e) => e.label.includes("mini-service"));
  const healthy = connEndpoints.filter((e) => e.successCount > 0 && e.lastStatusCode === 200);
  check("Hub endpoint health tiles show successful deliveries", healthy.length === connEndpoints.length && connEndpoints.length >= 3, connEndpoints.map((e) => `${e.label}: ${e.successCount}✓/${e.failureCount}✗`).join(" · "));
}

/* ── 6. Cron — external dispatch tick + in-process scheduler ─────────── */
console.log("\n[5] Dispatch cron (background-style delivery)");
{
  const { status, json } = await api("/api/integration/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ limit: 50 }),
  });
  const t = json?.data;
  check("POST /api/integration/dispatch answers with a tally", status === 200 && json?.success === true && typeof t?.scanned === "number", `scanned=${t?.scanned} delivered=${t?.delivered} dead=${t?.dead}`);

  const overview = await api("/api/integration/overview");
  const sched = overview.json?.data?.scheduler;
  check("in-process scheduler is running and ticking", sched?.started === true && sched?.ticks > 0, `every ${sched?.intervalMs} ms, ${sched?.ticks} ticks, last ${sched?.lastTickAt}`);

  const up = (overview.json?.data?.connectors ?? []).filter((c) => c.status === "up");
  const total = overview.json?.data?.connectors?.length ?? 0;
  check("Hub probes all three connector healths as up", total === 3 && up.length === 3, up.map((c) => c.name).join(" · "));
}

console.log(`\nResult: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
