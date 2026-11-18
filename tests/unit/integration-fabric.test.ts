/**
 * Integration fabric tests: HMAC signing, outbox bus semantics (deliver,
 * reschedule, dead-letter, replay), inbound webhook adapter contract,
 * outbound URL policy and the file-drop adapter parsers.
 *
 * Uses the real SQLite database; all rows created here are cleaned up.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signPayload, verifySignature, generateEndpointSecret, maskSecret, inboundSecret } from "@/lib/integration/hmac";
import { publish, dispatchEvent, registerConsumer, replayEvent, resetBusForTests } from "@/lib/integration/bus";
import { receiveInboundWebhook, isInboundTopic } from "@/lib/integration/adapters/inbound-webhook";
import { assertOutboundUrlAllowed } from "@/lib/integration/sinks/webhook-sink";
import { importFileDrop } from "@/lib/integration/adapters/file-drop";
import { connectorDescriptors, connectorStatuses } from "@/lib/integration/connectors";
import { schedulerStatus, startDispatchScheduler } from "@/lib/integration/scheduler";
import { backoffDelayMs } from "@/lib/integration/types";
import { db } from "@/lib/db";

const createdEventIds: string[] = [];

afterAll(async () => {
  await db.integrationEventRecord.deleteMany({ where: { id: { in: createdEventIds } } });
  await db.integrationDeliveryRecord.deleteMany({ where: { eventId: { in: createdEventIds } } });
});

async function track<T extends { id: string }>(p: Promise<T>): Promise<T> {
  const r = await p;
  createdEventIds.push(r.id);
  return r;
}

describe("HMAC signing contract", () => {
  it("round-trips a valid signature", () => {
    const body = JSON.stringify({ hello: "world" });
    const secret = "shared-secret-123";
    expect(verifySignature(secret, body, signPayload(secret, body))).toBe(true);
  });

  it("rejects tampered payloads and wrong secrets", () => {
    const body = JSON.stringify({ hello: "world" });
    const sig = signPayload("secret-a", body);
    expect(verifySignature("secret-a", `${body} ` , sig)).toBe(false);
    expect(verifySignature("secret-b", body, sig)).toBe(false);
    expect(verifySignature("secret-a", body, "sha256=deadbeef")).toBe(false);
    expect(verifySignature("secret-a", body, null)).toBe(false);
    expect(verifySignature("secret-a", body, "md5=abc")).toBe(false);
  });

  it("generates URL-safe secrets and masks previews", () => {
    const secret = generateEndpointSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const preview = maskSecret(secret);
    expect(preview.startsWith(secret.slice(0, 5))).toBe(true);
    expect(preview).not.toBe(secret);
  });
});

describe("Outbox bus semantics", () => {
  beforeEach(() => {
    // Consumer registrations accumulate on globalThis; isolate each test.
    resetBusForTests();
  });

  it("delivers an event through a subscribed consumer", async () => {
    const seen: string[] = [];
    registerConsumer(["integration.ping"], async (event) => {
      seen.push(event.id);
      return { ok: true };
    });
    const event = await track(publish({ topic: "integration.ping", source: "test", payload: { message: "hi" } }));
    const outcome = await dispatchEvent(event.id);
    expect(outcome.status).toBe("delivered");
    expect(outcome.consumersRun).toBeGreaterThanOrEqual(1);
    expect(seen).toContain(event.id);
    const row = await db.integrationEventRecord.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.status).toBe("delivered");
    expect(row.processedAt).not.toBeNull();
  });

  it("reschedules retryable failures with backoff", async () => {
    registerConsumer(["integration.ping"], async () => ({ ok: false, error: "flaky sink", retryable: true }));
    const event = await track(publish({ topic: "integration.ping", source: "test", payload: {} }));
    const outcome = await dispatchEvent(event.id);
    expect(outcome.status).toBe("rescheduled");
    const row = await db.integrationEventRecord.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain("flaky sink");
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("dead-letters non-retryable failures immediately", async () => {
    registerConsumer(["integration.ping"], async () => ({ ok: false, error: "schema mismatch", retryable: false }));
    const event = await track(publish({ topic: "integration.ping", source: "test", payload: {} }));
    const outcome = await dispatchEvent(event.id);
    expect(outcome.status).toBe("dead");
    const row = await db.integrationEventRecord.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.status).toBe("dead");
  });

  it("replays a dead-lettered event after the consumer recovers", async () => {
    let calls = 0;
    registerConsumer(["integration.ping"], async () => {
      calls += 1;
      return calls >= 2 ? { ok: true } : { ok: false, error: "transient", retryable: false };
    });
    const event = await track(publish({ topic: "integration.ping", source: "test", payload: {} }));
    expect((await dispatchEvent(event.id)).status).toBe("dead");
    const outcome = await replayEvent(event.id);
    expect(outcome.status).toBe("delivered");
    const row = await db.integrationEventRecord.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.status).toBe("delivered");
    expect(row.attempts).toBe(1);
  });

  it("refuses to dispatch events that are already terminal", async () => {
    const event = await track(publish({ topic: "integration.ping", source: "test", payload: {} }));
    await dispatchEvent(event.id);
    const outcome = await dispatchEvent(event.id);
    expect(outcome.status).toBe("skipped");
  });

  it("grows backoff monotonically with jitter bounds", () => {
    expect(backoffDelayMs(1)).toBeLessThan(backoffDelayMs(4));
    expect(backoffDelayMs(99)).toBeLessThanOrEqual(60_000);
  });
});

describe("Inbound webhook adapter", () => {
  // Sign with the secret the running deployment actually verifies against —
  // the documented demo default until SERIESIGHT_INBOUND_SECRET is rotated.
  const secret = inboundSecret();
  const payload = JSON.stringify({ ourTeamId: "C9", opponentTeamId: "NVX", result: "win", gameNumber: 2 });

  it("accepts a signed scrim result and publishes an inbound event", async () => {
    const receipt = await receiveInboundWebhook("scrim.result.recorded", payload, signPayload(secret, payload));
    createdEventIds.push(receipt.event.id);
    expect(receipt.verified).toBe(true);
    expect(receipt.event.topic).toBe("scrim.result.recorded");
    expect(receipt.event.direction).toBe("inbound");
    expect(receipt.event.payload.opponentTeamId).toBe("NVX");
    expect(receipt.event.payload.signatureVerified).toBe(true);
  });

  it("rejects missing or invalid signatures with 401 code", async () => {
    await expect(receiveInboundWebhook("scrim.result.recorded", payload, null)).rejects.toMatchObject({ code: "WEBHOOK_SIGNATURE_INVALID" });
    await expect(receiveInboundWebhook("scrim.result.recorded", payload, signPayload("wrong", payload))).rejects.toMatchObject({ code: "WEBHOOK_SIGNATURE_INVALID" });
  });

  it("rejects unknown topics and malformed payloads", async () => {
    const signed = signPayload(secret, payload);
    await expect(receiveInboundWebhook("not.a.topic", payload, signed)).rejects.toMatchObject({ code: "WEBHOOK_TOPIC_UNSUPPORTED" });
    await expect(receiveInboundWebhook("scrim.result.recorded", "{oops", signPayload(secret, "{oops"))).rejects.toMatchObject({ code: "WEBHOOK_PAYLOAD_INVALID" });
    await expect(
      receiveInboundWebhook("scrim.result.recorded", JSON.stringify({ result: "flawless" }), signPayload(secret, JSON.stringify({ result: "flawless" }))),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("validates schedule and ping topics", async () => {
    const schedule = JSON.stringify({ opponentTeamId: "TL", scheduledAt: new Date().toISOString(), format: "bo3" });
    const r1 = await receiveInboundWebhook("scrim.schedule.updated", schedule, signPayload(secret, schedule));
    createdEventIds.push(r1.event.id);
    expect(r1.event.payload.format).toBe("bo3");

    const ping = JSON.stringify({ message: "connectivity check" });
    const r2 = await receiveInboundWebhook("integration.ping", ping, signPayload(secret, ping));
    createdEventIds.push(r2.event.id);
    expect(r2.event.topic).toBe("integration.ping");
  });

  it("unwraps Seriesight delivery envelopes so echo loops stay hop-accounted", async () => {
    // Our own webhook sink delivers { id, topic, ..., payload: {..., __hopCount} }.
    const envelope = JSON.stringify({
      id: "evt-parent",
      topic: "integration.ping",
      source: "console:endpoint-test",
      direction: "outbound",
      correlationId: null,
      occurredAt: new Date().toISOString(),
      payload: { message: "echo", __hopCount: 1, __originEventId: "evt-parent" },
    });
    const r = await receiveInboundWebhook("integration.ping", envelope, signPayload(secret, envelope));
    createdEventIds.push(r.event.id);
    expect(r.verified).toBe(true);
    // The inner payload becomes the event payload — never a matryoshka envelope.
    expect(r.event.payload.message).toBe("echo");
    expect(r.event.payload.__hopCount).toBe(2);
    expect(r.event.payload.id).toBeUndefined();
  });

  it("exposes a stable inbound topic list", () => {
    expect(isInboundTopic("integration.ping")).toBe(true);
    expect(isInboundTopic("data.series.imported")).toBe(false);
  });
});

describe("Outbound URL policy", () => {
  it("allows https and loopback http, blocks plain-http external hosts", () => {
    expect(assertOutboundUrlAllowed("https://ops.example.com/hooks")).toEqual({ ok: true, host: "ops.example.com" });
    expect(assertOutboundUrlAllowed("http://localhost:3000/api/integration/ingest/integration.ping").ok).toBe(true);
    expect(assertOutboundUrlAllowed("http://127.0.0.1:8080/hook").ok).toBe(true);
    const blocked = assertOutboundUrlAllowed("http://ops.example.com/hooks");
    expect(blocked.ok).toBe(false);
    expect(assertOutboundUrlAllowed("not a url").ok).toBe(false);
  });
});

describe("File-drop adapter", () => {
  it("counts JSON arrays and nested record arrays", async () => {
    const json = JSON.stringify([{ gameId: "g1" }, { gameId: "g2" }, { gameId: "g3" }]);
    const r1 = await importFileDrop("nightly-export.json", json);
    createdEventIds.push(r1.event.id);
    expect(r1.summary.recordCount).toBe(3);
    expect(r1.summary.format).toBe("json");

    const nested = JSON.stringify({ datasetId: "d1", games: [{}, {}] });
    const r2 = await importFileDrop("batch.json", nested);
    createdEventIds.push(r2.event.id);
    expect(r2.summary.recordCount).toBe(2);
    expect(r2.summary.warnings.length).toBe(1);
  });

  it("parses CSV with header validation and skip warnings", async () => {
    const csv = "gameId,winner\ns1-g1,C9\ns1-g2,NVX\nbroken-row\n";
    const r = await importFileDrop("academy-scrims.csv", csv);
    createdEventIds.push(r.event.id);
    expect(r.summary.recordCount).toBe(2);
    expect(r.summary.warnings.some((w) => w.includes("Row 4"))).toBe(true);
    expect(r.event.topic).toBe("data.file.imported");
  });

  it("rejects malformed input with typed errors", async () => {
    await expect(importFileDrop("broken.json", "{not json")).rejects.toMatchObject({ code: "WEBHOOK_PAYLOAD_INVALID" });
    await expect(importFileDrop("empty.csv", "only,header\n")).rejects.toMatchObject({ code: "WEBHOOK_PAYLOAD_INVALID" });
  });
});

describe("CRM inbound seam (connector contract)", () => {
  it("accepts a signed commercial.lead.captured webhook from an external CRM", async () => {
    const secret = inboundSecret();
    const lead = JSON.stringify({
      leadId: "lead_test001",
      name: "Academy Scout",
      email: "scout@academy.example",
      org: "MENA Academy",
      source: "crm:website-form",
      notes: "Interested after the 14-day trial.",
      capturedAt: new Date().toISOString(),
      externalSystem: "crm-connector",
    });
    const receipt = await receiveInboundWebhook("commercial.lead.captured", lead, signPayload(secret, lead));
    createdEventIds.push(receipt.event.id);
    expect(receipt.verified).toBe(true);
    expect(receipt.event.direction).toBe("inbound");
    expect(receipt.event.payload.name).toBe("Academy Scout");
    expect(receipt.event.payload.signatureVerified).toBe(true);
  });

  it("rejects lead payloads without a valid email", async () => {
    const secret = inboundSecret();
    const bad = JSON.stringify({ name: "No Email", email: "not-an-email" });
    await expect(receiveInboundWebhook("commercial.lead.captured", bad, signPayload(secret, bad))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("Connector registry + background dispatch scheduler", () => {
  it("describes the paired connector services pointed at the Hub", () => {
    const descriptors = connectorDescriptors();
    expect(descriptors.map((d) => d.id)).toEqual([
      "connector:crm",
      "connector:scrim-scheduler",
      "connector:discord-alerts",
    ]);
    for (const d of descriptors) {
      expect(d.subscribedTopics.length).toBeGreaterThan(0);
      expect(d.healthPath).toBe("/health");
      expect(d.startScript).toMatch(/^connector:/);
    }
    expect(descriptors.find((d) => d.kind === "crm")?.ingestTopics).toContain("commercial.lead.captured");
    expect(descriptors.find((d) => d.kind === "scrim-scheduler")?.ingestTopics).toContain("scrim.result.recorded");
    const discord = descriptors.find((d) => d.kind === "discord-alerts");
    expect(discord?.ingestTopics).toEqual([]); // receive-only staff bot
    expect(discord?.subscribedTopics).toEqual([
      "scrim.schedule.updated",
      "scrim.result.recorded",
      "draft.session.finalized",
    ]);
  });

  it("reports scheduler status and stays disabled when the interval is zero", () => {
    const before = schedulerStatus();
    expect(before.started).toBe(false);
    const prev = process.env.SERIESIGHT_DISPATCH_INTERVAL_MS;
    process.env.SERIESIGHT_DISPATCH_INTERVAL_MS = "0";
    startDispatchScheduler();
    expect(schedulerStatus().disabled).toBe(true);
    startDispatchScheduler(); // idempotent — never double-arms
    expect(schedulerStatus().disabled).toBe(true);
    if (prev === undefined) delete process.env.SERIESIGHT_DISPATCH_INTERVAL_MS;
    else process.env.SERIESIGHT_DISPATCH_INTERVAL_MS = prev;
  });

  it("probes connector health without throwing when a connector is down", async () => {
    const statuses = await connectorStatuses();
    expect(statuses.length).toBe(3);
    for (const s of statuses) {
      expect(["up", "down"]).toContain(s.status);
      expect(s.checkedAt).toBeTruthy();
    }
  });
});
