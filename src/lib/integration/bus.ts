/**
 * Integration bus — durable outbox + dispatch engine.
 *
 * Flow: publish() writes an event row (the "seam" contract point), then
 * dispatchEvent() runs subscribed consumers and fans out to the webhook sink.
 * Failures follow enterprise integration semantics:
 *   • retryable failure  → attempts+1, nextAttemptAt = now + exponential backoff
 *   • attempts exhausted → status `dead` (dead-letter), visible + replayable in the Hub
 *   • success            → status `delivered`, webhook fan-out, processedAt stamped
 *
 * The registry lives on `globalThis` so consumer registration survives dev
 * route-module reloads (same pattern as the Prisma client and GRID breaker).
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { INTEGRATION_TOPICS, OUTBOX_MAX_ATTEMPTS, backoffDelayMs, type ConsumerHandler, type DispatchOutcome, type IntegrationEvent, type IntegrationTopic } from "./types";
import { fanOutWebhooks } from "./sinks/webhook-sink";

interface BusRegistry {
  consumers: Map<string, ConsumerHandler[]>;
  booted: boolean;
  metrics: { total: number; byTopic: Record<string, number>; lastEventAt: string | null };
}

const global_ = globalThis as unknown as { __seriesightBus?: BusRegistry };

function registry(): BusRegistry {
  global_.__seriesightBus ??= { consumers: new Map(), booted: false, metrics: { total: 0, byTopic: {}, lastEventAt: null } };
  return global_.__seriesightBus;
}

/** Subscribe a consumer. Pass `["*"]` (or "*") to receive every topic. */
export function registerConsumer(topics: readonly string[] | "*", handler: ConsumerHandler): void {
  const reg = registry();
  const keys = topics === "*" ? ["*"] : topics;
  for (const key of keys) {
    const list = reg.consumers.get(key) ?? [];
    list.push(handler);
    reg.consumers.set(key, list);
  }
}

export function consumersFor(topic: string): ConsumerHandler[] {
  const reg = registry();
  return [...(reg.consumers.get("*") ?? []), ...(reg.consumers.get(topic) ?? [])];
}

export function busMetrics(): BusRegistry["metrics"] {
  return { ...registry().metrics };
}

export function isBusBootstrapped(): boolean {
  return registry().booted;
}

export function markBusBootstrapped(): void {
  registry().booted = true;
}

/** Test hook: clear the consumer registry between unit tests. */
export function resetBusForTests(): void {
  const reg = registry();
  reg.consumers.clear();
  reg.booted = false;
}

export function isTopicKnown(topic: string): topic is IntegrationTopic {
  return (INTEGRATION_TOPICS as readonly string[]).includes(topic);
}

/** Publish an event to the outbox. Throws on unknown topics (producer bug). */
export async function publish(input: {
  topic: IntegrationTopic;
  source: string;
  payload: Record<string, unknown>;
  direction?: "internal" | "inbound";
  correlationId?: string | null;
}): Promise<IntegrationEvent> {
  if (!isTopicKnown(input.topic)) {
    throw new Error(`Unknown integration topic: ${input.topic}`);
  }
  const row = await db.integrationEventRecord.create({
    data: {
      topic: input.topic,
      source: input.source,
      direction: input.direction ?? "internal",
      payloadJson: JSON.stringify(input.payload),
      correlationId: input.correlationId ?? null,
    },
  });
  const reg = registry();
  reg.metrics.total += 1;
  reg.metrics.byTopic[input.topic] = (reg.metrics.byTopic[input.topic] ?? 0) + 1;
  reg.metrics.lastEventAt = row.createdAt.toISOString();
  return rowToEvent(row, input.payload);
}

type EventRow = Awaited<ReturnType<typeof db.integrationEventRecord.findUniqueOrThrow>>;

export function rowToEvent(row: NonNullable<EventRow>, payload: Record<string, unknown>): IntegrationEvent {
  return {
    id: row.id,
    topic: row.topic as IntegrationTopic,
    source: row.source,
    direction: row.direction as IntegrationEvent["direction"],
    status: row.status as IntegrationEvent["status"],
    attempts: row.attempts,
    payload,
    correlationId: row.correlationId,
    createdAt: row.createdAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    lastError: row.lastError,
  };
}

/** Dispatch one outbox event: consumers first, then webhook fan-out on success. */
export async function dispatchEvent(eventId: string): Promise<DispatchOutcome> {
  const row = await db.integrationEventRecord.findUnique({ where: { id: eventId } });
  if (!row) return { eventId, status: "skipped", consumersRun: 0, error: "event not found" };
  if (row.status === "delivered" || row.status === "dead" || row.status === "processing") {
    return { eventId, status: "skipped", consumersRun: 0 };
  }

  const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
  const event = rowToEvent(row, payload);
  const handlers = consumersFor(event.topic);

  await db.integrationEventRecord.update({ where: { id: eventId }, data: { status: "processing", attempts: { increment: 1 } } });
  event.attempts += 1;

  let consumersRun = 0;
  for (const handler of handlers) {
    try {
      const result = await handler(event);
      consumersRun += 1;
      if (!result.ok) {
        const retryable = result.retryable ?? false;
        const exhausted = event.attempts >= OUTBOX_MAX_ATTEMPTS;
        if (retryable && !exhausted) {
          const nextAttemptAt = new Date(Date.now() + backoffDelayMs(event.attempts));
          await db.integrationEventRecord.update({
            where: { id: eventId },
            data: { status: "pending", lastError: result.error ?? "consumer failed", nextAttemptAt },
          });
          return { eventId, status: "rescheduled", consumersRun, error: result.error };
        }
        await db.integrationEventRecord.update({
          where: { id: eventId },
          data: { status: "dead", lastError: result.error ?? "consumer failed (non-retryable)", processedAt: new Date() },
        });
        return { eventId, status: "dead", consumersRun, error: result.error };
      }
    } catch (err) {
      // A throwing consumer is treated as retryable — infrastructure faults
      // (DB blips, fs errors) should reschedule, not dead-letter outright.
      const message = err instanceof Error ? err.message : "consumer threw";
      const exhausted = event.attempts >= OUTBOX_MAX_ATTEMPTS;
      if (!exhausted) {
        await db.integrationEventRecord.update({
          where: { id: eventId },
          data: { status: "pending", lastError: message, nextAttemptAt: new Date(Date.now() + backoffDelayMs(event.attempts)) },
        });
        return { eventId, status: "rescheduled", consumersRun, error: message };
      }
      await db.integrationEventRecord.update({
        where: { id: eventId },
        data: { status: "dead", lastError: message, processedAt: new Date() },
      });
      return { eventId, status: "dead", consumersRun, error: message };
    }
  }

  // All consumers accepted the event — mark delivered, then fan out to
  // outbound webhook subscribers in the background. Delivery must never run
  // inside the publishing request stack: a self-referential endpoint (the Hub's
  // loop receiver) would re-enter the server and deadlock single-threaded
  // runtimes. Outcomes are journaled in the delivery ledger either way.
  await db.integrationEventRecord.update({
    where: { id: eventId },
    data: { status: "delivered", processedAt: new Date(), lastError: null },
  });
  setTimeout(() => {
    void fanOutWebhooks(event).catch((err: unknown) => {
      console.error("[seriesight] background webhook fan-out failed:", err instanceof Error ? err.message : err);
    });
  }, 25);
  return { eventId, status: "delivered", consumersRun };
}

/** Worker tick: dispatch every due pending event. Called by routes (inline drain) and the Hub button. */
export async function dispatchPending(limit = 25): Promise<{ scanned: number; delivered: number; rescheduled: number; dead: number }> {
  const due = await db.integrationEventRecord.findMany({
    where: { status: "pending", nextAttemptAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  const tally = { scanned: due.length, delivered: 0, rescheduled: 0, dead: 0 };
  for (const { id } of due) {
    const outcome = await dispatchEvent(id);
    if (outcome.status === "delivered") tally.delivered += 1;
    else if (outcome.status === "rescheduled") tally.rescheduled += 1;
    else if (outcome.status === "dead") tally.dead += 1;
  }
  return tally;
}

/** Publish then immediately dispatch this single event (inline drain for demo immediacy). */
export async function publishAndDispatch(input: Parameters<typeof publish>[0]): Promise<{ event: IntegrationEvent; outcome: DispatchOutcome }> {
  const event = await publish(input);
  const outcome = await dispatchEvent(event.id);
  // Reflect the post-dispatch status on the returned envelope (dispatch mutates
  // the row; the captured object is stale otherwise).
  if (outcome.status === "delivered" || outcome.status === "dead") event.status = outcome.status;
  return { event, outcome };
}

/** Reset a dead/pending event for replay. */
export async function replayEvent(eventId: string): Promise<DispatchOutcome> {
  const row = await db.integrationEventRecord.findUnique({ where: { id: eventId } });
  if (!row) throw new Error("event not found");
  if (row.status !== "dead" && row.status !== "pending") {
    throw new Error(`only pending or dead events can be replayed (event is ${row.status})`);
  }
  await db.integrationEventRecord.update({
    where: { id: eventId },
    data: { status: "pending", attempts: 0, lastError: null, nextAttemptAt: new Date() },
  });
  return dispatchEvent(eventId);
}

export function newCorrelationId(): string {
  return randomUUID();
}
