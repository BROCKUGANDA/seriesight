/**
 * Integration Hub overview — GET /api/integration/overview
 * One call that feeds the whole workspace: seam map, bus stats, recent
 * events, endpoint health, notification feed and the inbound webhook guide.
 * Secrets are always masked; the inbound demo secret is only revealed while
 * the deployment still runs on the documented default.
 */
import { NextRequest } from "next/server";
import { ok, handler } from "@/lib/api/respond";
import { db } from "@/lib/db";
import { identityContext } from "@/lib/auth";
import { ensureBusBootstrapped, integrationMetrics } from "@/lib/integration/bootstrap";
import { SEAMS, TOPIC_CATALOGUE } from "@/lib/integration/registry";
import { INBOUND_TOPICS, TOPIC_LABELS, INTEGRATION_TOPICS } from "@/lib/integration/types";
import { inboundSecret, inboundSecretIsDefault, SIGNATURE_HEADER, maskSecret } from "@/lib/integration/hmac";
import { WAREHOUSE_PATHS } from "@/lib/integration/sinks/warehouse-sink";
import { assertOutboundUrlAllowed } from "@/lib/integration/sinks/webhook-sink";
import { schedulerStatus } from "@/lib/integration/scheduler";
import { connectorStatuses } from "@/lib/integration/connectors";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  ensureBusBootstrapped();

  const workspaceId = identityContext.getStore()?.workspaceId ?? "global";
  const [statusCounts, recent, endpoints, notifications, deliveries] = await Promise.all([
    db.integrationEventRecord.groupBy({ by: ["status"], where: { workspaceId }, _count: { _all: true } }),
    db.integrationEventRecord.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.integrationEndpointRecord.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } }),
    db.integrationNotificationRecord.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 12 }),
    db.integrationDeliveryRecord.findMany({
      where: { event: { workspaceId } },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { endpoint: { select: { label: true } } },
    }),
  ]);

  const counts = { pending: 0, processing: 0, delivered: 0, dead: 0 };
  for (const group of statusCounts) {
    counts[group.status as keyof typeof counts] = group._count._all;
  }

  const topics = [...INTEGRATION_TOPICS].map((topic) => {
    const catalogue = TOPIC_CATALOGUE.find((t) => t.topic === topic);
    return { topic, label: TOPIC_LABELS[topic], producers: catalogue?.producers ?? [], consumers: catalogue?.consumers ?? [] };
  });

  return ok(
    {
      seams: SEAMS,
      topics,
      scheduler: schedulerStatus(),
      connectors: await connectorStatuses(),
      bus: {
        counts,
        metrics: integrationMetrics(),
        workerHint: "Dispatch is inline per route call, the background scheduler tick (see status below) and the Run dispatch cycle button; retries use exponential backoff and dead-letter after 5 attempts.",
      },
      events: recent.map((row) => ({
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
        payloadPreview: (() => {
          try {
            const parsed = JSON.parse(row.payloadJson) as Record<string, unknown>;
            const keys = Object.keys(parsed).slice(0, 4);
            return keys.map((k) => `${k}=${String(parsed[k]).slice(0, 42)}`).join(" · ");
          } catch {
            return "";
          }
        })(),
      })),
      endpoints: endpoints.map((row) => ({
        id: row.id,
        label: row.label,
        url: row.url,
        topics: JSON.parse(row.topicsJson) as string[],
        status: row.status,
        urlPolicy: assertOutboundUrlAllowed(row.url),
        secretPreview: maskSecret(row.secret),
        successCount: row.successCount,
        failureCount: row.failureCount,
        lastDeliveryAt: row.lastDeliveryAt?.toISOString() ?? null,
        lastStatusCode: row.lastStatusCode,
        createdAt: row.createdAt.toISOString(),
      })),
      deliveries: deliveries.map((d) => ({
        id: d.id,
        eventId: d.eventId,
        endpointLabel: d.endpoint.label,
        status: d.status,
        attempts: d.attempts,
        lastStatusCode: d.lastStatusCode,
        lastError: d.lastError,
        createdAt: d.createdAt.toISOString(),
        deliveredAt: d.deliveredAt?.toISOString() ?? null,
      })),
      notifications,
      inbound: {
        topics: INBOUND_TOPICS,
        headerName: SIGNATURE_HEADER,
        secretIsDocumentedDefault: inboundSecretIsDefault(),
        secret: inboundSecretIsDefault() ? inboundSecret() : null,
        secretPreview: maskSecret(inboundSecret()),
        paths: Object.fromEntries(INBOUND_TOPICS.map((t) => [t, `/api/integration/ingest/${t}`])),
      },
      sinks: {
        auditPath: "prisma/db/export/integration-audit.jsonl",
        warehousePath: "prisma/db/export/integration-warehouse.jsonl",
        resolvedDir: WAREHOUSE_PATHS.exportDir,
      },
    },
    req,
  );
});
