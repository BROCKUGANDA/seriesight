"use client";

/**
 * Client-side API helper: always-relative fetch (gateway rule), envelope-aware,
 * typed error surfacing with machine codes for the UI error catalogue.
 */
import type { ApiEnvelope } from "@/lib/api/respond";

export class ApiClientError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly recovery: string;
  readonly details?: Record<string, unknown>;

  constructor(body: NonNullable<ApiEnvelope<never>["error"]>) {
    super(body.message);
    this.code = body.code;
    this.retryable = body.retryable;
    this.recovery = body.recovery;
    this.details = body.details;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch (err) {
    throw new ApiClientError({
      code: "NETWORK_DISCONNECTED",
      message: `Network request failed: ${err instanceof Error ? err.message : "unknown"}`,
      retryable: true,
      recovery: "Check the connection and retry.",
    });
  }
  let json: ApiEnvelope<T>;
  try {
    json = (await res.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiClientError({
      code: "INTERNAL_ERROR",
      message: `Unexpected non-JSON response (HTTP ${res.status}).`,
      retryable: true,
      recovery: "Retry the action.",
    });
  }
  if (!json.success || json.error) {
    throw new ApiClientError(
      json.error ?? {
        code: "INTERNAL_ERROR",
        message: "Unknown API failure.",
        retryable: false,
        recovery: "Retry the action.",
      },
    );
  }
  return json.data as T;
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
}
