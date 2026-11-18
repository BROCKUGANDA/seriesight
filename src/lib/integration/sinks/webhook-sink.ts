/**
 * Outbound webhook sink — signed fan-out to registered subscriber endpoints.
 *
 * Safety properties (mirrors the GRID client's posture):
 *  • URL policy: https everywhere; plain http only for loopback hosts so local
 *    development loops (Seriesight → Seriesight) work without TLS.
 *  • Hard 8 s timeout per delivery attempt, two attempts per dispatch cycle.
 *  • Every attempt is journaled in IntegrationDeliveryRecord (status, status
 *    code, error) — the delivery ledger is the troubleshooting surface.
 *  • Endpoint success/failure counters feed the Integration Hub health tiles.
 *  • Only 2xx responses count as delivered; 4xx marks the delivery failed
 *    permanently for this cycle; 5xx/network errors are retryable via replay.
 */
import { db } from "@/lib/db";
import { signPayload } from "../hmac";
import type { IntegrationEvent } from "../types";

const TIMEOUT_MS = 8_000;
const ATTEMPTS_PER_CYCLE = 2;
/** Loop guard: payloads re-published by receivers carry __hopCount; fan-out stops at 2 hops. */
const MAX_HOPS = 2;

/** SSRF policy for outbound endpoints. */
export function assertOutboundUrlAllowed(rawUrl: string): { ok: true; host: string } | { ok: false; host: string; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, host: rawUrl, reason: "Malformed URL." };
  }
  const loopback = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);
  const isLoopbackHttp = parsed.protocol === "http:" && loopback.has(parsed.hostname);
  if (parsed.protocol !== "https:" && !isLoopbackHttp) {
    return {
      ok: false,
      host: parsed.hostname,
      reason: "Only https:// endpoints (or http:// loopback for local testing) are allowed.",
    };
  }
  return { ok: true, host: parsed.hostname };
}

function topicMatches(subscribed: string[], topic: string): boolean {
  if (subscribed.includes("*")) return true;
  return subscribed.includes(topic);
}

export interface FanOutSummary {
  endpointsMatched: number;
  delivered: number;
  failed: number;
}

/** Create delivery rows for every matching active endpoint, then attempt delivery. */
export async function fanOutWebhooks(event: IntegrationEvent): Promise<FanOutSummary> {
  const hop = Number((event.payload as Record<string, unknown>)?.__hopCount ?? 0);
  if (hop >= MAX_HOPS) {
    // Echo guard: this event originated from a receiver chain — stop the loop.
    return { endpointsMatched: 0, delivered: 0, failed: 0 };
  }
  const endpoints = await db.integrationEndpointRecord.findMany({ where: { status: "active" } });
  const matched = endpoints.filter((e) => topicMatches(JSON.parse(e.topicsJson) as string[], event.topic));
  const summary: FanOutSummary = { endpointsMatched: matched.length, delivered: 0, failed: 0 };

  for (const endpoint of matched) {
    const delivery = await db.integrationDeliveryRecord.create({
      data: { eventId: event.id, endpointId: endpoint.id },
    });
    const result = await deliverOnce(endpoint.url, endpoint.secret, event, hop);
    await db.integrationDeliveryRecord.update({
      where: { id: delivery.id },
      data: {
        attempts: result.attempts,
        status: result.ok ? "delivered" : "failed",
        lastStatusCode: result.statusCode,
        lastError: result.error ?? null,
        deliveredAt: result.ok ? new Date() : null,
      },
    });
    await db.integrationEndpointRecord.update({
      where: { id: endpoint.id },
      data: {
        successCount: result.ok ? { increment: 1 } : undefined,
        failureCount: result.ok ? undefined : { increment: 1 },
        lastDeliveryAt: new Date(),
        lastStatusCode: result.statusCode,
      },
    });
    if (result.ok) summary.delivered += 1;
    else summary.failed += 1;
  }
  return summary;
}

async function deliverOnce(
  url: string,
  secret: string,
  event: IntegrationEvent,
  hop: number,
): Promise<{ ok: boolean; attempts: number; statusCode: number | null; error?: string }> {
  const policy = assertOutboundUrlAllowed(url);
  if (!policy.ok) {
    return { ok: false, attempts: 0, statusCode: null, error: policy.reason };
  }
  const body = JSON.stringify({
    id: event.id,
    topic: event.topic,
    source: event.source,
    direction: event.direction,
    correlationId: event.correlationId,
    occurredAt: event.createdAt,
    payload: {
      ...event.payload,
      __originEventId: event.id,
      __hopCount: hop + 1,
    },
  });
  const signature = signPayload(secret, body);

  let lastError = "unknown delivery failure";
  let lastStatus: number | null = null;
  for (let attempt = 1; attempt <= ATTEMPTS_PER_CYCLE; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Seriesight-Integration/1.0",
          "x-seriesight-topic": event.topic,
          "x-seriesight-event-id": event.id,
          [ "x-seriesight-signature" ]: signature,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      lastStatus = res.status;
      if (res.status >= 200 && res.status < 300) return { ok: true, attempts: attempt, statusCode: res.status };
      // 4xx will not improve on retry within this cycle; stop early.
      if (res.status >= 400 && res.status < 500) {
        return { ok: false, attempts: attempt, statusCode: res.status, error: `Endpoint rejected the delivery (HTTP ${res.status}).` };
      }
      lastError = `Endpoint returned HTTP ${res.status}.`;
    } catch (err) {
      clearTimeout(timer);
      lastError =
        err instanceof Error && err.name === "AbortError"
          ? `Delivery timed out after ${TIMEOUT_MS} ms.`
          : `Delivery failed: ${err instanceof Error ? err.message : "unknown"}`;
    }
  }
  return { ok: false, attempts: ATTEMPTS_PER_CYCLE, statusCode: lastStatus, error: lastError };
}
