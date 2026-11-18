/**
 * Seam registry — the machine-readable map of every connection point between
 * Seriesight and internal/external systems. Rendered by the Integration Hub
 * and exported for ops tooling. Producers (left) → bus (centre) → consumers
 * and sinks (right).
 */
import type { SeamDescriptor } from "./types";
import { INTEGRATION_TOPICS } from "./types";

export const SEAMS: SeamDescriptor[] = [
  // ── Production controllers (internal producers) ─────────────────────────
  {
    id: "controller:ingestion",
    name: "Ingestion Controller",
    kind: "controller",
    direction: "internal",
    protocol: "in-process",
    topics: ["data.series.imported", "data.provider.health"],
    description: "Publishes dataset-import completions and provider health after every staged import run.",
    availability: "live",
  },
  {
    id: "controller:draft",
    name: "Draft Controller",
    kind: "controller",
    direction: "internal",
    protocol: "in-process",
    topics: ["draft.session.finalized"],
    description: "Publishes draft-board completions so external systems can react to finalized drafts.",
    availability: "live",
  },
  {
    id: "controller:commercial",
    name: "Commercial Controller",
    kind: "controller",
    direction: "internal",
    protocol: "in-process",
    topics: ["commercial.lead.captured"],
    description: "Publishes trial/demo lead captures from the public site for CRM sinks.",
    availability: "live",
  },

  // ── Adapters (protocol translators on the boundary) ─────────────────────
  {
    id: "adapter:inbound-webhook",
    name: "Inbound Webhook Adapter",
    kind: "adapter",
    direction: "inbound",
    protocol: "HTTP POST + HMAC-SHA256",
    topics: ["scrim.result.recorded", "scrim.schedule.updated", "integration.ping"],
    description: "Receives signed webhooks from tournament platforms, scrim schedulers and academy systems.",
    availability: "live",
  },
  {
    id: "adapter:rest-polling",
    name: "REST Polling Adapter (GRID)",
    kind: "adapter",
    direction: "outbound",
    protocol: "HTTPS GraphQL",
    topics: ["data.provider.health"],
    description: "Pulls provider health and imports from GRID Central Data; publishes health events to the bus.",
    availability: "optional",
  },
  {
    id: "adapter:file-drop",
    name: "File Drop Adapter",
    kind: "adapter",
    direction: "inbound",
    protocol: "JSON / CSV",
    topics: ["data.file.imported"],
    description: "Batch-imports nightly exports and CSV hand-offs from internal systems.",
    availability: "live",
  },
  {
    id: "adapter:outbound-webhook",
    name: "Outbound Webhook Executor",
    kind: "adapter",
    direction: "outbound",
    protocol: "HTTPS POST + HMAC-SHA256",
    topics: [...INTEGRATION_TOPICS],
    description: "Delivers signed events to subscribed external endpoints with timeouts and a delivery ledger.",
    availability: "live",
  },

  // ── Consumers (internal processors) ─────────────────────────────────────
  {
    id: "consumer:audit",
    name: "Audit Consumer",
    kind: "consumer",
    direction: "internal",
    protocol: "all topics",
    topics: ["*"],
    description: "Appends every dispatched event to the JSONL audit trail.",
    availability: "live",
  },
  {
    id: "consumer:warehouse",
    name: "Warehouse Consumer",
    kind: "consumer",
    direction: "internal",
    protocol: "data.* topics",
    topics: ["data.series.imported", "data.provider.health", "data.file.imported"],
    description: "Projects data events into the BI warehouse stream.",
    availability: "live",
  },
  {
    id: "consumer:metrics",
    name: "Metrics Consumer",
    kind: "consumer",
    direction: "internal",
    protocol: "all topics",
    topics: ["*"],
    description: "Maintains per-topic counters for the Hub health tiles.",
    availability: "live",
  },
  {
    id: "consumer:notifications",
    name: "Notification Consumer",
    kind: "consumer",
    direction: "internal",
    protocol: "selected topics",
    topics: ["data.series.imported", "draft.session.finalized", "scrim.result.recorded", "scrim.schedule.updated", "commercial.lead.captured", "data.provider.health"],
    description: "Writes notable events to the in-app notification feed.",
    availability: "live",
  },
  {
    id: "consumer:evidence",
    name: "Evidence Refresh Consumer",
    kind: "consumer",
    direction: "internal",
    protocol: "data.* topics",
    topics: ["data.series.imported", "data.file.imported"],
    description: "Recomputes the evidence ledger after dataset imports so analytics stay provable.",
    availability: "live",
  },

  // ── Sinks (terminal destinations) ────────────────────────────────────────
  {
    id: "sink:webhook-fanout",
    name: "Webhook Fan-out Sink",
    kind: "sink",
    direction: "outbound",
    protocol: "HTTPS POST + HMAC-SHA256",
    topics: [...INTEGRATION_TOPICS],
    description: "Signed delivery to every registered external subscriber endpoint.",
    availability: "live",
  },
  {
    id: "sink:warehouse-jsonl",
    name: "Warehouse JSONL Sink",
    kind: "sink",
    direction: "outbound",
    protocol: "JSONL files",
    topics: ["data.series.imported", "data.provider.health", "data.file.imported"],
    description: "prisma/db/export/integration-warehouse.jsonl — one line per event for BI loads.",
    availability: "live",
  },
  {
    id: "sink:audit-jsonl",
    name: "Audit JSONL Sink",
    kind: "sink",
    direction: "outbound",
    protocol: "JSONL files",
    topics: ["*"],
    description: "prisma/db/export/integration-audit.jsonl — append-only compliance trail.",
    availability: "live",
  },
  {
    id: "sink:notification-feed",
    name: "Notification Feed Sink",
    kind: "sink",
    direction: "internal",
    protocol: "database rows",
    topics: ["data.series.imported", "draft.session.finalized", "scrim.result.recorded", "scrim.schedule.updated", "commercial.lead.captured", "data.provider.health"],
    description: "Persistent in-app notifications surfaced in the shell and the Hub.",
    availability: "live",
  },
];

export const TOPIC_CATALOGUE: { topic: string; label: string; producers: string[]; consumers: string[] }[] = INTEGRATION_TOPICS.map((topic) => ({
  topic,
  label: topic,
  producers: SEAMS.filter((s) => (s.kind === "controller" || s.kind === "adapter") && (s.direction !== "outbound" || s.id === "adapter:rest-polling") && s.topics.includes(topic)).map((s) => s.id),
  consumers: SEAMS.filter((s) => (s.kind === "consumer" || s.kind === "sink") && (s.topics.includes(topic) || s.topics.includes("*"))).map((s) => s.id),
}));
