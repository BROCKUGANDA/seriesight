/**
 * Integration consumers — internal processors subscribed to bus topics.
 *
 * Each consumer is small, idempotent where practical, and returns a typed
 * result so the bus can distinguish retryable infrastructure faults from
 * permanent failures. Sinks (webhook fan-out, JSONL warehouse, notifications)
 * are reached through consumers or the bus itself, never directly by routes.
 */
import { db } from "@/lib/db";
import { identityContext } from "@/lib/auth";
import type { ConsumerResult, IntegrationEvent } from "../types";
import { TOPIC_LABELS } from "../types";
import { appendAuditLine, appendWarehouseLine } from "../sinks/warehouse-sink";
import { createNotification, pruneNotifications } from "../sinks/notification-sink";

type Handler = (event: IntegrationEvent) => Promise<ConsumerResult>;
const ok: ConsumerResult = { ok: true };

/** Audit consumer — every topic; append-only JSONL trail (compliance seam). */
export const auditConsumer: Handler = async (event) => {
  try {
    await appendAuditLine(event);
    return ok;
  } catch (err) {
    return { ok: false, error: `audit sink unavailable: ${err instanceof Error ? err.message : "unknown"}`, retryable: true };
  }
};

/** Warehouse consumer — `data.*` topics only; BI-ready JSONL projection. */
export const warehouseConsumer: Handler = async (event) => {
  try {
    await appendWarehouseLine(event);
    return ok;
  } catch (err) {
    return { ok: false, error: `warehouse sink unavailable: ${err instanceof Error ? err.message : "unknown"}`, retryable: true };
  }
};

/** Metrics consumer — every topic; in-memory counters for the Hub tiles. */
export const metricsConsumer: Handler = async () => ok;

const NOTIFICATION_RULES: Partial<Record<string, { severity: "info" | "success" | "warning" | "error"; title: (p: Record<string, unknown>) => string; body: (p: Record<string, unknown>) => string }>> = {
  "data.series.imported": {
    severity: "success",
    title: (p) => `Dataset refreshed — ${Number(p.seriesCount ?? 0)} series · ${Number(p.gameCount ?? 0)} games`,
    body: (p) => `${TOPIC_LABELS["data.series.imported"]} via ${String(p.provider ?? "fixture")}. Scouting and macro analytics now reflect the new games.`,
  },
  "draft.session.finalized": {
    severity: "info",
    title: (p) => `Draft finalized — ${String(p.ourTeamId ?? "our team")} vs ${String(p.opponentTeamId ?? "opponent")}`,
    body: () => "The draft board reached completion. Fearless restrictions propagated to later games in the series.",
  },
  "scrim.result.recorded": {
    severity: "info",
    title: (p) => `Scrim result recorded — ${String(p.result ?? "unknown").toUpperCase()} vs ${String(p.opponentTeamId ?? "opponent")}`,
    body: (p) => `Inbound webhook accepted from ${String(p.externalSystem ?? "external system")}. Results feed practice reviews and opponent profiles.`,
  },
  "scrim.schedule.updated": {
    severity: "info",
    title: (p) => `Scrim schedule updated — ${String(p.opponentTeamId ?? "opponent")} at ${String(p.scheduledAt ?? "TBD")}`,
    body: () => "An external scheduling system pushed an update through the inbound webhook seam.",
  },
  "commercial.lead.captured": {
    severity: "info",
    title: (p) => `New trial lead — ${String(p.name ?? p.organization ?? "unknown contact")}`,
    body: (p) =>
      `Lead from ${String(p.source ?? p.plan ?? "the public site")}${p.email ? ` (${String(p.email)})` : ""}${
        p.org ? ` at ${String(p.org)}` : ""
      }${p.externalSystem ? ` via ${String(p.externalSystem)}` : ""}. Follow up from the CRM sink or export stream.`,
  },
  "data.provider.health": {
    severity: "warning",
    title: (p) => `Provider health: ${String(p.status ?? "unknown")}`,
    body: (p) => `REST polling adapter probed ${String(p.provider ?? "provider")} — ${String(p.detail ?? "")}`,
  },
};

/** Notification consumer — maps notable topics to the in-app feed. */
export const notificationConsumer: Handler = async (event) => {
  const rule = NOTIFICATION_RULES[event.topic];
  if (!rule) return ok;
  try {
    await createNotification({
      workspaceId: event.workspaceId,
      topic: event.topic,
      severity: rule.severity,
      title: rule.title(event.payload),
      body: rule.body(event.payload),
    });
    await pruneNotifications(event.workspaceId);
    return ok;
  } catch (err) {
    return { ok: false, error: `notification sink unavailable: ${err instanceof Error ? err.message : "unknown"}`, retryable: true };
  }
};

/** Evidence consumer — recomputes the evidence ledger after a dataset import. */
export const evidenceRefreshConsumer: Handler = async (event) => {
  if (event.topic !== "data.series.imported") return ok;
  try {
    // Imported lazily to avoid a circular import with the fixtures module graph.
    const { ScoutingContext, buildInsights } = await import("@/domain/analytics/scouting-context");
    const { registerLedgerRecords } = await import("@/services/evidence");
    const { TEAMS } = await import("@/fixtures/teams");
    for (const team of TEAMS) {
      const ctx = new ScoutingContext(team.id);
      buildInsights(ctx);
      registerLedgerRecords(ctx.ledger);
    }
    return ok;
  } catch (err) {
    return { ok: false, error: `evidence refresh failed: ${err instanceof Error ? err.message : "unknown"}`, retryable: true };
  }
};

/** Unread notification count for the shell badge. */
export async function unreadNotificationCount(): Promise<number> {
  const workspaceId = identityContext.getStore()?.workspaceId ?? "global";
  return db.integrationNotificationRecord.count({ where: { read: false, workspaceId } });
}
