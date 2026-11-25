/**
 * Data sources + ingestion service (PRD D8, K4, L).
 * GRID imports persist validated historical series in the coach workspace.
 * Fixture fallback is always explicitly labelled and is never imported as GRID.
 */
import { db } from "@/lib/db";
import type { DataSourceConnection, IngestionJob } from "@/domain/types";
import { probeGrid, circuitSnapshot } from "@/lib/providers/grid/grid-client";
import { currentWorkspace, identityContext, requireCoach } from "@/lib/auth";
import { requireWorkspaceRole } from "@/services/organizations";
import { fetchGridHistoricalSeries } from "@/lib/providers/grid/grid-history";
import { GridError } from "@/lib/providers/grid/grid-types";
import { getHistoricalSeries, gridConnectionKey, persistGridHistoricalSeries } from "./dataset";
import { AUTHORIZED_ENDPOINTS } from "@/lib/providers/grid/grid-capabilities";
import { resolveStaticData } from "@/lib/providers/data-dragon";
import { FIXTURE_GAMES, FIXTURE_SERIES, FIXTURE_INFO } from "@/fixtures/dataset";

const global_ = globalThis as unknown as { __seriesightWorkspaceJobs?: Map<string, IngestionJob[]> };

function jobStore(): IngestionJob[] {
  const workspace = currentWorkspace();
  global_.__seriesightWorkspaceJobs ??= new Map();
  if (!global_.__seriesightWorkspaceJobs.has(workspace)) global_.__seriesightWorkspaceJobs.set(workspace, []);
  return global_.__seriesightWorkspaceJobs.get(workspace)!;
}

async function connectionRecord(provider: string): Promise<DataSourceConnection | null> {
  currentWorkspace();
  if (provider === "grid" && identityContext.getStore()?.kind !== "coach") return null;
  const key = provider === "grid" ? gridConnectionKey() : provider;
  const rec = await db.dataSourceConnectionRecord.findUnique({ where: { provider: key } });
  if (!rec) return null;
  return {
    provider: provider as DataSourceConnection["provider"],
    status: rec.status as DataSourceConnection["status"],
    label: rec.label,
    lastVerifiedAt: rec.lastVerifiedAt?.toISOString() ?? null,
    lastSuccessfulRequestAt: rec.lastSuccessfulRequestAt?.toISOString() ?? null,
    lastImportAttemptAt: rec.lastImportAttemptAt?.toISOString() ?? null,
    authorizedEndpoints: JSON.parse(rec.authorizedEndpointsJson) as string[],
    rateLimitRemaining: rec.rateLimitRemaining,
    parsedSeriesCount: rec.parsedSeriesCount,
    failedImportCount: rec.failedImportCount,
    metadata: JSON.parse(rec.metadataJson) as Record<string, string | number | boolean | null>,
  };
}

async function upsertConnection(conn: DataSourceConnection): Promise<void> {
  const provider = conn.provider === "grid" ? (requireCoach(), gridConnectionKey()) : conn.provider;
  await db.dataSourceConnectionRecord.upsert({
    where: { provider },
    create: {
      provider,
      status: conn.status,
      label: conn.label,
      lastVerifiedAt: conn.lastVerifiedAt ? new Date(conn.lastVerifiedAt) : null,
      lastSuccessfulRequestAt: conn.lastSuccessfulRequestAt ? new Date(conn.lastSuccessfulRequestAt) : null,
      lastImportAttemptAt: conn.lastImportAttemptAt ? new Date(conn.lastImportAttemptAt) : null,
      authorizedEndpointsJson: JSON.stringify(conn.authorizedEndpoints),
      rateLimitRemaining: conn.rateLimitRemaining,
      parsedSeriesCount: conn.parsedSeriesCount,
      failedImportCount: conn.failedImportCount,
      metadataJson: JSON.stringify(conn.metadata),
    },
    update: {
      status: conn.status,
      label: conn.label,
      lastVerifiedAt: conn.lastVerifiedAt ? new Date(conn.lastVerifiedAt) : null,
      lastSuccessfulRequestAt: conn.lastSuccessfulRequestAt ? new Date(conn.lastSuccessfulRequestAt) : null,
      lastImportAttemptAt: conn.lastImportAttemptAt ? new Date(conn.lastImportAttemptAt) : null,
      authorizedEndpointsJson: JSON.stringify(conn.authorizedEndpoints),
      rateLimitRemaining: conn.rateLimitRemaining,
      parsedSeriesCount: conn.parsedSeriesCount,
      failedImportCount: conn.failedImportCount,
      metadataJson: JSON.stringify(conn.metadata),
    },
  });
}

export async function ensureConnections(): Promise<void> {
  const existing = await connectionRecord("fixture");
  if (!existing) {
    await upsertConnection({
      provider: "fixture",
      status: "connected",
      label: "Seriesight Demo Fixture Dataset",
      lastVerifiedAt: new Date().toISOString(),
      lastSuccessfulRequestAt: new Date().toISOString(),
      lastImportAttemptAt: null,
      authorizedEndpoints: ["local://fixtures/demo-dataset"],
      rateLimitRemaining: null,
      parsedSeriesCount: FIXTURE_INFO.seriesCount,
      failedImportCount: 0,
      metadata: {
        datasetId: FIXTURE_INFO.datasetId,
        label: FIXTURE_INFO.label,
        games: FIXTURE_INFO.gameCount,
        deterministicSeed: FIXTURE_INFO.seed,
        note: "Illustrative fixture data. Not actual Cloud9 performance and not an official GRID dataset.",
      },
    });
  }
  if (identityContext.getStore()?.kind !== "coach") return;
  const grid = await connectionRecord("grid");
  if (!grid) {
    await upsertConnection({
      provider: "grid",
      status: "not_configured",
      label: "GRID Central Data (Open Access)",
      lastVerifiedAt: null,
      lastSuccessfulRequestAt: null,
      lastImportAttemptAt: null,
      authorizedEndpoints: AUTHORIZED_ENDPOINTS,
      rateLimitRemaining: null,
      parsedSeriesCount: 0,
      failedImportCount: 0,
      metadata: {
        authHeader: "x-api-key (server-side only)",
        note: "Configure GRID_API_KEY in the server environment, then run Verify Connection.",
        commercialNote: "GRID Open Access is limited to non-commercial learning and experimentation.",
      },
    });
  }
}

export async function dataSourcesOverview(): Promise<{
  connections: DataSourceConnection[];
  circuit: { state: string; failures: number; failureThreshold: number };
  staticData: { version: string; source: string; warnings: string[]; fetchedAt: string };
  jobs: IngestionJob[];
}> {
  await ensureConnections();
  const fixture = await connectionRecord("fixture");
  const grid = await connectionRecord("grid");
  const staticData = await resolveStaticData();
  return {
    connections: [fixture, grid].filter(Boolean) as DataSourceConnection[],
    circuit: circuitSnapshot(),
    staticData: {
      version: staticData.version,
      source: staticData.source,
      warnings: staticData.warnings,
      fetchedAt: staticData.fetchedAt,
    },
    jobs: jobStore().slice(0, 12),
  };
}

/**
 * Import an explicit official completed series. Missing access never falls through
 * into fixture success. Reimport replaces the same workspace/series atomically.
 */
export async function runImport(provider: "fixture" | "grid", targetSeriesId?: string): Promise<IngestionJob> {
  await requireWorkspaceRole("coach");
  await ensureConnections();
  const job: IngestionJob = {
    id: `job-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e5).toString(36)}`,
    provider,
    jobType: "series_import",
    status: "running",
    stage: "connecting",
    attempts: 1,
    seriesCount: 0,
    gameCount: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  const store = jobStore();
  store.unshift(job);
  store.splice(100);

  const finish = (patch: Partial<IngestionJob>) => {
    Object.assign(job, patch, { completedAt: new Date().toISOString() });
  };

  try {
    if (provider === "grid") {
      if (!targetSeriesId) throw new GridError("INVALID_QUERY", "Provide an explicit completed GRID seriesId; automatic discovery is not enabled.");
      job.stage = "retrieving_metadata";
      const history = await fetchGridHistoricalSeries(targetSeriesId);
      job.stage = "normalizing";
      await persistGridHistoricalSeries(history);
      job.stage = "verifying_results";
      const persisted = await getHistoricalSeries();
      const conn = await connectionRecord("grid");
      if (conn) await upsertConnection({ ...conn, status: "connected", parsedSeriesCount: persisted.length,
        lastImportAttemptAt: job.createdAt, lastSuccessfulRequestAt: new Date().toISOString() });
      finish({ status: "succeeded", seriesCount: 1, gameCount: history.games.length });
      return job;
    }
    job.stage = "validating_payloads";
    if (FIXTURE_GAMES.some((g) => g.draft.picks.length !== 10 || g.draft.bans.length !== 10)) throw new Error("Fixture draft validation failed.");
    const target = targetSeriesId ? FIXTURE_SERIES.filter((s) => s.id === targetSeriesId) : FIXTURE_SERIES.filter((s) => s.status === "completed");
    if (!target.length) throw new Error("No fixture series matched the requested ID.");
    finish({
      status: "succeeded",
      stage: "verifying_results",
      seriesCount: target.length,
      gameCount: target.reduce((s, x) => s + x.gameIds.length, 0),
    });
    return job;
  } catch (err) {
    const code = err instanceof GridError ? err.code : "UNAVAILABLE";
    finish({ status: "failed", lastError: provider === "grid" ? `GRID_${code}: Historical import failed; verify credentials, entitlement, series completeness and account schema.` : "Fixture import failed validation or no series matched." });
    if (provider === "grid") {
      const conn = await connectionRecord("grid");
      const status = code === "CREDENTIAL_MISSING" ? "not_configured" : ["UNAUTHORIZED", "FORBIDDEN"].includes(code) ? "access_denied" : code === "RATE_LIMITED" ? "rate_limited" : ["INVALID_SCHEMA", "INVALID_QUERY", "PARTIAL_GAME_DATA"].includes(code) ? "schema_mismatch" : "temporarily_unavailable";
      if (conn) await upsertConnection({ ...conn, status, lastImportAttemptAt: job.createdAt, failedImportCount: conn.failedImportCount + 1 });
    }
    return job;
  }
}

export async function verifyGridConnection(): Promise<{ status: string; detail: string }> {
  await requireWorkspaceRole("coach");
  await ensureConnections();
  const probe = await probeGrid();
  const grid = await connectionRecord("grid");
  if (grid) {
    await upsertConnection({
      ...grid,
      status: probe.status as DataSourceConnection["status"],
      lastVerifiedAt: new Date().toISOString(),
      lastSuccessfulRequestAt: probe.lastSuccessfulRequestAt,
    });
  }
  return probe;
}

export async function recentJobs(): Promise<IngestionJob[]> {
  return jobStore().slice(0, 12);
}
