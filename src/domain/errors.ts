/**
 * Seriesight error catalogue — stable machine codes, retryability and recovery hints.
 * Every error surfaced to a user passes through here so messages never leak internals.
 */

export type ErrorCode =
  // Data integration
  | "GRID_CREDENTIAL_MISSING"
  | "GRID_UNAUTHORIZED"
  | "GRID_FORBIDDEN"
  | "GRID_TIMEOUT"
  | "GRID_UNAVAILABLE"
  | "GRID_RATE_LIMITED"
  | "GRID_INVALID_QUERY"
  | "GRID_INVALID_SCHEMA"
  | "GRID_EMPTY_RESULT"
  | "GRID_UNSUPPORTED_TITLE"
  | "GRID_UNSUPPORTED_TOURNAMENT"
  | "GRID_PARTIAL_GAME_DATA"
  | "GRID_MISSING_CHAMPION_ID"
  | "GRID_UNKNOWN_TEAM"
  // Analytics
  | "ANALYTICS_INSUFFICIENT_SAMPLE"
  | "ANALYTICS_INVALID_DENOMINATOR"
  | "ANALYTICS_MISSING_FIELDS"
  | "ANALYTICS_INVALID_TIMESTAMP"
  | "ANALYTICS_DUPLICATE_OBSERVATION"
  | "ANALYTICS_PATCH_MISMATCH"
  | "ANALYTICS_UNSUPPORTED_METRIC"
  | "ANALYTICS_MISSING_CONFIDENCE"
  // Draft engine
  | "DRAFT_RESTRICTED_CHAMPION"
  | "DRAFT_DUPLICATE_PICK"
  | "DRAFT_WRONG_TEAM"
  | "DRAFT_WRONG_ORDER"
  | "DRAFT_INVALID_PHASE"
  | "DRAFT_UNSUPPORTED_FORMAT"
  | "DRAFT_INVALID_RULESET"
  | "DRAFT_MISSING_ROLE"
  | "DRAFT_SESSION_COMPLETED"
  | "DRAFT_STALE_VERSION"
  | "DRAFT_ILLEGAL_UNDO"
  // Interface / general
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "NETWORK_DISCONNECTED"
  | "REQUEST_TIMEOUT"
  | "SESSION_EXPIRED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export interface AppErrorShape {
  code: ErrorCode;
  message: string;
  /** True when the same request may succeed after waiting. */
  retryable: boolean;
  /** Human-oriented recovery action. */
  recovery: string;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly recovery: string;
  readonly details: Record<string, unknown>;

  constructor(shape: AppErrorShape) {
    super(shape.message);
    this.name = "AppError";
    this.code = shape.code;
    this.retryable = shape.retryable;
    this.recovery = shape.recovery;
    this.details = shape.details ?? {};
  }
}

export const ERRORS = {
  credentialMissing: () =>
    new AppError({
      code: "GRID_CREDENTIAL_MISSING",
      message: "GRID API credentials are not configured on the server.",
      retryable: false,
      recovery: "Run the workspace in fixture mode, or configure GRID_API_KEY in the server environment.",
    }),
  unauthorized: () =>
    new AppError({
      code: "GRID_UNAUTHORIZED",
      message: "The data provider rejected the credentials.",
      retryable: false,
      recovery: "Verify the configured API key, then reconnect from Data Sources.",
    }),
  timeout: (ms: number) =>
    new AppError({
      code: "GRID_TIMEOUT",
      message: `The data provider did not respond within ${ms} ms.`,
      retryable: true,
      recovery: "Retry the import. Repeated timeouts switch the provider circuit breaker open.",
    }),
  rateLimited: (retryAfterSec?: number) =>
    new AppError({
      code: "GRID_RATE_LIMITED",
      message: "The data provider rate limit was reached.",
      retryable: true,
      recovery: retryAfterSec
        ? `Retry after approximately ${retryAfterSec} seconds.`
        : "Retry after a short delay; the request honours the provider Retry-After window.",
      details: { retryAfterSec: retryAfterSec ?? null },
    }),
  insufficientSample: (definition: string, have: number, need: number) =>
    new AppError({
      code: "ANALYTICS_INSUFFICIENT_SAMPLE",
      message: `Not enough observations for "${definition}" (${have}/${need}).`,
      retryable: false,
      recovery: "Widen the filters or import more series for this opponent.",
      details: { definition, have, need },
    }),
  unknownTeam: (teamId: string) =>
    new AppError({
      code: "GRID_UNKNOWN_TEAM",
      message: `No team matching "${teamId}" exists in the connected dataset.`,
      retryable: false,
      recovery: "Pick another opponent from the team directory.",
    }),
  restrictedChampion: (championId: string, reason: string) =>
    new AppError({
      code: "DRAFT_RESTRICTED_CHAMPION",
      message: `${championId} is unavailable: ${reason}`,
      retryable: false,
      recovery: "Choose a different champion or adjust the Fearless ruleset.",
      details: { championId, reason },
    }),
  duplicate: (championId: string) =>
    new AppError({
      code: "DRAFT_DUPLICATE_PICK",
      message: `${championId} is already taken in this game.`,
      retryable: false,
      recovery: "Select an available champion.",
    }),
  wrongTeam: (expected: string, got: string) =>
    new AppError({
      code: "DRAFT_WRONG_TEAM",
      message: `It is ${expected}'s turn, not ${got}'s.`,
      retryable: false,
      recovery: "Wait for the correct turn or hand control to the other draft captain.",
      details: { expected, got },
    }),
  wrongOrder: (expectedType: string, gotType: string) =>
    new AppError({
      code: "DRAFT_WRONG_ORDER",
      message: `The current turn requires a ${expectedType}, not a ${gotType}.`,
      retryable: false,
      recovery: "Follow the tournament sequence shown on the draft board.",
      details: { expectedType, gotType },
    }),
  invalidPhase: (phase: string) =>
    new AppError({
      code: "DRAFT_INVALID_PHASE",
      message: `The draft is in ${phase}; that action is not valid here.`,
      retryable: false,
      recovery: "Follow the phase indicator on the draft board.",
    }),
  staleVersion: (expected: number, got: number) =>
    new AppError({
      code: "DRAFT_STALE_VERSION",
      message: "Your draft view is out of date; another client changed the board.",
      retryable: true,
      recovery: "Reload the draft session to receive the current board, then re-apply your change.",
      details: { expected, got },
    }),
  sessionCompleted: () =>
    new AppError({
      code: "DRAFT_SESSION_COMPLETED",
      message: "This draft session is already completed.",
      retryable: false,
      recovery: "Start a new session or open the next game in Series Lab.",
    }),
  illegalUndo: (reason: string) =>
    new AppError({
      code: "DRAFT_ILLEGAL_UNDO",
      message: `Undo is not available: ${reason}`,
      retryable: false,
      recovery: "Undo requires at least one applied action that is not finalized.",
    }),
  notFound: (what: string) =>
    new AppError({
      code: "NOT_FOUND",
      message: `${what} was not found.`,
      retryable: false,
      recovery: "Go back to the workspace overview and retry.",
    }),
  validation: (message: string, details?: Record<string, unknown>) =>
    new AppError({
      code: "VALIDATION_ERROR",
      message,
      retryable: false,
      recovery: "Correct the highlighted fields and retry.",
      details: details ?? {},
    }),
  internal: (message = "An unexpected error occurred.") =>
    new AppError({
      code: "INTERNAL_ERROR",
      message,
      retryable: true,
      recovery: "Retry the action. If it persists, reload the workspace.",
    }),
} as const;
