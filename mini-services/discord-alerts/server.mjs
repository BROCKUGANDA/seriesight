#!/usr/bin/env node
/**
 * Seriesight Discord Alerts Connector — a real, standalone external system.
 *
 * An independent Node HTTP service (default http://127.0.0.1:4003) modelling a
 * team staff Discord bot. It is receive-only: the Integration Hub fans out
 * scrim and draft events, the connector verifies the signature, formats a
 * Discord-ready message (embed payload exactly as Discord's webhook API
 * expects) and either posts it to a configured Discord webhook or queues it in
 * a dry-run outbox so the demo works without a live Discord server.
 *
 *  ← Hub (inbound to the bot)
 *      POST /receiver/discord-alerts   Seriesight fan-out (scrim.schedule.updated,
 *                                      scrim.result.recorded,
 *                                      draft.session.finalized) — signature
 *                                      verified, deliveries journaled.
 *
 *  → Discord
 *      POST {DISCORD_WEBHOOK_URL}      { username, content, embeds: [...] }
 *                                      when configured via env or POST /config;
 *                                      otherwise messages stay queued.
 *
 * Env:
 *   DISCORD_PORT               (default 4003)
 *   DISCORD_WEBHOOK_URL        (optional; a real Discord webhook URL)
 *   SERIESIGHT_ENDPOINT_SECRET_FILE (default ./data/endpoint-secret.json)
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createJsonStore, makeReceiverHandler } from "../shared/seriesight-client.mjs";

const require_ = createRequire(import.meta.url);
const PORT = Number(process.env.DISCORD_PORT ?? 4003);
const SECRET_FILE =
  process.env.SERIESIGHT_ENDPOINT_SECRET_FILE ?? new URL("./data/endpoint-secret.json", import.meta.url).pathname;
const CONFIG_FILE = new URL("./data/config.json", import.meta.url).pathname;

const VOLT = { cyan: 0x38bdf8, green: 0x22c55e, red: 0xef4444, gray: 0x94a3b8, violet: 0xa78bfa };
const WEBHOOK_PREFIX = "https://discord.com/api/webhooks/";

const store = createJsonStore(new URL("./data/messages.json", import.meta.url).pathname, () => ({
  messages: [],
  deliveries: [],
  rejected: [],
}));

/* ── webhook config (env default, overridable at runtime) ─────────────── */
function loadConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(require_("node:fs").readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    cfg = {};
  }
  return { webhookUrl: process.env.DISCORD_WEBHOOK_URL ?? cfg.webhookUrl ?? null };
}

function saveConfig(cfg) {
  require_("node:fs").writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

/* ── Discord message formatting — event payload → webhook embed ───────── */
function formatDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function formatAlert(topic, payload) {
  const footer = { text: "Seriesight Integration Hub → #scrim-alerts" };
  if (topic === "scrim.schedule.updated") {
    const verb =
      payload.action === "cancelled" ? "cancelled" : payload.action === "rescheduled" ? "rescheduled" : "booked";
    const color = payload.action === "cancelled" ? VOLT.gray : VOLT.cyan;
    return {
      content: `Scrim ${verb} vs ${payload.opponentTeamId} — ${formatDate(payload.scheduledAt)}`,
      embed: {
        title: `Scrim ${verb} vs ${payload.opponentTeamId}`,
        description: `Seriesight scrim schedule update for **${payload.ourTeamId ?? "C9"}**.`,
        color,
        fields: [
          { name: "Opponent", value: String(payload.opponentTeamId), inline: true },
          { name: "Format", value: String(payload.format ?? "bo1").toUpperCase(), inline: true },
          { name: "When", value: formatDate(payload.scheduledAt), inline: false },
          ...(payload.notes ? [{ name: "Notes", value: String(payload.notes).slice(0, 300), inline: false }] : []),
        ],
        timestamp: new Date().toISOString(),
        footer,
      },
    };
  }
  if (topic === "scrim.result.recorded") {
    const color = payload.result === "win" ? VOLT.green : payload.result === "loss" ? VOLT.red : VOLT.gray;
    const emoji = payload.result === "win" ? "WIN" : payload.result === "loss" ? "LOSS" : "DRAW";
    return {
      content: `Scrim result: **${emoji}** vs ${payload.opponentTeamId} ${payload.ourScore}–${payload.theirScore}`,
      embed: {
        title: `Scrim result: ${emoji} vs ${payload.opponentTeamId}`,
        description: `Game ${payload.gameNumber ?? 1} on patch ${payload.patch ?? "unknown"}.`,
        color,
        fields: [
          { name: "Score", value: `${payload.ourScore ?? 0} – ${payload.theirScore ?? 0}`, inline: true },
          { name: "Game", value: String(payload.gameNumber ?? 1), inline: true },
          { name: "Patch", value: String(payload.patch ?? "unknown"), inline: true },
          ...(payload.notes ? [{ name: "Notes", value: String(payload.notes).slice(0, 300), inline: false }] : []),
        ],
        timestamp: new Date().toISOString(),
        footer,
      },
    };
  }
  if (topic === "draft.session.finalized") {
    return {
      content: `Draft plan locked vs ${payload.opponentTeamId} — Fearless pool tracked for G${payload.gamesCompleted ?? 1}+.`,
      embed: {
        title: `Draft plan locked vs ${payload.opponentTeamId}`,
        description: `${String(payload.format ?? "bo1").toUpperCase()} finalized with ${payload.gamesCompleted ?? 1} game(s) prepped. Open the Seriesight Draft Room for the pick/ban script and live winrate impact.`,
        color: VOLT.violet,
        fields: [
          { name: "Format", value: String(payload.format ?? "bo1").toUpperCase(), inline: true },
          { name: "Games prepped", value: String(payload.gamesCompleted ?? 1), inline: true },
          ...(payload.tournamentId ? [{ name: "Tournament", value: String(payload.tournamentId), inline: true }] : []),
        ],
        timestamp: new Date().toISOString(),
        footer,
      },
    };
  }
  return {
    content: `Seriesight event: ${topic}`,
    embed: {
      title: `Seriesight event: ${topic}`,
      description: "A subscribed Hub event arrived.",
      color: VOLT.violet,
      timestamp: new Date().toISOString(),
      footer,
    },
  };
}

function discordPayload(message) {
  return {
    username: "Seriesight",
    content: message.content,
    embeds: [message.embed],
  };
}

/* ── webhook delivery — fire-and-forget, status journaled on the row ──── */
async function attemptWebhook(messageId) {
  const cfg = loadConfig();
  if (!cfg.webhookUrl || !cfg.webhookUrl.startsWith(WEBHOOK_PREFIX)) {
    updateMessage(messageId, { webhookStatus: "queued-dry-run" });
    return;
  }
  const data = store.load();
  const row = data.messages.find((m) => m.id === messageId);
  if (!row) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(cfg.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(discordPayload(row)),
      signal: controller.signal,
    });
    clearTimeout(timer);
    updateMessage(messageId, {
      webhookStatus: res.ok ? "posted" : `failed HTTP ${res.status}`,
      webhookHttpStatus: res.status,
      attemptedAt: new Date().toISOString(),
    });
  } catch (err) {
    updateMessage(messageId, {
      webhookStatus: `failed: ${err instanceof Error ? err.message : String(err)}`,
      attemptedAt: new Date().toISOString(),
    });
  }
}

function updateMessage(id, patch) {
  const data = store.load();
  const row = data.messages.find((m) => m.id === id);
  if (!row) return;
  Object.assign(row, patch);
  store.save(data);
}

/* ── Hub fan-out receiver — verify → journal → format → queue/post ────── */
const receiverHandler = makeReceiverHandler({
  secretFile: SECRET_FILE,
  store: {
    recordDelivery(d) {
      const data = store.load();
      const deliveryRow = { id: randomUUID(), ...d };
      data.deliveries.unshift(deliveryRow);
      data.deliveries = data.deliveries.slice(0, 200);
      const formatted = formatAlert(d.topic ?? "unknown", d.payload ?? {});
      const messageRow = {
        id: `msg_${randomUUID().slice(0, 8)}`,
        at: new Date().toISOString(),
        topic: d.topic,
        eventId: d.eventId,
        ...formatted,
        webhookStatus: "pending",
      };
      data.messages.unshift(messageRow);
      data.messages = data.messages.slice(0, 200);
      store.save(data);
      void attemptWebhook(messageRow.id);
      return deliveryRow;
    },
    recordRejected(r) {
      const data = store.load();
      data.rejected.unshift({ id: randomUUID(), ...r, at: new Date().toISOString() });
      data.rejected = data.rejected.slice(0, 50);
      store.save(data);
    },
  },
  serviceName: "Discord Alerts",
});

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "x-powered-by": "seriesight-discord-alerts" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const { pathname } = url;
  try {
    if (req.method === "GET" && pathname === "/health") {
      const data = store.load();
      const cfg = loadConfig();
      return json(res, 200, {
        status: "up",
        service: "discord-alerts",
        messages: data.messages.length,
        deliveriesReceived: data.deliveries.length,
        rejected: data.rejected.length,
        webhookConfigured: Boolean(cfg.webhookUrl),
        paired: true,
      });
    }

    if (req.method === "POST" && pathname === "/receiver/discord-alerts") return receiverHandler(req, res);
    if (req.method === "GET" && pathname === "/receiver/discord-alerts/deliveries") {
      const data = store.load();
      return json(res, 200, { deliveries: data.deliveries, rejected: data.rejected });
    }

    if (req.method === "GET" && pathname === "/messages") {
      const data = store.load();
      const cfg = loadConfig();
      return json(res, 200, {
        webhookConfigured: Boolean(cfg.webhookUrl),
        messages: data.messages.map(({ embed, ...rest }) => ({ ...rest, embedTitle: embed.title })),
      });
    }

    if (req.method === "GET" && pathname === "/config") {
      const cfg = loadConfig();
      const masked = cfg.webhookUrl
        ? `${cfg.webhookUrl.slice(0, WEBHOOK_PREFIX.length + 8)}…${cfg.webhookUrl.slice(-4)}`
        : null;
      return json(res, 200, { webhookConfigured: Boolean(cfg.webhookUrl), webhookUrlMasked: masked });
    }

    if (req.method === "POST" && pathname === "/config") {
      const body = await readBody(req);
      let input;
      try {
        input = JSON.parse(body || "{}");
      } catch {
        return json(res, 400, { error: "malformed JSON" });
      }
      const webhookUrl = String(input.webhookUrl ?? "").trim();
      if (!webhookUrl.startsWith(WEBHOOK_PREFIX)) {
        return json(res, 400, { error: `webhookUrl must start with ${WEBHOOK_PREFIX}` });
      }
      saveConfig({ webhookUrl });
      return json(res, 200, { webhookConfigured: true });
    }

    if (req.method === "DELETE" && pathname === "/config") {
      saveConfig({});
      return json(res, 200, { webhookConfigured: false });
    }

    return json(res, 404, {
      error: `No route: ${req.method} ${pathname}`,
      routes: [
        "/health",
        "/receiver/discord-alerts",
        "/receiver/discord-alerts/deliveries",
        "/messages",
        "/config (GET/POST/DELETE)",
      ],
    });
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const cfg = loadConfig();
  console.log(
    `[discord-alerts] listening on http://127.0.0.1:${PORT} → hub ${process.env.SERIESIGHT_HUB_URL ?? "http://127.0.0.1:3000"} · webhook ${cfg.webhookUrl ? "configured" : "dry-run (no DISCORD_WEBHOOK_URL)"}`,
  );
});
