/**
 * Outbound webhook adapter — the seam Seriesight pushes through.
 * Delivery execution lives in the webhook sink (signed POST, timeout,
 * delivery ledger); this module is the seam identity + management helpers
 * used by the Integration Hub endpoints API.
 */
import { db } from "@/lib/db";
import { identityContext } from "@/lib/auth";
import { generateEndpointSecret, maskSecret } from "../hmac";
import { assertOutboundUrlAllowed } from "../sinks/webhook-sink";
import { INTEGRATION_TOPICS } from "../types";
import { ERRORS } from "@/domain/errors";

export interface EndpointView {
  id: string;
  label: string;
  url: string;
  topics: string[];
  status: string;
  secretPreview: string;
  successCount: number;
  failureCount: number;
  lastDeliveryAt: string | null;
  lastStatusCode: number | null;
  createdAt: string;
}

function toView(row: {
  id: string;
  label: string;
  url: string;
  secret: string;
  topicsJson: string;
  status: string;
  successCount: number;
  failureCount: number;
  lastDeliveryAt: Date | null;
  lastStatusCode: number | null;
  createdAt: Date;
}): EndpointView {
  return {
    id: row.id,
    label: row.label,
    url: row.url,
    topics: JSON.parse(row.topicsJson) as string[],
    status: row.status,
    secretPreview: maskSecret(row.secret),
    successCount: row.successCount,
    failureCount: row.failureCount,
    lastDeliveryAt: row.lastDeliveryAt?.toISOString() ?? null,
    lastStatusCode: row.lastStatusCode,
    createdAt: row.createdAt.toISOString(),
  };
}

function tenantId(): string {
  return identityContext.getStore()?.workspaceId ?? "global";
}

export async function listEndpoints(): Promise<EndpointView[]> {
  const rows = await db.integrationEndpointRecord.findMany({
    where: { workspaceId: tenantId() },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toView);
}

export async function createEndpoint(input: { label: string; url: string; topics: string[]; secret?: string }): Promise<EndpointView & { secret: string }> {
  const policy = assertOutboundUrlAllowed(input.url);
  if (!policy.ok) throw ERRORS.endpointBlocked(policy.host);
  const unknown = input.topics.filter((t) => t !== "*" && !(INTEGRATION_TOPICS as readonly string[]).includes(t));
  if (unknown.length > 0) throw ERRORS.validation(`Unknown topics: ${unknown.join(", ")}.`);
  if (input.topics.length === 0) throw ERRORS.validation("Subscribe the endpoint to at least one topic (or [*] for all).");

  const secret = input.secret?.trim() || generateEndpointSecret();
  const row = await db.integrationEndpointRecord.create({
    data: {
      workspaceId: tenantId(),
      label: input.label,
      url: input.url,
      secret,
      topicsJson: JSON.stringify(input.topics),
      status: "active",
    },
  });
  // The full secret is returned exactly once, at creation time.
  return { ...toView(row), secret };
}

export async function updateEndpoint(id: string, patch: { label?: string; status?: "active" | "paused"; topics?: string[] }): Promise<EndpointView> {
  const row = await db.integrationEndpointRecord.findFirst({ where: { id, workspaceId: tenantId() } });
  if (!row) throw ERRORS.notFound("Integration endpoint");
  if (patch.topics) {
    const unknown = patch.topics.filter((t) => t !== "*" && !(INTEGRATION_TOPICS as readonly string[]).includes(t));
    if (unknown.length > 0) throw ERRORS.validation(`Unknown topics: ${unknown.join(", ")}.`);
    if (patch.topics.length === 0) throw ERRORS.validation("Subscribe the endpoint to at least one topic (or [*] for all).");
  }
  const updated = await db.integrationEndpointRecord.update({
    where: { id },
    data: {
      label: patch.label ?? row.label,
      status: patch.status ?? row.status,
      topicsJson: patch.topics ? JSON.stringify(patch.topics) : row.topicsJson,
    },
  });
  return toView(updated);
}

export async function deleteEndpoint(id: string): Promise<void> {
  const row = await db.integrationEndpointRecord.findFirst({ where: { id, workspaceId: tenantId() }, select: { id: true } });
  if (!row) throw ERRORS.notFound("Integration endpoint");
  await db.integrationEndpointRecord.delete({ where: { id } });
}
