/**
 * Event bus inspection + manual publishing — /api/integration/events
 *   GET  ?status=&topic=&limit=   — filterable event log (payloads included)
 *   POST { topic, payload }       — manual publish from the Hub console;
 *                                   restricted to the documented topic list.
 */
import { NextRequest } from "next/server";
import { ok, handler, parseBody, parseQuery, fail } from "@/lib/api/respond";
import { z } from "zod";
import { db } from "@/lib/db";
import { identityContext } from "@/lib/auth";
import { publish, isTopicKnown } from "@/lib/integration/bus";
import { ensureBusBootstrapped } from "@/lib/integration/bootstrap";
import { INTEGRATION_TOPICS, type IntegrationTopic } from "@/lib/integration/types";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z.enum(["pending", "processing", "delivered", "dead"]).optional(),
  topic: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = handler(async (req: NextRequest) => {
  ensureBusBootstrapped();
  const query = parseQuery(req, querySchema);
  const rows = await db.integrationEventRecord.findMany({
    where: {
      workspaceId: identityContext.getStore()?.workspaceId ?? "global",
      ...(query.status ? { status: query.status } : {}),
      ...(query.topic ? { topic: query.topic } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: query.limit,
  });
  return ok(
    {
      events: rows.map((row) => ({
        id: row.id,
        topic: row.topic,
        source: row.source,
        direction: row.direction,
        status: row.status,
        attempts: row.attempts,
        maxAttempts: row.maxAttempts,
        correlationId: row.correlationId,
        createdAt: row.createdAt.toISOString(),
        processedAt: row.processedAt?.toISOString() ?? null,
        lastError: row.lastError,
        payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
      })),
    },
    req,
  );
});

const publishSchema = z.object({
  topic: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const POST = handler(async (req: NextRequest) => {
  ensureBusBootstrapped();
  const body = await parseBody(req, publishSchema);
  if (!isTopicKnown(body.topic)) {
    return fail(
      {
        code: "WEBHOOK_TOPIC_UNSUPPORTED",
        message: `"${body.topic}" is not in the Seriesight topic catalogue.`,
        retryable: false,
        recovery: `Publish one of: ${INTEGRATION_TOPICS.join(", ")}.`,
      },
      req,
      404,
    );
  }
  const event = await publish({
    topic: body.topic as IntegrationTopic,
    source: "console:manual-publish",
    payload: body.payload as Record<string, unknown>,
    correlationId: null,
  });
  return ok({ eventId: event.id, topic: event.topic, status: event.status }, req, { note: "Event written to the outbox. Run the dispatch cycle to process it." });
});
