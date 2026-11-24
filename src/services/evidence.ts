/**
 * Evidence service — workspace and dataset scoped evidence records.
 * Records are deterministic (same inputs → same id), so lookups recompute the
 * canonical contexts on a cache miss instead of failing.
 */
import type { EvidenceRecord } from "@/domain/types";
import { EvidenceLedger } from "@/domain/evidence/builder";
import { ScoutingContext, buildInsights, analyticsDataset, datasetTeams } from "@/domain/analytics/scouting-context";
import { identityContext } from "@/lib/auth";
import { createHash } from "node:crypto";

const registries = new Map<string, { fingerprint: string; records: Map<string, EvidenceRecord> }>();

function registry(): Map<string, EvidenceRecord> {
  const dataset = analyticsDataset();
  const workspaceId = identityContext.getStore()?.workspaceId ?? "ws-demo";
  const fingerprint = dataset.provider === "fixture" ? dataset.datasetId
    : createHash("sha256").update(JSON.stringify(dataset.historicalSeries)).digest("hex");
  let scope = registries.get(workspaceId);
  if (!scope || scope.fingerprint !== fingerprint) {
    scope = { fingerprint, records: new Map() };
    registries.set(workspaceId, scope);
  }
  return scope.records;
}

function harvest(): void {
  for (const team of datasetTeams()) {
    const ctx = new ScoutingContext(team.id);
    const insights = buildInsights(ctx);
    for (const insight of insights) {
      const rec = ctx.ledger.get(insight.evidenceId);
      if (rec) rec.insightId = insight.id;
    }
    for (const rec of ctx.ledger.all()) {
      if (!registry().has(rec.id)) registry().set(rec.id, rec);
    }
  }
}

export function registerLedgerRecords(ledger: EvidenceLedger): void {
  const dataset = analyticsDataset();
  for (const rec of ledger.all()) {
    if (rec.provider !== dataset.provider) continue;
    if (rec.provider === "grid") {
      rec.datasetId = dataset.datasetId;
      rec.ingestedAt = dataset.historicalSeries.map((s) => s.fetchedAt).sort().at(-1)!;
      rec.limitations = [dataset.label, ...dataset.warnings, ...rec.limitations.filter((s) => !/fixture|synthetic/i.test(s))];
    }
    if (!registry().has(rec.id)) registry().set(rec.id, rec);
  }
}

export function getEvidence(evidenceId: string): EvidenceRecord | null {
  const found = registry().get(evidenceId);
  if (found) return found;
  harvest();
  return registry().get(evidenceId) ?? null;
}

export function listEvidence(): EvidenceRecord[] {
  if (registry().size < 10) harvest();
  return [...registry().values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** The number of distinct evidence records currently resolvable. */
export function evidenceCount(): number {
  if (registry().size < 10) harvest();
  return registry().size;
}
