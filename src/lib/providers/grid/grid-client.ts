/**
 * GRID HTTP client (server-side only).
 *
 * Safety properties:
 *  - Host allowlist (SSRF prevention): requests only to GRID_ALLOWED_HOSTS.
 *  - API key stays in server env; never returned, logged or forwarded.
 *  - Hard request timeouts + bounded retries with exponential backoff and jitter.
 *  - Retry-After is honoured; 401/403 are never retried.
 *  - Circuit breaker (CLOSED/OPEN/HALF_OPEN) after repeated provider failures.
 */
import { GRID_ALLOWED_HOSTS, GRID_ENDPOINTS, GridError, type GridSupportedTitle } from "./grid-types";

export interface GridClientConfig {
  apiKey: string | null;
  timeoutMs: number;
  maxRetries: number;
}

export const DEFAULT_GRID_CONFIG: GridClientConfig = {
  apiKey: process.env.GRID_API_KEY ?? null,
  timeoutMs: 12_000,
  maxRetries: 3,
};

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  openedAt: number | null;
  consecutiveSuccesses: number;
}

const FAILURE_THRESHOLD = 4;
const OPEN_COOLDOWN_MS = 30_000;

const global_ = globalThis as unknown as { __seriesightCircuit?: CircuitBreakerState };
const circuit: CircuitBreakerState = (global_.__seriesightCircuit ??= {
  state: "CLOSED",
  failures: 0,
  openedAt: null,
  consecutiveSuccesses: 0,
});

export function circuitSnapshot(): CircuitBreakerState & { failureThreshold: number } {
  return { ...circuit, failureThreshold: FAILURE_THRESHOLD };
}

/** Test hook: reset the breaker between unit tests. */
export function resetCircuitForTests(): void {
  circuit.state = "CLOSED";
  circuit.failures = 0;
  circuit.openedAt = null;
  circuit.consecutiveSuccesses = 0;
}

function allowOpen(): boolean {
  return circuit.openedAt !== null && Date.now() - circuit.openedAt > OPEN_COOLDOWN_MS;
}

function recordFailure(): void {
  circuit.failures += 1;
  circuit.consecutiveSuccesses = 0;
  if (circuit.state === "HALF_OPEN") {
    circuit.state = "OPEN";
    circuit.openedAt = Date.now();
    return;
  }
  if (circuit.failures >= FAILURE_THRESHOLD) {
    circuit.state = "OPEN";
    circuit.openedAt = Date.now();
  }
}

function recordSuccess(): void {
  circuit.failures = 0;
  if (circuit.state === "HALF_OPEN" || circuit.state === "OPEN") {
    circuit.consecutiveSuccesses += 1;
    if (circuit.consecutiveSuccesses >= 2) {
      circuit.state = "CLOSED";
      circuit.openedAt = null;
    }
  } else {
    circuit.state = "CLOSED";
  }
}

export function assertUrlAllowed(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new GridError("INVALID_QUERY", `Malformed provider URL: ${url}`);
  }
  if (parsed.protocol !== "https:" || !GRID_ALLOWED_HOSTS.includes(parsed.hostname as (typeof GRID_ALLOWED_HOSTS)[number])) {
    throw new GridError(
      "INVALID_QUERY",
      `Blocked request to non-allowlisted host: ${parsed.hostname}. Seriesight only talks to ${GRID_ALLOWED_HOSTS.join(", ")}.`,
    );
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GridRequestOptions {
  query: string;
  variables?: Record<string, unknown>;
  endpoint?: keyof typeof GRID_ENDPOINTS;
  title?: GridSupportedTitle;
}

/** Executes one GraphQL request against GRID with timeout, retries and breaker. */
export async function gridRequest<T>(opts: GridRequestOptions, config: GridClientConfig = DEFAULT_GRID_CONFIG): Promise<T> {
  if (!config.apiKey) throw new GridError("CREDENTIAL_MISSING", "GRID_API_KEY is not configured on the server.");
  const url = GRID_ENDPOINTS[opts.endpoint ?? "centralData"];
  assertUrlAllowed(url);

  if (circuit.state === "OPEN" && !allowOpen()) {
    throw new GridError("UNAVAILABLE", "GRID circuit breaker is open after repeated provider failures.", { retryable: true });
  }
  if (circuit.state === "OPEN" && allowOpen()) circuit.state = "HALF_OPEN";

  let lastError: GridError | null = null;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    if (attempt > 0) {
      const base = Math.min(500 * Math.pow(2, attempt - 1), 2000);
      const jitter = base * (0.7 + Math.random() * 0.6);
      if (lastError?.retryAfterSec) await sleep(lastError.retryAfterSec * 1000);
      else await sleep(jitter);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": config.apiKey,
        },
        body: JSON.stringify({ query: opts.query, variables: opts.variables ?? {} }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 401) throw new GridError("UNAUTHORIZED", "GRID rejected the credentials (401).");
      if (res.status === 403) throw new GridError("FORBIDDEN", "GRID denied access to this data product (403).");
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "0") || undefined;
        throw new GridError("RATE_LIMITED", "GRID rate limit reached (429).", { retryable: true, retryAfterSec: retryAfter });
      }
      if (!res.ok) throw new GridError("UNAVAILABLE", `GRID responded ${res.status}.`, { retryable: res.status >= 500 });

      const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
      if (json.errors?.length) throw new GridError("INVALID_QUERY", `GRID GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`);
      if (json.data === undefined) throw new GridError("INVALID_SCHEMA", "GRID response did not contain a data object.");
      recordSuccess();
      return json.data;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof GridError) {
        lastError = err;
        if (!err.retryable) {
          recordFailure();
          throw err;
        }
        if (err.code === "UNAUTHORIZED" || err.code === "FORBIDDEN") {
          recordFailure();
          throw err;
        }
      } else if (err instanceof Error && err.name === "AbortError") {
        lastError = new GridError("TIMEOUT", `GRID request timed out after ${config.timeoutMs} ms.`, { retryable: true });
      } else {
        lastError = new GridError("UNAVAILABLE", `GRID request failed: ${err instanceof Error ? err.message : "unknown"}`, { retryable: true });
      }
      recordFailure();
    }
  }
  throw lastError ?? new GridError("UNAVAILABLE", "GRID request failed after retries.", { retryable: true });
}

/**
 * Connection probe used by the Data Sources page. Never throws — returns a
 * discriminated status so the UI can render the exact provider state.
 */
export async function probeGrid(
  config: GridClientConfig = DEFAULT_GRID_CONFIG,
): Promise<{ status: string; detail: string; lastSuccessfulRequestAt: string | null }> {
  if (!config.apiKey) {
    return { status: "not_configured", detail: "GRID_API_KEY is not set in the server environment. The fixture workspace remains fully functional.", lastSuccessfulRequestAt: null };
  }
  if (circuit.state === "OPEN") {
    return { status: "temporarily_unavailable", detail: "Circuit breaker open after repeated provider failures.", lastSuccessfulRequestAt: null };
  }
  try {
    await gridRequest<{ __typename?: string }>({ query: "query { __typename }", endpoint: "centralData" }, config);
    return { status: "connected", detail: "Central Data endpoint reachable.", lastSuccessfulRequestAt: new Date().toISOString() };
  } catch (err) {
    const ge = err as GridError;
    const status =
      ge.code === "CREDENTIAL_MISSING"
        ? "not_configured"
        : ge.code === "UNAUTHORIZED"
          ? "access_denied"
          : ge.code === "FORBIDDEN"
            ? "access_denied"
            : ge.code === "RATE_LIMITED"
              ? "rate_limited"
              : ge.code === "TIMEOUT"
                ? "temporarily_unavailable"
                : "temporarily_unavailable";
    return { status, detail: ge.message, lastSuccessfulRequestAt: null };
  }
}
