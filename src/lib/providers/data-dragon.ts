/**
 * Data Dragon static-data adapter (PRD G5).
 *
 * Strategy: attempt version discovery from the live static-data service; on any
 * failure fall back to the bundled snapshot (champion catalogue in
 * src/fixtures/champions.ts) so the app always works offline. The data layer
 * distinguishes current metadata version vs match patch and warns on mismatch.
 */
import type { Champion } from "@/domain/types";
import { CHAMPIONS } from "@/fixtures/champions";

export const DATA_DRAGON_BASE = "https://ddragon.leagueoflegends.com";
export const STATIC_DATA_TIMEOUT_MS = 6_000;

export interface StaticDataSnapshot {
  /** Live Data Dragon version when reachable; bundled fallback version otherwise. */
  version: string;
  source: "datadragon" | "curated-fallback";
  champions: Champion[];
  fetchedAt: string;
  warnings: string[];
}

const FALLBACK_VERSION = "bundled-2026-11";

const cache: { snapshot: StaticDataSnapshot | null } = { snapshot: null };

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Data Dragon responded ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve the static-data snapshot for an optional match patch.
 * - version discovery: /api/versions.json
 * - patch mismatch is reported, not silently accepted.
 */
export async function resolveStaticData(matchPatch?: string, forceRefresh = false): Promise<StaticDataSnapshot> {
  if (!forceRefresh && cache.snapshot) {
    return withMatchWarning(cache.snapshot, matchPatch);
  }
  const warnings: string[] = [];
  let version = FALLBACK_VERSION;
  let source: StaticDataSnapshot["source"] = "curated-fallback";
  try {
    const versions = await fetchJson<string[]>(`${DATA_DRAGON_BASE}/api/versions.json`, STATIC_DATA_TIMEOUT_MS);
    if (Array.isArray(versions) && versions.length > 0) {
      version = versions[0];
      source = "datadragon";
    } else {
      warnings.push("Data Dragon versions.json returned no versions; using bundled champion metadata.");
    }
  } catch (err) {
    warnings.push(
      `Data Dragon unreachable (${err instanceof Error ? err.message : "unknown"}); using bundled champion metadata. Champion identity remains accurate; no artwork is redistributed.`,
    );
  }
  cache.snapshot = {
    version,
    source,
    champions: CHAMPIONS.map((c) =>
      source === "datadragon" ? { ...c, metadataSource: "datadragon" as const } : c,
    ),
    fetchedAt: new Date().toISOString(),
    warnings,
  };
  return withMatchWarning(cache.snapshot, matchPatch);
}

function withMatchWarning(snapshot: StaticDataSnapshot, matchPatch?: string): StaticDataSnapshot {
  if (!matchPatch) return snapshot;
  if (snapshot.source === "datadragon" && !matchPatch.startsWith(snapshot.version.split(".")[0])) {
    return {
      ...snapshot,
      warnings: [
        ...snapshot.warnings,
        `Match patch ${matchPatch} predates static-data version ${snapshot.version}; historical metadata may differ.`,
      ],
    };
  }
  return snapshot;
}

export function bundledChampions(): Champion[] {
  return CHAMPIONS;
}
