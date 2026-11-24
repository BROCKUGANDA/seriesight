/**
 * Uniform API response envelope (PRD Part J) + route helpers.
 * Request IDs are generated per request; stack traces never leave this module.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { ZodError, ZodType } from "zod";
import { AppError, type ErrorCode } from "@/domain/errors";
import { assertSameOrigin, authError, identityContext, resolveIdentity } from "@/lib/auth";
import { withSelectedDataset } from "@/services/dataset";

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  meta: { requestId: string; generatedAt: string; [k: string]: unknown };
  error: ApiErrorBody | null;
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  recovery: string;
  details?: Record<string, unknown>;
}

function requestIdFrom(req: NextRequest | Request): string {
  return req.headers.get("x-request-id") ?? randomUUID();
}

export function ok<T>(data: T, req: NextRequest | Request, meta?: Record<string, unknown>): NextResponse {
  const body: ApiEnvelope<T> = {
    success: true,
    data,
    meta: { requestId: requestIdFrom(req), generatedAt: new Date().toISOString(), ...meta },
    error: null,
  };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}

export function fail(
  error: ApiErrorBody,
  req: NextRequest | Request,
  status = 400,
  meta?: Record<string, unknown>,
): NextResponse {
  const body: ApiEnvelope<null> = {
    success: false,
    data: null,
    meta: { requestId: requestIdFrom(req), generatedAt: new Date().toISOString(), ...meta },
    error,
  };
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

const STATUS_BY_CODE: Partial<Record<ErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  SESSION_EXPIRED: 401,
  ACCESS_DENIED: 403,
  NOT_FOUND: 404,
  DRAFT_STALE_VERSION: 409,
  DRAFT_SESSION_COMPLETED: 409,
  DRAFT_DUPLICATE_PICK: 409,
  GRID_RATE_LIMITED: 429,
  RATE_LIMITED: 429,
  GRID_UNAUTHORIZED: 401,
  GRID_FORBIDDEN: 403,
  GRID_TIMEOUT: 504,
  GRID_UNAVAILABLE: 503,
  WEBHOOK_SIGNATURE_INVALID: 401,
  WEBHOOK_TOPIC_UNSUPPORTED: 404,
  WEBHOOK_PAYLOAD_INVALID: 422,
  INTEGRATION_ENDPOINT_UNREACHABLE: 502,
  INTEGRATION_ENDPOINT_BLOCKED: 400,
  INTEGRATION_EVENT_NOT_REPLAYABLE: 409,
  INTERNAL_ERROR: 500,
};

export function statusForCode(code: ErrorCode): number {
  return STATUS_BY_CODE[code] ?? 400;
}

/** Wrap a route handler: converts AppError/ZodError/unknown into the uniform envelope. */
export function handler<A extends unknown[]>(
  fn: (req: NextRequest, ...rest: A) => Promise<NextResponse>,
): (req: NextRequest, ...rest: A) => Promise<NextResponse> {
  return async (req: NextRequest, ...rest: A) => {
    try {
      assertSameOrigin(req);
      const path = req.nextUrl.pathname;
      if (path === "/api/health" || path === "/api/leads" || path.startsWith("/api/auth/")) return await fn(req, ...rest);
      const identity = await resolveIdentity(req);
      if (!identity) throw authError();
      // These experimental global stores have no workspace ownership model.
      if (path.startsWith("/api/billing/") || path.startsWith("/api/integration/")) {
        throw authError("Experimental billing and integrations are disabled until workspace isolation is implemented.", true);
      }
      if (identity.kind !== "coach" && ((path === "/api/data-sources" && req.method !== "GET") || path.startsWith("/api/ingestion/"))) {
        throw authError("Only authenticated coaches can import provider data.", true);
      }
      return await identityContext.run(identity, () => withSelectedDataset(() => fn(req, ...rest)));
    } catch (err) {
      if (err instanceof AppError) {
        return fail(
          {
            code: err.code,
            message: err.message,
            retryable: err.retryable,
            recovery: err.recovery,
            details: err.details,
          },
          req,
          statusForCode(err.code),
        );
      }
      if (err instanceof ZodError) {
        return fail(
          {
            code: "VALIDATION_ERROR",
            message: "Request payload failed validation.",
            retryable: false,
            recovery: "Correct the highlighted fields and retry.",
            details: { issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
          },
          req,
          400,
        );
      }
      // Unknown error: log server-side, return a generic message.
      console.error("[seriesight] unhandled route error:", err instanceof Error ? err.message : err);
      return fail(
        {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred while processing the request.",
          retryable: true,
          recovery: "Retry the action. If it persists, reload the workspace.",
        },
        req,
        500,
      );
    }
  };
}

/** Parse + validate a JSON body with a Zod schema. */
export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Request body must be valid JSON.",
      retryable: false,
      recovery: "Send a JSON payload with a valid Content-Type header.",
    });
  }
  return schema.parse(raw);
}

/** Parse + validate an OPTIONAL JSON body; empty/absent bodies become undefined. */
export async function parseOptionalBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T | undefined> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return undefined;
  }
  if (raw === null || raw === undefined || (typeof raw === "object" && Object.keys(raw as object).length === 0)) {
    return schema.parse({}) as T | undefined;
  }
  return schema.parse(raw);
}

/** Parse + validate query params with a Zod schema. */
export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  return schema.parse(params);
}
