/**
 * Warehouse sink — terminal JSONL destinations for integration events.
 *
 * Two streams:
 *  • audit stream      — every dispatched event (compliance / traceability)
 *  • warehouse stream  — `data.*` topic payloads for BI tools (one JSON object
 *                        per line, ready for DuckDB/BigQuery/Snowflake loads)
 *
 * Files live under `prisma/db/export/` next to the SQLite database so the
 * whole deployment ships as one directory.
 */
import { appendFile, mkdir } from "fs/promises";
import path from "path";
import type { IntegrationEvent } from "../types";

/**
 * Export directory resolves against the project root. The standalone
 * production bundle chdirs to `.next/standalone`, so cwd cannot be trusted;
 * SERIESIGHT_PROJECT_ROOT (or the documented sandbox root) anchors the path.
 */
const PROJECT_ROOT = process.env.SERIESIGHT_PROJECT_ROOT ?? "/home/z/my-project";
const EXPORT_DIR = path.join(PROJECT_ROOT, "prisma", "db", "export");
const AUDIT_FILE = path.join(EXPORT_DIR, "integration-audit.jsonl");
const WAREHOUSE_FILE = path.join(EXPORT_DIR, "integration-warehouse.jsonl");

async function appendLine(file: string, value: unknown): Promise<void> {
  await mkdir(EXPORT_DIR, { recursive: true });
  await appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
}

/** Audit sink — append-only trail of every event that reached dispatch. */
export async function appendAuditLine(event: IntegrationEvent): Promise<void> {
  await appendLine(AUDIT_FILE, {
    at: new Date().toISOString(),
    eventId: event.id,
    topic: event.topic,
    source: event.source,
    direction: event.direction,
    correlationId: event.correlationId,
    attempts: event.attempts,
    payload: event.payload,
  });
}

/** Warehouse sink — filtered projection of data events for analytics tooling. */
export async function appendWarehouseLine(event: IntegrationEvent): Promise<void> {
  if (!event.topic.startsWith("data.")) return;
  await appendLine(WAREHOUSE_FILE, {
    at: new Date().toISOString(),
    eventId: event.id,
    topic: event.topic,
    correlationId: event.correlationId,
    payload: event.payload,
  });
}

export const WAREHOUSE_PATHS = { exportDir: EXPORT_DIR, audit: AUDIT_FILE, warehouse: WAREHOUSE_FILE };
