/**
 * HMAC-SHA256 signing for the integration fabric (Node runtime).
 *
 *  • Outbound deliveries: Seriesight signs the raw body with each endpoint's
 *    secret; receivers verify before trusting the payload.
 *  • Inbound webhooks: external systems sign with the shared inbound secret;
 *    Seriesight verifies with a timing-safe comparison.
 *
 * Signature header format: `sha256=<hex digest>`.
 * Secrets never leave the server in logs; endpoint secrets are masked in API
 * responses (prefix preview only).
 */
import { createHmac, timingSafeEqual, randomBytes } from "crypto";

export const SIGNATURE_HEADER = "x-seriesight-signature";

export function signPayload(secret: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
}

/** Timing-safe verification. Returns false on malformed headers instead of throwing. */
export function verifySignature(secret: string, rawBody: string, header: string | null): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const provided = header.slice("sha256=".length).trim();
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Generates a URL-safe 32-byte secret for new outbound endpoints. */
export function generateEndpointSecret(): string {
  return randomBytes(24).toString("base64url");
}

/** Preview form used in UI/API responses — never expose the full secret after creation. */
export function maskSecret(secret: string): string {
  return `${secret.slice(0, 5)}…${secret.slice(-3)}`;
}

/**
 * Shared inbound secret. The documented demo default keeps the receiver usable
 * out of the box for evaluation; production deployments override it with the
 * SERIESIGHT_INBOUND_SECRET environment variable.
 */
export function inboundSecret(): string {
  return process.env.SERIESIGHT_INBOUND_SECRET ?? "seriesight-demo-secret";
}

export function inboundSecretIsDefault(): boolean {
  return !process.env.SERIESIGHT_INBOUND_SECRET;
}
