#!/usr/bin/env node
/**
 * Seriesight CRM Connector — a real, standalone external system.
 *
 * This is not a mock in the Next.js app: it is an independent Node HTTP
 * service (default http://127.0.0.1:4001) with its own storage, its own REST
 * API, and a live bidirectional seam with the Seriesight Integration Hub:
 *
 *  → Hub (outbound from CRM)
 *      POST /leads           creates a lead in the CRM store, then publishes a
 *                            signed `commercial.lead.captured` webhook to
 *                            {HUB}/api/integration/ingest/commercial.lead.captured
 *
 *  ← Hub (inbound to CRM)
 *      POST /receiver/crm    Seriesight's webhook fan-out sink delivers signed
 *                            events here; the CRM verifies the HMAC signature
 *                            with the endpoint secret issued at registration
 *                            and journals every delivery.
 *
 * Env:
 *   CRM_PORT                  (default 4001)
 *   SERIESIGHT_HUB_URL        (default http://127.0.0.1:3000)
 *   SERIESIGHT_INBOUND_SECRET (required — same secret the Hub runs with)
 *   CRM_ENDPOINT_SECRET_FILE  (default ./data/endpoint-secret.json, written by
 *                              scripts/seed-integration-endpoints.mjs)
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createJsonStore, makeReceiverHandler, publishToHub } from "../shared/seriesight-client.mjs";

const PORT = Number(process.env.CRM_PORT ?? 4001);
const SECRET_FILE = process.env.CRM_ENDPOINT_SECRET_FILE ?? new URL("./data/endpoint-secret.json", import.meta.url).pathname;

const store = createJsonStore(new URL("./data/leads.json", import.meta.url).pathname, () => ({ leads: [], webhookLog: [], rejected: [], deliveries: [] }));
const db = {
  get data() {
    return store.load();
  },
  save(data) {
    store.save(data);
  },
};

const receiverHandler = makeReceiverHandler({
  secretFile: SECRET_FILE,
  store: {
    recordDelivery(d) {
      const data = store.load();
      const row = { id: randomUUID(), ...d };
      data.deliveries.unshift(row);
      data.deliveries = data.deliveries.slice(0, 200);
      store.save(data);
      return row;
    },
    recordRejected(r) {
      const data = store.load();
      data.rejected.unshift({ id: randomUUID(), ...r, at: new Date().toISOString() });
      data.rejected = data.rejected.slice(0, 50);
      store.save(data);
    },
  },
  serviceName: "CRM Connector",
});

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "x-powered-by": "seriesight-crm-connector" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

function validLead(input) {
  return (
    typeof input?.name === "string" &&
    input.name.trim().length >= 2 &&
    typeof input?.email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())
  );
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const { pathname } = url;
  try {
    // Health — probed by the Integration Hub overview.
    if (req.method === "GET" && pathname === "/health") {
      const data = store.load();
      return json(res, 200, { status: "up", service: "crm-connector", leads: data.leads.length, deliveriesReceived: data.deliveries.length, paired: true });
    }

    // Seriesight fan-out receiver (Hub → CRM).
    if (req.method === "POST" && pathname === "/receiver/crm") return receiverHandler(req, res);
    if (req.method === "GET" && pathname === "/receiver/crm/deliveries") {
      const data = store.load();
      return json(res, 200, { deliveries: data.deliveries, rejected: data.rejected });
    }

    // CRM's own REST surface.
    if (req.method === "GET" && pathname === "/leads") {
      return json(res, 200, { leads: store.load().leads });
    }

    if (req.method === "POST" && pathname === "/leads") {
      const body = await readBody(req);
      let input;
      try {
        input = JSON.parse(body || "{}");
      } catch {
        return json(res, 400, { error: "malformed JSON" });
      }
      if (!validLead(input)) {
        return json(res, 400, { error: "A lead needs a name (2+ chars) and a valid email." });
      }
      const data = store.load();
      const lead = {
        id: `lead_${randomUUID().slice(0, 8)}`,
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        org: String(input.org ?? "").trim(),
        source: String(input.source ?? "manual-entry"),
        notes: String(input.notes ?? "").trim(),
        stage: "new",
        capturedAt: new Date().toISOString(),
      };
      data.leads.unshift(lead);
      data.leads = data.leads.slice(0, 500);
      store.save(data);

      // Real seam: publish to the Seriesight Hub (signed, verified on arrival).
      const outcome = await publishToHub("commercial.lead.captured", {
        leadId: lead.id,
        name: lead.name,
        email: lead.email,
        org: lead.org,
        source: `crm:${lead.source}`,
        notes: lead.notes,
        capturedAt: lead.capturedAt,
        externalSystem: "crm-connector",
      });
      const log = store.load();
      log.webhookLog.unshift({ id: randomUUID(), at: new Date().toISOString(), topic: "commercial.lead.captured", leadId: lead.id, ...outcome });
      log.webhookLog = log.webhookLog.slice(0, 200);
      store.save(log);

      return json(res, outcome.ok ? 201 : 207, {
        lead,
        hub: outcome,
        note: outcome.ok ? "Lead stored and published to the Seriesight Hub." : "Lead stored; Hub publish failed (journaled for retry).",
      });
    }

    if (req.method === "GET" && pathname === "/webhook-log") {
      return json(res, 200, { log: store.load().webhookLog });
    }

    return json(res, 404, { error: `No route: ${req.method} ${pathname}`, routes: ["/health", "/leads", "/webhook-log", "/receiver/crm", "/receiver/crm/deliveries"] });
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[crm-connector] listening on http://127.0.0.1:${PORT} → hub ${process.env.SERIESIGHT_HUB_URL ?? "http://127.0.0.1:3000"}`);
});
