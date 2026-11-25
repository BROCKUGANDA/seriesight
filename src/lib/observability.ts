/**
 * Minimal structured logging for server-side operations.
 *
 * Logs are one JSON object per line so they can be ingested by Docker, a
 * reverse proxy, or a log platform without a vendor SDK. Request bodies,
 * cookies, tokens and secrets are never accepted as fields.
 */

import { sendAlert } from "./alerting";

export type LogLevel = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "token",
  "tokenHash",
  "cookie",
  "authorization",
  "inviteCode",
  "secret",
  "apiKey",
  "gridApiKey",
]);

function sanitize(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_KEYS.has(key) || key.toLowerCase().includes("secret")) continue;
    out[key] = value instanceof Error ? { name: value.name, message: value.message } : value;
  }
  return out;
}

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "seriesight",
    environment: process.env.NODE_ENV ?? "development",
    level,
    event,
    ...sanitize(fields),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logError(error: unknown, fields: Record<string, unknown> = {}): void {
  const detail = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { message: String(error) };
  const safeFields = { ...fields, ...detail };
  logEvent("error", "unhandled_error", safeFields);
  void sendAlert("unhandled_error", "critical", {
    requestId: fields.requestId ?? null,
    path: fields.path ?? null,
    method: fields.method ?? null,
    name: detail.name ?? null,
    message: detail.message ?? null,
  });
}
