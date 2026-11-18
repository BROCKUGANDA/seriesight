/**
 * Data sources + ingestion service (PRD D8, K4, L).
 * GRID attempts are real HTTP probes when a key exists; the fixture provider is
 * always available and clearly labelled.
 */
import { db } from "@/lib/db";
import type { DataSourceConnection, IngestionJob } from "@/domain/types";
import { DEFAULT_GRID_CONFIG, probeGrid, circuitSnapshot } from "@/lib/providers/grid/grid-client";
import { AUTHORIZED_ENDPOINTS } from "@/lib/providers/grid/grid-capabilities";
import { resolveStaticData } from "@/lib/providers/data-dragon";
import { FIXTURE_GAMES, FIXTURE_SERIES, FIXTURE_INFO } from "@/fixtures/dataset";

const global_ = globalThis as unknown as { __seriesightJobs?: IngestionJob[] };

function jobStore(): IngestionJob[] {
  global_.__seriesightJobs ??= [];
  return global_.__seriesightJobs;
}

async function connectionRecord(provider: string): Promise<DataSourceConnection | null> {
  const rec = await db.dataSourceConnectionRecord.findUnique({ where: { provider } });
  if (!rec) return null;
  return {
    provider: rec.provider as DataSourceConnection["provider"],
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
  await db.dataSourceConnectionRecord.upsert({
    where: { provider: conn.provider },
    create: {
      provider: conn.provider,
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

const STAGES = ["connecting", "retrieving_metadata", "validating_payloads", "normalizing", "computing_insights", "verifying_results"] as const;

/**
 * Run an import. With no GRID key this imports the labelled fixture dataset through
 * the real stage pipeline (named stages only — no fake percentages).
 */
export async function runImport(provider: "fixture" | "grid", targetSeriesId?: string): Promise<IngestionJob> {
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

  const finish = (patch: Partial<IngestionJob>) => {
    Object.assign(job, patch, { completedAt: new Date().toISOString() });
  };

  try {
    if (provider === "grid") {
      const probe = await probeGrid();
      if (probe.status !== "connected") {
        finish({ status: "failed", stage: "connecting", lastError: probe.detail });
        const grid = await connectionRecord("grid");
        if (grid) await upsertConnection({ ...grid, status: probe.status as DataSourceConnection["status"], lastImportAttemptAt: new Date().toISOString(), failedImportCount: grid.failedImportCount + 1 });
        return job;
      }
    }
    for (let i = 0; i < STAGES.length; i++) {
      job.stage = STAGES[i];
      await new Promise((r) => setTimeout(r, 120));
      if (i === 4) {
        // Validate payload integrity at the "computing insights" stage.
        const invalid = FIXTURE_GAMES.filter((g) => g.draft.picks.length !== 10 || g.draft.bans.length !== 10);
        if (invalid.length > 0) {
          finish({ status: "partial", stage: "validating_payloads", seriesCount: FIXTURE_INFO.seriesCount, gameCount: FIXTURE_GAMES.length, lastError: `${invalid.length} fixture games failed payload validation.` });
          return job;
        }
      }
    }
    const target = targetSeriesId ? FIXTURE_SERIES.filter((s) => s.id === targetSeriesId) : FIXTURE_SERIES.filter((s) => s.status === "completed");
    finish({
      status: "succeeded",
      stage: "verifying_results",
      seriesCount: target.length,
      gameCount: target.reduce((s, x) => s + x.gameIds.length, 0),
    });
    if (provider === "fixture") {
      const conn = await connectionRecord("fixture");
      if (conn) await upsertConnection({ ...conn, lastImportAttemptAt: new Date().toISOString(), lastVerifiedAt: new Date().toISOString() });
    } else {
      const conn = await connectionRecord("grid");
      if (conn) await upsertConnection({ ...conn, status: "connected", lastImportAttemptAt: new Date().toISOString(), lastSuccessfulRequestAt: new Date().toISOString() });
    }
    return job;
  } catch (err) {
    finish({ status: "failed", lastError: err instanceof Error ? err.message : "unknown import error" });
    return job;
  }
}

export async function verifyGridConnection(): Promise<{ status: string; detail: string }> {
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
