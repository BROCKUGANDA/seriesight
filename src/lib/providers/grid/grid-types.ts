/**
 * GRID provider adapter — typed contracts and capability declarations.
 *
 * The UI never touches these types or endpoints directly; only this module
 * (server-side) may call GRID. All hostnames are allowlisted below.
 *
 * Documented endpoints (verify against the active Open Access account before use):
 *   Central Data : https://api-op.grid.gg/central-data/graphql
 *   Series State : https://api-op.grid.gg/live-data-feed/series-state/graphql
 */
export const GRID_ENDPOINTS = {
  centralData: "https://api-op.grid.gg/central-data/graphql",
  seriesState: "https://api-op.grid.gg/live-data-feed/series-state/graphql",
} as const;

export const GRID_ALLOWED_HOSTS = ["api-op.grid.gg"] as const;

export type GridErrorCode =
  | "CREDENTIAL_MISSING"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "TIMEOUT"
  | "UNAVAILABLE"
  | "RATE_LIMITED"
  | "INVALID_QUERY"
  | "INVALID_SCHEMA"
  | "EMPTY_RESULT"
  | "UNSUPPORTED_TITLE"
  | "UNSUPPORTED_TOURNAMENT"
  | "PARTIAL_GAME_DATA"
  | "MISSING_CHAMPION_ID"
  | "UNKNOWN_TEAM";

export class GridError extends Error {
  readonly code: GridErrorCode;
  readonly retryable: boolean;
  readonly retryAfterSec?: number;
  constructor(code: GridErrorCode, message: string, opts?: { retryable?: boolean; retryAfterSec?: number }) {
    super(message);
    this.name = "GridError";
    this.code = code;
    this.retryable = opts?.retryable ?? false;
    this.retryAfterSec = opts?.retryAfterSec;
  }
}

/** Titles Seriesight can map into its domain model. */
export const GRID_SUPPORTED_TITLES = ["league-of-legends"] as const;
export type GridSupportedTitle = (typeof GRID_SUPPORTED_TITLES)[number];

/** Minimal, explicit shape of what the adapter expects from provider payloads. */
export interface GridSeriesRef {
  id: string;
  tournamentId: string;
  tournamentTitle: string;
  scheduledStartTime: string | null;
  teamAName: string;
  teamBName: string;
  title: string;
}

export interface GridSeriesStateGame {
  gameId: string;
  gameNumber: number;
  durationSeconds: number | null;
  winnerSide: "BLUE" | "RED" | null;
  picks: { side: "BLUE" | "RED"; championName: string; participantName: string | null; role: string | null }[];
  bans: { side: "BLUE" | "RED"; championName: string; order: number }[];
  objectives: { type: string; timestampSeconds: number; team: "BLUE" | "RED" }[];
}

export interface GridSeriesState {
  seriesId: string;
  games: GridSeriesStateGame[];
}

export interface GridCapabilities {
  objectives: boolean;
  draft: boolean;
  players: boolean;
  macroIntervals: boolean;
}

/**
 * Declared capability set for the current entitlement. When a data product is not
 * confirmed, the adapter reports it as unavailable — the UI shows explicit
 * unavailable states instead of estimates.
 */
export function capabilitiesForTitle(title: GridSupportedTitle): GridCapabilities {
  if (title !== "league-of-legends") {
    return { objectives: false, draft: false, players: false, macroIntervals: false };
  }
  return { objectives: true, draft: true, players: true, macroIntervals: false };
}
