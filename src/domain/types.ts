/**
 * Seriesight domain model — canonical types shared by UI, services and API.
 * All analytics and draft logic operate exclusively on these types.
 */

export type Role = "TOP" | "JUNGLE" | "MID" | "BOT" | "SUPPORT";

export const ALL_ROLES: Role[] = ["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"];

export type Side = "BLUE" | "RED";

export type SeriesFormat = "BO1" | "BO3" | "BO5";

/** Fearless draft modes supported by the engine. */
export type FearlessMode = "none" | "hard" | "soft";

/** Whether fearless restrictions apply to both teams or each team separately. */
export type RestrictionScope = "both" | "own";

export type DamageClass = "physical" | "magic" | "mixed";

/** Coach-curated composition traits for a champion (0–100). Null = unknown, excluded from scores. */
export interface ChampionTraits {
  engage: number | null;
  disengage: number | null;
  frontline: number | null;
  crowdControl: number | null;
  physicalDamage: number | null;
  magicDamage: number | null;
  scaling: number | null;
  siege: number | null;
  pickPotential: number | null;
  objectiveControl: number | null;
}

export interface Champion {
  id: string;
  /** Numeric Riot key when known (Data Dragon). -1 when using fallback metadata. */
  key: number;
  canonicalName: string;
  displayName: string;
  primaryRole: Role;
  /** Secondary roles the champion has been played in (observed, coach-curated). */
  flexRoles: Role[];
  damageClass: DamageClass;
  traits: ChampionTraits;
  /** Static-data provenance: "datadragon" or "curated-fallback". */
  metadataSource: "datadragon" | "curated-fallback";
}

export interface Player {
  id: string;
  teamId: string;
  handle: string;
  /** Observed role across the dataset (may differ from nominal role). */
  observedRole: Role;
  /** Roles the player has played in the dataset besides observedRole. */
  observedFlex: Role[];
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  region: string;
  roster: Player[];
}

export interface Tournament {
  id: string;
  title: string;
  tier: "international" | "regional" | "invitational";
  region: string;
  startDate: string;
  endDate: string;
  /** Tournament-level draft policy advertised for the event. */
  draftPolicy: { fearless: FearlessMode; scope: RestrictionScope };
}

export type ObjectiveEventType =
  | "dragon"
  | "herald"
  | "baron"
  | "turret"
  | "kill"
  | "game_start"
  | "game_end";

export interface GameEvent {
  id: string;
  gameId: string;
  type: ObjectiveEventType;
  /** Seconds since game start. */
  timestampSec: number;
  /** Securing team, when applicable. */
  teamId: string | null;
  championId?: string;
  /** Supporting value, e.g. turret tier or kill count in a fight. */
  value?: number;
}

export interface DraftPickRecord {
  championId: string;
  teamId: string;
  playerId: string | null;
  role: Role;
  /** Ordered pick slot across the draft (1..10). */
  order: number;
  side: Side;
}

export interface DraftBanRecord {
  championId: string;
  teamId: string;
  order: number;
  side: Side;
}

/** Historical draft reconstruction of a played game. */
export interface HistoricalDraft {
  firstPickSide: Side;
  picks: DraftPickRecord[];
  bans: DraftBanRecord[];
}

export interface CoverageFlags {
  /** Objective event timeline coverage. */
  objectives: boolean;
  /** Draft (pick/ban) coverage. */
  draft: boolean;
  /** Player attribution coverage. */
  players: boolean;
  /** Interval-based gold/damage aggregates. */
  macroIntervals: boolean;
}

export interface Game {
  id: string;
  seriesId: string;
  gameNumber: number;
  patch: string;
  /** Scheduled time ISO-8601. */
  startedAt: string;
  durationSec: number;
  blueTeamId: string;
  redTeamId: string;
  winnerTeamId: string | null;
  blueWin: boolean;
  draft: HistoricalDraft;
  events: GameEvent[];
  coverage: CoverageFlags;
  /** Provenance: fixture dataset id or provider series id. */
  sourceProvider: "fixture" | "grid";
  sourceDatasetId: string;
}

export interface Series {
  id: string;
  tournamentId: string;
  patch: string;
  startedAt: string;
  format: SeriesFormat;
  status: "completed" | "upcoming";
  teamAId: string;
  teamBId: string;
  winnerTeamId: string | null;
  gameIds: string[];
  /** Whether the tournament enforced Fearless for this series. */
  fearless: FearlessMode;
  fearlessScope: RestrictionScope;
}

/** ---------- Scouting / analytics ---------- */

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  level: number;
  method: "wilson" | "beta-prior";
}

export type EvidenceStrength = "low" | "moderate" | "high";

export interface MetricStat {
  /** Explicit metric definition, e.g. "first_dragon_rate (games)". */
  definition: string;
  numerator: number;
  denominator: number;
  value: number | null;
  unit: "rate" | "count" | "seconds" | "score";
  sampleSize: number;
  confidence: ConfidenceInterval | null;
  strength: EvidenceStrength;
  /** Number of eligible observations withheld by filters. */
  excludedObservations?: number;
}

export interface Insight {
  id: string;
  workspaceId: string;
  insightType:
    | "pick-priority"
    | "ban-priority"
    | "side-dependence"
    | "opening-pattern"
    | "composition-repeat"
    | "cross-game-shift"
    | "objective-pattern"
    | "player-pool";
  title: string;
  summary: string;
  /** Observed fact vs interpretation separation. */
  observation: string;
  interpretation: string | null;
  metric: MetricStat;
  opponentTeamId: string;
  side: Side | "both";
  patchContext: string;
  createdAt: string;
  analysisVersion: string;
  evidenceId: string;
  /** Fixture findings are always marked. */
  dataProvenance: "fixture" | "grid";
}

export interface EvidenceRecord {
  id: string;
  insightId: string | null;
  provider: "fixture" | "grid";
  sourceId: string;
  datasetId: string;
  gameIds: string[];
  ingestedAt: string;
  tournamentId: string | null;
  patch: string | null;
  sampleCount: number;
  metricDefinition: string;
  numerator: number;
  denominator: number;
  computedValue: number | null;
  confidenceLower: number | null;
  confidenceUpper: number | null;
  analysisVersion: string;
  limitations: string[];
}

/** ---------- Draft engine ---------- */

export type DraftPhase =
  | "CONFIGURATION"
  | "BAN_PHASE_1"
  | "PICK_PHASE_1"
  | "BAN_PHASE_2"
  | "PICK_PHASE_2"
  | "FINALIZATION"
  | "COMPLETED"
  | "INVALID"
  | "CANCELLED";

export type DraftActionType = "ban" | "pick";

export interface DraftRulesetAction {
  /** Ordered slot in the sequence, 1-based. */
  order: number;
  type: DraftActionType;
  side: Side;
  phase: DraftPhase;
}

export interface DraftRuleset {
  id: string;
  name: string;
  description: string;
  format: SeriesFormat;
  mode: FearlessMode;
  restrictionsScope: RestrictionScope;
  restrictPicks: boolean;
  restrictBans: boolean;
  actionSequence: DraftRulesetAction[];
}

export interface DraftTeamState {
  teamId: string;
  side: Side;
  bans: (string | null)[];
  picks: { championId: string; playerId: string | null; role: Role | null }[];
}

export interface DraftGameAction {
  id: string;
  sessionGameId: string;
  order: number;
  type: DraftActionType;
  side: Side;
  championId: string;
  playerId: string | null;
  role: Role | null;
  phase: DraftPhase;
  actor: string;
  createdAt: string;
  /** Previous session state version for optimistic concurrency. */
  priorStateVersion: number;
}

export interface DraftGameState {
  gameNumber: number;
  status: "drafting" | "finalized" | "cancelled";
  rulesetId: string;
  blueTeamId: string;
  redTeamId: string;
  ourSide: Side;
  phase: DraftPhase;
  turn: number;
  blue: DraftTeamState;
  red: DraftTeamState;
  actions: DraftGameAction[];
  /** Actions undone, available for redo. */
  redoStack: DraftGameAction[];
  currentVersion: number;
  invalidReason: string | null;
}

export interface DraftSession {
  id: string;
  workspaceId: string;
  opponentTeamId: string;
  ourTeamId: string;
  format: SeriesFormat;
  rulesetId: string;
  mode: FearlessMode;
  restrictionsScope: RestrictionScope;
  currentGame: number;
  status: "active" | "completed" | "cancelled";
  stateVersion: number;
  games: DraftGameState[];
  tournamentId: string | null;
  patch: string;
  /** Configured champion pool for the session (ids). */
  pool: string[];
  createdAt: string;
  updatedAt: string;
}

/** Composition analysis output for a five-champion set. */
export interface CompositionProfile {
  championIds: string[];
  dimensions: Record<string, number | null>;
  physicalShare: number | null;
  magicShare: number | null;
  roleCoverage: Role[];
  missingRoles: Role[];
  score: number | null;
}

export interface ScoreBreakdown {
  component: string;
  weight: number;
  raw: number | null;
  weighted: number | null;
  note: string;
}

export interface Recommendation {
  championId: string;
  candidateName: string;
  recommendationType: "pick" | "ban";
  score: number;
  scoreBreakdown: ScoreBreakdown[];
  explanation: string;
  supportingEvidence: EvidenceRecord[];
  sampleSize: number;
  confidenceInterval: ConfidenceInterval | null;
  patchContext: string;
  positiveFactors: string[];
  riskFactors: string[];
  alternatives: string[];
  dataProvenance: "fixture" | "grid" | "coach-input";
}

/** ---------- Ingestion / data sources ---------- */

export type DataSourceStatus =
  | "connected"
  | "not_configured"
  | "authenticating"
  | "importing"
  | "partial_success"
  | "rate_limited"
  | "temporarily_unavailable"
  | "access_denied"
  | "schema_mismatch";

export type IngestionStage =
  | "connecting"
  | "retrieving_metadata"
  | "validating_payloads"
  | "normalizing"
  | "computing_insights"
  | "verifying_results";

export interface IngestionJob {
  id: string;
  provider: "fixture" | "grid";
  jobType: "series_import" | "champion_metadata";
  status: "queued" | "running" | "succeeded" | "failed" | "partial";
  stage: IngestionStage;
  attempts: number;
  seriesCount: number;
  gameCount: number;
  lastError: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface DataSourceConnection {
  provider: "fixture" | "grid";
  status: DataSourceStatus;
  label: string;
  lastVerifiedAt: string | null;
  lastSuccessfulRequestAt: string | null;
  lastImportAttemptAt: string | null;
  authorizedEndpoints: string[];
  rateLimitRemaining: number | null;
  parsedSeriesCount: number;
  failedImportCount: number;
  metadata: Record<string, string | number | boolean | null>;
}
