import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@/lib/db";
import { currentWorkspace, identityContext } from "@/lib/auth";
import { requireWorkspaceRole } from "@/services/organizations";
import type { Game, Series } from "@/domain/types";
import { FIXTURE_GAMES, FIXTURE_INFO, FIXTURE_SERIES } from "@/fixtures/dataset";
import { CHAMPIONS } from "@/fixtures/champions";
import { historicalSeriesSchema, type GridHistoricalSeries } from "@/lib/providers/grid/grid-history";
import { GridError } from "@/lib/providers/grid/grid-types";

export const gridConnectionKey = (): string => `grid:${encodeURIComponent(currentWorkspace())}`;
const historyPrefix = (): string => `grid-history:${encodeURIComponent(currentWorkspace())}:`;

/** Policy fields remain unknown rather than being asserted to be standard draft. */
export type DatasetSeries = Omit<Series, "fearless" | "fearlessScope"> & {
  fearless: Series["fearless"] | null;
  fearlessScope: Series["fearlessScope"] | null;
};
export interface SelectedDataset {
  provider: "fixture" | "grid";
  datasetId: string;
  label: string;
  games: Game[];
  series: DatasetSeries[];
  historicalSeries: GridHistoricalSeries[];
  warnings: string[];
}
const datasetContext = new AsyncLocalStorage<{ workspaceId: string; dataset: SelectedDataset }>();
const canonical = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const championNames = new Map(CHAMPIONS.flatMap((c) => [[canonical(c.id), c.id], [canonical(c.canonicalName), c.id], [canonical(c.displayName), c.id]]));

export function gridHistoryToDataset(history: GridHistoricalSeries[]): SelectedDataset {
  const games: Game[] = [];
  const series: DatasetSeries[] = [];
  const warnings = [...new Set(history.flatMap((h) => h.warnings))];
  for (const h of history) {
    const seriesId = `grid:${h.seriesId}`;
    for (const g of h.games) {
      const picks = g.picks.map((p) => ({ ...p, championId: championNames.get(canonical(p.championName)) }));
      const bans = g.bans.map((b) => ({ ...b, championId: championNames.get(canonical(b.championName)) }));
      if (g.durationSec === null || picks.some((p) => !p.role || !p.championId) || bans.some((b) => !b.championId)) {
        warnings.push(`GRID game ${g.id} is retained in historicalSeries but excluded from legacy Game analytics: duration, explicit roles, or canonical champion identity unavailable.`);
        continue;
      }
      const id = `${seriesId}:${g.id}`;
      games.push({ id, seriesId, gameNumber: g.gameNumber, patch: h.patch ?? "unknown", startedAt: h.startedAt,
        durationSec: g.durationSec, blueTeamId: `grid:${g.blueTeamId}`, redTeamId: `grid:${g.redTeamId}`,
        winnerTeamId: `grid:${g.winnerTeamId}`, blueWin: g.winnerTeamId === g.blueTeamId,
        draft: { firstPickSide: picks[0].side,
          picks: picks.map((p) => ({ championId: p.championId!, teamId: `grid:${p.teamId}`, playerId: p.playerId ? `grid:${p.playerId}` : null, role: p.role!, order: p.order, side: p.side })),
          bans: bans.map((b) => ({ championId: b.championId!, teamId: `grid:${b.teamId}`, order: b.order, side: b.side })),
        }, events: [], coverage: { objectives: false, draft: true, players: picks.every((p) => p.playerId !== null), macroIntervals: false },
        sourceProvider: "grid", sourceDatasetId: h.datasetId,
      });
    }
    series.push({ id: seriesId, tournamentId: `grid:${h.tournament.id}`, patch: h.patch ?? "unknown", startedAt: h.startedAt,
      format: h.format, status: "completed", teamAId: `grid:${h.teams[0].id}`, teamBId: `grid:${h.teams[1].id}`,
      winnerTeamId: `grid:${h.winnerTeamId}`, gameIds: games.filter((g) => g.seriesId === seriesId).map((g) => g.id),
      fearless: null, fearlessScope: null,
    });
  }
  return { provider: "grid", datasetId: "grid:workspace", label: "Licensed GRID historical data — private workspace", games, series, historicalSeries: history, warnings };
}

/** Durable normalized data only. Call only when the operator's licence permits retention. */
export async function persistGridHistoricalSeries(input: GridHistoricalSeries): Promise<void> {
  await requireWorkspaceRole("coach");
  const history = historicalSeriesSchema.parse(input);
  const provider = `${historyPrefix()}${encodeURIComponent(history.seriesId)}`;
  const metadataJson = JSON.stringify(history);
  if (Buffer.byteLength(metadataJson) > 2_000_000) throw new GridError("INVALID_SCHEMA", "GRID normalized series exceeds the storage limit.");
  await db.dataSourceConnectionRecord.upsert({ where: { provider },
    create: { provider, status: "connected", label: "Private GRID normalized historical series", metadataJson },
    update: { status: "connected", metadataJson },
  });
}

/** Identity-selected persisted history for prediction. Demo sessions never query GRID rows. */
export async function getHistoricalSeries(): Promise<GridHistoricalSeries[]> {
  currentWorkspace();
  if (identityContext.getStore()?.kind !== "coach") return [];
  const records = await db.dataSourceConnectionRecord.findMany({ where: { provider: { startsWith: historyPrefix() } }, orderBy: { provider: "asc" } });
  return records.map((r) => {
    try { return historicalSeriesSchema.parse(JSON.parse(r.metadataJson)); }
    catch { throw new GridError("INVALID_SCHEMA", "Stored GRID historical data failed validation; reimport the affected series."); }
  });
}

export async function loadSelectedDataset(): Promise<SelectedDataset> {
  const workspaceId = currentWorkspace();
  const cached = datasetContext.getStore();
  if (cached?.workspaceId === workspaceId) return cached.dataset;
  const history = await getHistoricalSeries();
  if (history.length) return gridHistoryToDataset(history);
  return { provider: "fixture", datasetId: FIXTURE_INFO.datasetId, label: FIXTURE_INFO.label,
    games: FIXTURE_GAMES, series: FIXTURE_SERIES, historicalSeries: [],
    warnings: ["Illustrative fixture fallback. Not actual team performance or an official GRID dataset."],
  };
}

/** Handler hydration hook. Invoke INSIDE identityContext.run; never mutate fixture indexes. */
export async function withSelectedDataset<T>(callback: (dataset: SelectedDataset) => T | Promise<T>): Promise<T> {
  const workspaceId = currentWorkspace();
  const dataset = await loadSelectedDataset();
  return datasetContext.run({ workspaceId, dataset }, () => callback(dataset));
}

/** Synchronous request snapshot for an analytics constructor after handler hydration. */
export function selectedDataset(): SelectedDataset | undefined {
  const current = datasetContext.getStore();
  return current?.workspaceId === currentWorkspace() ? current.dataset : undefined;
}