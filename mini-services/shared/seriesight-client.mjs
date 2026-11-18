/**
 * Seriesight connector SDK — shared by the CRM and scrim-scheduler mini-services.
 *
 * Two directions, one contract:
 *  • outbound to the Hub   → POST {HUB}/api/integration/ingest/<topic> with
 *    `x-seriesight-signature: sha256=<HMAC-SHA256 over the exact raw body>`
 *    computed with the shared SERIESIGHT_INBOUND_SECRET.
 *  • inbound from the Hub  → verify the same header over the raw body with the
 *    endpoint secret Seriesight issued at registration (timing-safe compare).
 *
 * Zero dependencies on purpose: these services model a real external system
 * that only speaks plain HTTP + HMAC.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const require_ = createRequire(import.meta.url);

export const SIGNATURE_HEADER = "x-seriesight-signature";

export function hubUrl() {
  return process.env.SERIESIGHT_HUB_URL ?? "http://127.0.0.1:3000";
}

export function inboundSecret() {
  const secret = process.env.SERIESIGHT_INBOUND_SECRET;
  if (!secret) {
    throw new Error("SERIESIGHT_INBOUND_SECRET is not set — refusing to sign webhooks with a placeholder.");
  }
  return secret;
}

/** Sign an exact body string the way Seriesight's inbound adapter expects. */
export function signBody(secret, rawBody) {
  return `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
}

/** Timing-safe verification of an inbound Seriesight signature. */
export function verifySignature(secret, rawBody, header) {
  if (!header || typeof header !== "string" || !header.startsWith("sha256=")) return false;
  const provided = Buffer.from(header.slice("sha256=".length).trim(), "utf8");
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody, "utf8").digest("hex"), "utf8");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/**
 * Publish a domain event to the Seriesight Hub through the inbound webhook
 * adapter. Returns { ok, status, eventId, verified } — callers journal the
 * outcome on their own side (outbox semantics, retried by the caller loop).
 */
export async function publishToHub(topic, payload, { correlationId } = {}) {
  const url = `${hubUrl()}/api/integration/ingest/${topic}`;
  const body = JSON.stringify({
    ...payload,
    __hopCount: Number(payload.__hopCount ?? 0),
    ...(correlationId ? { correlationId } : {}),
  });
  const headers = {
    "content-type": "application/json",
    "user-agent": "Seriesight-Connector/1.0",
    "x-seriesight-topic": topic,
  };
  try {
    headers[SIGNATURE_HEADER] = signBody(inboundSecret(), body);
  } catch (err) {
    return { ok: false, status: 0, eventId: null, verified: false, error: err instanceof Error ? err.message : String(err) };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
    clearTimeout(timer);
    const json = await res.json().catch(() => ({}));
    return {
      ok: res.status >= 200 && res.status < 300 && json?.success === true,
      status: res.status,
      eventId: json?.data?.eventId ?? null,
      verified: json?.data?.verified ?? false,
      error: json?.error ? `${json.error.code}: ${json.error.message}` : undefined,
    };
  } catch (err) {
    return { ok: false, status: 0, eventId: null, verified: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Node http handler for the receiver route Seriesight fans out to.
 * Verifies the signature against the endpoint secret stored by the pairing
 * step (re-read from disk so re-pairing takes effect without a restart) and
 * journals every accepted delivery to the provided store.
 */
export function makeReceiverHandler({ secretFile, store, serviceName }) {
  return (req, res) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 1_000_000) {
        res.writeHead(413, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "payload too large" }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      let secretInfo = null;
      try {
        if (existsSync(secretFile)) secretInfo = JSON.parse(readFileSync(secretFile, "utf8"));
      } catch {
        secretInfo = null;
      }
      if (!secretInfo?.secret) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: `${serviceName} is not paired with Seriesight yet — run scripts/seed-integration-endpoints.mjs.` }));
        return;
      }
      const signature = req.headers[SIGNATURE_HEADER];
      if (!verifySignature(secretInfo.secret, rawBody, signature)) {
        store.recordRejected({ serviceName, rawBodyLength: rawBody.length });
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "signature verification failed" }));
        return;
      }
      let envelope;
      try {
        envelope = JSON.parse(rawBody);
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "malformed JSON" }));
        return;
      }
      const delivery = store.recordDelivery({
        endpointId: secretInfo.endpointId ?? null,
        eventId: envelope.id ?? null,
        topic: envelope.topic ?? null,
        occurredAt: envelope.occurredAt ?? null,
        payload: envelope.payload ?? envelope,
        receivedAt: new Date().toISOString(),
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ received: true, deliveryId: delivery.id }));
    });
  };
}

/** Tiny JSON file store used by both connectors (their own "database"). */
export function createJsonStore(filePath, initial) {
  const require_2 = require_;
  const { existsSync, readFileSync, writeFileSync, mkdirSync } = require_2("node:fs");
  const path = require_2("node:path");
  mkdirSync(path.dirname(filePath), { recursive: true });
  const load = () => {
    try {
      if (existsSync(filePath)) return JSON.parse(readFileSync(filePath, "utf8"));
    } catch {
      /* corrupted file — start fresh */
    }
    return initial();
  };
  const save = (data) => {
    writeFileSync(filePath, JSON.stringify(data, null, 2));
  };
  return { load, save, existsSync, readFileSync };
}
