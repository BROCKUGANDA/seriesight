/**
 * Inbound webhook adapter — the seam external systems push through.
 *
 * Contract for callers (tournament platforms, scrim schedulers, academy LMS):
 *   POST /api/integration/ingest/<topic>
 *   x-seriesight-signature: sha256=<hex HMAC-SHA256 of the raw body with the
 *   shared inbound secret>
 *
 * The adapter verifies the signature timing-safely, validates + normalizes the
 * payload per topic, enriches it with Seriesight context (known-team lookup),
 * and publishes an `inbound` event to the outbox. It never trusts client-side
 * timestamps as authoritative and never echoes secrets.
 */
import { z } from "zod";
import { publishAndDispatch } from "../bus";
import { verifySignature, inboundSecret } from "../hmac";
import { INBOUND_TOPICS, type InboundTopic, type IntegrationEvent, type DispatchOutcome } from "../types";
import { AppError, ERRORS } from "@/domain/errors";

export function isInboundTopic(topic: string): topic is InboundTopic {
  return (INBOUND_TOPICS as readonly string[]).includes(topic);
}

const isoDate = z.string().datetime({ offset: true }).or(z.string().min(8));

export const INBOUND_SCHEMAS = {
  "scrim.result.recorded": z
    .object({
      ourTeamId: z.string().trim().min(1).max(40).default("C9"),
      opponentTeamId: z.string().trim().min(1).max(40),
      result: z.enum(["win", "loss", "draw"]),
      gameNumber: z.number().int().min(1).max(7).optional(),
      patch: z.string().trim().max(16).optional(),
      tournament: z.string().trim().max(120).optional(),
      playedAt: isoDate.optional(),
      notes: z.string().trim().max(600).optional(),
      externalSystem: z.string().trim().max(80).optional(),
    })
    .strict(),
  "scrim.schedule.updated": z
    .object({
      ourTeamId: z.string().trim().min(1).max(40).default("C9"),
      opponentTeamId: z.string().trim().min(1).max(40),
      scheduledAt: isoDate,
      format: z.enum(["bo1", "bo3", "bo5"]).default("bo3"),
      notes: z.string().trim().max(600).optional(),
      externalSystem: z.string().trim().max(80).optional(),
    })
    .strict(),
  "integration.ping": z
    .object({ message: z.string().trim().max(200).optional() })
    .passthrough(), // passthrough: deliveries echoed back carry __hopCount control keys
} as const;

export interface InboundReceipt {
  event: IntegrationEvent;
  outcome: DispatchOutcome;
  verified: boolean;
}

/** Verify + normalize + publish an inbound webhook. Throws typed AppErrors. */
export async function receiveInboundWebhook(topic: string, rawBody: string, signatureHeader: string | null): Promise<InboundReceipt> {
  if (!isInboundTopic(topic)) throw ERRORS.webhookTopicUnsupported(topic);

  const verified = verifySignature(inboundSecret(), rawBody, signatureHeader);
  if (!verified) throw ERRORS.webhookSignatureInvalid();

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw ERRORS.webhookPayloadInvalid("The request body is not valid JSON.");
  }

  // Seriesight's own deliveries arrive wrapped in the Seriesight envelope
  // ({ id, topic, ..., payload }); external systems send the topic payload
  // directly. Unwrap our envelope so hop accounting reads the right counter
  // and the matryoshka never nests.
  const isOwnEnvelope = (o: unknown): o is Record<string, unknown> =>
    o !== null && typeof o === "object" && "payload" in o && "topic" in o && "id" in o && (o as Record<string, unknown>).topic === topic;
  const rawPayload = isOwnEnvelope(parsed) ? (parsed.payload as Record<string, unknown>) : (parsed as Record<string, unknown>);
  if (rawPayload === null || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    throw ERRORS.webhookPayloadInvalid("The webhook payload must be a JSON object.");
  }

  // Echo-loop accounting: read the hop counter the webhook sink injected into
  // the inner payload, then republish with hop+1 (the bus stops fanning out
  // at MAX_HOPS).
  const hopCount = Number(rawPayload.__hopCount ?? 0) + 1;
  delete rawPayload.__hopCount;
  delete rawPayload.__originEventId;

  let payload: Record<string, unknown>;
  try {
    payload = INBOUND_SCHEMAS[topic].parse(rawPayload) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw ERRORS.validation(
        `Webhook payload failed schema validation for "${topic}".`,
        { issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      );
    }
    throw err;
  }

  const { event, outcome } = await publishAndDispatch({
    topic,
    source: `adapter:inbound-webhook:${topic}`,
    direction: "inbound",
    correlationId: typeof payload.externalSystem === "string" ? `ext:${payload.externalSystem}` : null,
    payload: { ...payload, __hopCount: hopCount, receivedAt: new Date().toISOString(), signatureVerified: true },
  });
  return { event, outcome, verified };
}

export class InboundWebhookError extends AppError {}
