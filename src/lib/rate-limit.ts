/**
 * Database-backed fixed-window rate limiting.
 *
 * A shared store keeps limits consistent across serverless instances and
 * process restarts. Buckets expire automatically and stale buckets are removed
 * opportunistically. This is application-level protection in addition to the
 * edge rate limits configured in front of the deployment.
 */
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { AppError } from "@/domain/errors";
import { logEvent } from "@/lib/observability";

const WINDOW_MS = 60_000;
let lastCleanup = 0;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** Only trust forwarded addresses when an operator has configured a trusted proxy. */
export function trustedClientAddress(req: NextRequest): string {
  if (process.env.TRUST_AUTH_PROXY !== "true") return "untrusted";
  const cloudflare = req.headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

export interface RateLimitPolicy {
  scope: "public-leads" | "auth" | "api";
  limit: number;
}

export function rateLimitPolicy(pathname: string): RateLimitPolicy {
  if (pathname === "/api/leads") {
    return { scope: "public-leads", limit: positiveInt(process.env.LEADS_RATE_LIMIT_PER_MIN, 20) };
  }
  if (pathname.startsWith("/api/auth/")) {
    return { scope: "auth", limit: positiveInt(process.env.AUTH_RATE_LIMIT_PER_MIN, 60) };
  }
  const productionDefault = 600;
  return {
    scope: "api",
    limit: positiveInt(process.env.API_RATE_LIMIT_PER_MIN, process.env.NODE_ENV === "production" ? productionDefault : 2_000),
  };
}

export async function consumeRateLimit(input: {
  scope: RateLimitPolicy["scope"];
  identity: string;
  limit: number;
}): Promise<{ remaining: number; resetAt: string }> {
  const now = Date.now();
  if (now - lastCleanup > WINDOW_MS) {
    lastCleanup = now;
    void db.requestRateLimitRecord
      .deleteMany({ where: { expiresAt: { lt: new Date(now) } } })
      .catch(() => undefined);
  }

  const window = Math.floor(now / WINDOW_MS);
  const digest = createHash("sha256").update(`${input.scope}:${input.identity}`).digest("hex").slice(0, 32);
  const key = `${input.scope}:${window}:${digest}`;
  const expiresAt = new Date((window + 1) * WINDOW_MS);
  const row = await db.requestRateLimitRecord.upsert({
    where: { key },
    create: { key, attempts: 1, expiresAt },
    update: { attempts: { increment: 1 } },
  });

  if (row.attempts > input.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000));
    logEvent("warn", "rate_limit_exceeded", { scope: input.scope, limit: input.limit, retryAfterSec });
    throw new AppError({
      code: "RATE_LIMITED",
      message: "Too many requests. Slow down and retry shortly.",
      retryable: true,
      recovery: `Retry after approximately ${retryAfterSec} seconds.`,
      details: { retryAfterSec, scope: input.scope },
    });
  }

  return { remaining: Math.max(0, input.limit - row.attempts), resetAt: expiresAt.toISOString() };
}
