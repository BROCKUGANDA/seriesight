/**
 * Integration fabric — shared contracts.
 *
 * The fabric connects Seriesight to internal and external systems through
 * four kinds of seams:
 *   • Production controllers — authoritative producers that validate domain
 *     state and write events to the durable outbox.
 *   • Adapters — protocol translators on the boundary (inbound webhooks,
 *     REST polling, file drops, outbound webhook delivery).
 *   • Consumers — internal processors subscribed to topics (audit, metrics,
 *     notifications, evidence refresh).
 *   • Sinks — terminal destinations for event data (signed webhook fan-out,
 *     warehouse JSONL, notification feed).
 *
 * Every event traverses one bus with a single envelope so producers,
 * consumers and sinks stay decoupled and independently evolvable.
 */

/** Topic catalogue. Prefixes: `data.*`, `draft.*`, `scrim.*`, `commercial.*`, `integration.*`. */
export const INTEGRATION_TOPICS = [
  "data.series.imported",
  "data.provider.health",
  "data.file.imported",
  "draft.session.finalized",
  "scrim.result.recorded",
  "scrim.schedule.updated",
  "commercial.lead.captured",
  "commercial.payment.settled",
  "commercial.payment.refunded",
  "integration.ping",
] as const;

export type IntegrationTopic = (typeof INTEGRATION_TOPICS)[number];

export const TOPIC_LABELS: Record<IntegrationTopic, string> = {
  "data.series.imported": "Series dataset imported",
  "data.provider.health": "Provider health probe",
  "data.file.imported": "File drop imported",
  "draft.session.finalized": "Draft session finalized",
  "scrim.result.recorded": "Scrim result recorded",
  "scrim.schedule.updated": "Scrim schedule updated",
  "commercial.lead.captured": "Trial lead captured",
  "commercial.payment.settled": "On-chain payment settled",
  "commercial.payment.refunded": "Payment reversed / refunded",
  "integration.ping": "Connectivity ping",
};

export const INBOUND_TOPICS = [
  "scrim.result.recorded",
  "scrim.schedule.updated",
  "commercial.lead.captured", // external CRMs (connector mini-service) push leads through the inbound adapter
  "integration.ping",
] as const;
export type InboundTopic = (typeof INBOUND_TOPICS)[number];

export type IntegrationDirection = "internal" | "inbound" | "outbound";

export type EventStatus = "pending" | "processing" | "delivered" | "dead";

/** Uniform event envelope persisted in the outbox. */
export interface IntegrationEvent<T = Record<string, unknown>> {
  id: string;
  workspaceId: string;
  topic: IntegrationTopic;
  source: string;
  direction: IntegrationDirection;
  status: EventStatus;
  attempts: number;
  payload: T;
  correlationId: string | null;
  createdAt: string;
  processedAt: string | null;
  lastError: string | null;
}

export interface ConsumerResult {
  ok: boolean;
  error?: string;
  /** Retryable failures reschedule with exponential backoff; others dead-letter immediately. */
  retryable?: boolean;
}

export type ConsumerHandler = (event: IntegrationEvent) => Promise<ConsumerResult>;

export type SeamKind = "controller" | "adapter" | "consumer" | "sink";

/** Describes one seam for the Integration Hub map. */
export interface SeamDescriptor {
  id: string;
  name: string;
  kind: SeamKind;
  direction: "inbound" | "outbound" | "internal";
  protocol: string;
  topics: string[];
  description: string;
  /** `optional` seams need configuration (e.g. an API key) before they carry traffic. */
  availability: "live" | "optional";
}

export const OUTBOX_MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1_500;

/** Exponential backoff with jitter for retryable dispatch failures (capped at 60 s). */
export function backoffDelayMs(attempt: number): number {
  const base = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt - 1), 60_000);
  return Math.min(Math.round(base * (0.7 + Math.random() * 0.6)), 60_000);
}

/** Result of dispatching one outbox event through consumers + sinks. */
export interface DispatchOutcome {
  eventId: string;
  status: "delivered" | "dead" | "rescheduled" | "skipped";
  consumersRun: number;
  fanOut?: { endpointsMatched: number; delivered: number; failed: number };
  error?: string;
}
