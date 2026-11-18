/** GRID error normalization → Seriesight AppError (uniform envelope for the UI). */
import { AppError, ERRORS } from "@/domain/errors";
import { GridError } from "./grid-types";

export function toAppError(err: unknown): AppError {
  if (err instanceof GridError) {
    switch (err.code) {
      case "CREDENTIAL_MISSING":
        return ERRORS.credentialMissing();
      case "UNAUTHORIZED":
        return ERRORS.unauthorized();
      case "FORBIDDEN":
        return new AppError({
          code: "GRID_FORBIDDEN",
          message: err.message,
          retryable: false,
          recovery: "Check the entitlements of the active Open Access account, then reconnect.",
        });
      case "TIMEOUT":
        return ERRORS.timeout(12_000);
      case "RATE_LIMITED":
        return ERRORS.rateLimited(err.retryAfterSec);
      case "UNAVAILABLE":
        return new AppError({
          code: "GRID_UNAVAILABLE",
          message: err.message,
          retryable: true,
          recovery: "Retry shortly; the circuit breaker protects the app from repeated outages.",
        });
      case "INVALID_QUERY":
      case "INVALID_SCHEMA":
        return new AppError({
          code: "GRID_INVALID_SCHEMA",
          message: err.message,
          retryable: false,
          recovery: "Verify the provider schema mapping in GRID_INTEGRATION.md before retrying.",
        });
      case "EMPTY_RESULT":
        return new AppError({
          code: "GRID_EMPTY_RESULT",
          message: err.message,
          retryable: false,
          recovery: "Pick a different series or widen the tournament filter.",
        });
      default:
        return new AppError({
          code: "GRID_UNAVAILABLE",
          message: err.message,
          retryable: false,
          recovery: "Open Data Sources for the current provider status.",
        });
    }
  }
  if (err instanceof AppError) return err;
  return ERRORS.internal(err instanceof Error ? err.message : undefined);
}

export { GridError };
