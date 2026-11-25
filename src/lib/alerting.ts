/**
 * Signed operational alert webhook.
 *
 * Deliberately narrow: HTTPS only, fixed host allowlist, one alert per event
 * per minute, and no request bodies, cookies or credentials in the payload.
 * The webhook is an additional signal; structured logs remain the source of
 * truth for investigation.
 */
import { createHmac } from "node:crypto";

const ALLOWED_HOSTS = new Set([
  "api.betterstack.com",
  "hooks.slack.com",
  "alertmanager.example.com",
]);
const THROTTLE_MS = 60_000;
const lastSent = new Map<string, number>();

function endpoint(): URL | null {
  const raw = process.env.ALERT_WEBHOOK_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

export async function sendAlert(
  event: string,
  severity: "warning" | "critical",
  fields: Record<string, unknown> = {},
): Promise<void> {
  const url = endpoint();
  if (!url) return;
  const now = Date.now();
  if (now - (lastSent.get(event) ?? 0) < THROTTLE_MS) return;
  lastSent.set(event, now);

  const body = JSON.stringify({
    service: "seriesight",
    environment: process.env.NODE_ENV ?? "development",
    severity,
    event,
    timestamp: new Date().toISOString(),
    fields,
  });
  const secret = process.env.ALERT_WEBHOOK_SECRET;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers["x-seriesight-signature"] = createHmac("sha256", secret).update(body).digest("hex");

  try {
    const response = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) console.error(`[seriesight] alert delivery failed: HTTP ${response.status}`);
  } catch (error) {
    console.error(`[seriesight] alert delivery failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
