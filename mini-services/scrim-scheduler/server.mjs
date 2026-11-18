#!/usr/bin/env node
/**
 * Seriesight Scrim Scheduler Connector — a real, standalone external system.
 *
 * An independent Node HTTP service (default http://127.0.0.1:4002) modelling a
 * team's scrim scheduling tool, with its own storage and REST API and a live
 * bidirectional seam with the Seriesight Integration Hub:
 *
 *  → Hub (outbound from scheduler)
 *      POST /scrims               book a scrim      → signed `scrim.schedule.updated`
 *      PATCH /scrims/:id          reschedule/cancel → signed `scrim.schedule.updated`
 *      POST /scrims/:id/result    record result     → signed `scrim.result.recorded`
 *
 *  ← Hub (inbound to scheduler)
 *      POST /receiver/scrim-scheduler   Seriesight fan-out (draft finalized,
 *                                       scrim echoes…) — signature verified,
 *                                       deliveries journaled.
 *
 * Env:
 *   SCRIM_PORT                (default 4002)
 *   SERIESIGHT_HUB_URL        (default http://127.0.0.1:3000)
 *   SERIESIGHT_INBOUND_SECRET (required)
 *   SCRIM_ENDPOINT_SECRET_FILE (default ./data/endpoint-secret.json)
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createJsonStore, makeReceiverHandler, publishToHub } from "../shared/seriesight-client.mjs";

const PORT = Number(process.env.SCRIM_PORT ?? 4002);
const SECRET_FILE = process.env.SCRIM_ENDPOINT_SECRET_FILE ?? new URL("./data/endpoint-secret.json", import.meta.url).pathname;

const store = createJsonStore(new URL("./data/scrims.json", import.meta.url).pathname, () => ({ scrims: [], webhookLog: [], rejected: [], deliveries: [] }));

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
  serviceName: "Scrim Scheduler",
});

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "x-powered-by": "seriesight-scrim-scheduler" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

function validScrim(input) {
  return (
    typeof input?.opponentTeamId === "string" &&
    input.opponentTeamId.trim().length >= 2 &&
    typeof input?.scheduledFor === "string" &&
    !Number.isNaN(Date.parse(input.scheduledFor))
  );
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const { pathname } = url;
  const scrimMatch = pathname.match(/^\/scrims\/([a-zA-Z0-9_-]+)(\/result)?$/);

  /** Map a local scrim to the Hub's scrim.schedule.updated contract (scheduledAt + bo format). */
  function toSchedulePayload(scrim, action) {
    const bo = Number(scrim.bestOf ?? 1);
    const format = bo >= 5 ? "bo5" : bo >= 3 ? "bo3" : "bo1";
    return {
      scrimId: scrim.id,
      action,
      ourTeamId: scrim.ourTeamId,
      opponentTeamId: scrim.opponentTeamId,
      scheduledAt: scrim.scheduledFor,
      format,
      notes: scrim.notes || undefined,
      externalSystem: "scrim-scheduler",
    };
  }

  try {
    if (req.method === "GET" && pathname === "/health") {
      const data = store.load();
      return json(res, 200, { status: "up", service: "scrim-scheduler", scrims: data.scrims.length, deliveriesReceived: data.deliveries.length, paired: true });
    }

    // Seriesight fan-out receiver (Hub → scheduler).
    if (req.method === "POST" && pathname === "/receiver/scrim-scheduler") return receiverHandler(req, res);
    if (req.method === "GET" && pathname === "/receiver/scrim-scheduler/deliveries") {
      const data = store.load();
      return json(res, 200, { deliveries: data.deliveries, rejected: data.rejected });
    }

    // Scheduler's own REST surface.
    if (req.method === "GET" && pathname === "/scrims") {
      return json(res, 200, { scrims: store.load().scrims });
    }

    if (req.method === "POST" && pathname === "/scrims") {
      const body = await readBody(req);
      let input;
      try {
        input = JSON.parse(body || "{}");
      } catch {
        return json(res, 400, { error: "malformed JSON" });
      }
      if (!validScrim(input)) {
        return json(res, 400, { error: "A scrim needs opponentTeamId (2+ chars) and an ISO scheduledFor date." });
      }
      const scrim = {
        id: `scrim_${randomUUID().slice(0, 8)}`,
        opponentTeamId: input.opponentTeamId.trim(),
        ourTeamId: String(input.ourTeamId ?? "C9"),
        scheduledFor: new Date(input.scheduledFor).toISOString(),
        bestOf: Number(input.bestOf ?? 1),
        notes: String(input.notes ?? "").trim(),
        status: "scheduled",
        createdAt: new Date().toISOString(),
      };
      const data = store.load();
      data.scrims.unshift(scrim);
      data.scrims = data.scrims.slice(0, 500);
      store.save(data);

      const outcome = await publishToHub("scrim.schedule.updated", toSchedulePayload(scrim, "created"));
      journalOutcome(scrim.id, "scrim.schedule.updated", outcome);
      return json(res, outcome.ok ? 201 : 207, { scrim, hub: outcome });
    }

    if (req.method === "PATCH" && scrimMatch && !scrimMatch[2]) {
      const body = await readBody(req);
      let patch;
      try {
        patch = JSON.parse(body || "{}");
      } catch {
        return json(res, 400, { error: "malformed JSON" });
      }
      const data = store.load();
      const scrim = data.scrims.find((s) => s.id === scrimMatch[1]);
      if (!scrim) return json(res, 404, { error: "Scrim not found." });
      if (patch.scheduledFor && !Number.isNaN(Date.parse(patch.scheduledFor))) scrim.scheduledFor = new Date(patch.scheduledFor).toISOString();
      if (["scheduled", "completed", "cancelled"].includes(patch.status)) scrim.status = patch.status;
      if (typeof patch.notes === "string") scrim.notes = patch.notes.trim();
      store.save(data);

      const outcome = await publishToHub("scrim.schedule.updated", toSchedulePayload(scrim, scrim.status === "cancelled" ? "cancelled" : "rescheduled"));
      journalOutcome(scrim.id, "scrim.schedule.updated", outcome);
      return json(res, 200, { scrim, hub: outcome });
    }

    if (req.method === "POST" && scrimMatch && scrimMatch[2] === "/result") {
      const body = await readBody(req);
      let input;
      try {
        input = JSON.parse(body || "{}");
      } catch {
        return json(res, 400, { error: "malformed JSON" });
      }
      if (!["win", "loss", "draw"].includes(input?.result)) {
        return json(res, 400, { error: "result must be win, loss or draw." });
      }
      const data = store.load();
      const scrim = data.scrims.find((s) => s.id === scrimMatch[1]);
      if (!scrim) return json(res, 404, { error: "Scrim not found." });
      const resultRow = {
        result: input.result,
        gameNumber: Number(input.gameNumber ?? 1),
        patch: String(input.patch ?? "unknown"),
        ourScore: Number(input.ourScore ?? 0),
        theirScore: Number(input.theirScore ?? 0),
        notes: String(input.notes ?? "").trim(),
        recordedAt: new Date().toISOString(),
      };
      scrim.results ??= [];
      scrim.results.push(resultRow);
      scrim.status = "completed";
      store.save(data);

      const outcome = await publishToHub("scrim.result.recorded", {
        scrimId: scrim.id,
        ourTeamId: scrim.ourTeamId,
        opponentTeamId: scrim.opponentTeamId,
        result: resultRow.result,
        gameNumber: resultRow.gameNumber,
        patch: resultRow.patch,
        tournament: `Scrim vs ${scrim.opponentTeamId}`,
        ourScore: resultRow.ourScore,
        theirScore: resultRow.theirScore,
        playedAt: resultRow.recordedAt,
        notes: resultRow.notes || undefined,
        externalSystem: "scrim-scheduler",
      });
      journalOutcome(scrim.id, "scrim.result.recorded", outcome);
      return json(res, outcome.ok ? 201 : 207, { scrim, hub: outcome });
    }

    if (req.method === "GET" && pathname === "/webhook-log") {
      return json(res, 200, { log: store.load().webhookLog });
    }

    return json(res, 404, {
      error: `No route: ${req.method} ${pathname}`,
      routes: ["/health", "/scrims", "/scrims/:id", "/scrims/:id/result", "/webhook-log", "/receiver/scrim-scheduler", "/receiver/scrim-scheduler/deliveries"],
    });
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }

  function journalOutcome(scrimId, topic, outcome) {
    const log = store.load();
    log.webhookLog.unshift({ id: randomUUID(), at: new Date().toISOString(), topic, scrimId, ...outcome });
    log.webhookLog = log.webhookLog.slice(0, 200);
    store.save(log);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[scrim-scheduler] listening on http://127.0.0.1:${PORT} → hub ${process.env.SERIESIGHT_HUB_URL ?? "http://127.0.0.1:3000"}`);
});
