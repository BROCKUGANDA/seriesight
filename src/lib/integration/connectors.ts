/**
 * Connector registry — the real external systems currently pointed at the Hub.
 *
 * Each entry describes an independently-running service (see mini-services/)
 * that pushes signed webhooks into the Hub and receives Hub fan-out deliveries.
 * The overview endpoint probes every /health on demand with a short timeout so
 * the Integration Hub always shows live up/down status, never stale guesses.
 */

export interface ConnectorDescriptor {
  id: string;
  name: string;
  kind: "crm" | "scrim-scheduler" | "discord-alerts";
  baseUrl: string;
  /** Topics this connector publishes INTO the Hub (empty for receive-only systems). */
  ingestTopics: string[];
  /** Topics the Hub fans out TO this connector. */
  subscribedTopics: string[];
  healthPath: string;
  inboundSeamId: string;
  /** bun script that starts the connector (used in the down-state hint). */
  startScript: string;
}

export interface ConnectorStatus extends ConnectorDescriptor {
  status: "up" | "down";
  detail: string | null;
  checkedAt: string;
}

const ENV_URLS = {
  crm: process.env.SERIESIGHT_CRM_URL ?? "http://127.0.0.1:4001",
  "scrim-scheduler": process.env.SERIESIGHT_SCRIM_URL ?? "http://127.0.0.1:4002",
  "discord-alerts": process.env.SERIESIGHT_DISCORD_URL ?? "http://127.0.0.1:4003",
} as const;

export function connectorDescriptors(): ConnectorDescriptor[] {
  return [
    {
      id: "connector:crm",
      name: "CRM Connector",
      kind: "crm",
      baseUrl: ENV_URLS.crm,
      ingestTopics: ["commercial.lead.captured"],
      subscribedTopics: ["commercial.lead.captured", "draft.session.finalized"],
      healthPath: "/health",
      inboundSeamId: "adapter:inbound-webhook",
      startScript: "connector:crm",
    },
    {
      id: "connector:scrim-scheduler",
      name: "Scrim Scheduler Connector",
      kind: "scrim-scheduler",
      baseUrl: ENV_URLS["scrim-scheduler"],
      ingestTopics: ["scrim.schedule.updated", "scrim.result.recorded"],
      subscribedTopics: ["scrim.schedule.updated", "scrim.result.recorded", "draft.session.finalized"],
      healthPath: "/health",
      inboundSeamId: "adapter:inbound-webhook",
      startScript: "connector:scrim",
    },
    {
      // Receive-only: the staff Discord bot consumes scrim + draft events.
      // Its Hub-side seam is the outbound-webhook adapter (Hub → Discord).
      id: "connector:discord-alerts",
      name: "Discord Alerts Connector",
      kind: "discord-alerts",
      baseUrl: ENV_URLS["discord-alerts"],
      ingestTopics: [],
      subscribedTopics: ["scrim.schedule.updated", "scrim.result.recorded", "draft.session.finalized"],
      healthPath: "/health",
      inboundSeamId: "adapter:outbound-webhook",
      startScript: "connector:discord",
    },
  ];
}

async function probe(conn: ConnectorDescriptor): Promise<ConnectorStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_500);
  try {
    const res = await fetch(`${conn.baseUrl}${conn.healthPath}`, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const up = res.status === 200 && json?.status === "up";
    return {
      ...conn,
      status: up ? "up" : "down",
      detail: up ? `healthy — ${String(json?.service ?? conn.id)}` : `health endpoint answered HTTP ${res.status}`,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      ...conn,
      status: "down",
      detail: `no response — start it with \`bun run ${conn.startScript}\``,
      checkedAt: new Date().toISOString(),
    };
  }
}

/** Probe every connector in parallel; never throws (down is a valid state). */
export async function connectorStatuses(): Promise<ConnectorStatus[]> {
  return Promise.all(connectorDescriptors().map(probe));
}
